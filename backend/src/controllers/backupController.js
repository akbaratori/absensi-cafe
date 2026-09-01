const prisma = require('../utils/database');
const { successResponse } = require('../utils/response');
const { AppError } = require('../utils/AppError');

// Deteksi error Prisma akibat kolom shift_number belum dimigrasikan.
// P2022 = "The column does not exist in the current database."
const isMissingShiftColumn = (err) =>
  err?.code === 'P2022' ||
  /shift_number|Unknown column/i.test(err?.message || '');

/**
 * BackupController
 * Mengelola assignment backup ketika staff libur/tidak hadir.
 *
 * Aturan:
 * - Jika backup dari dept KITCHEN → hapus jadwal dapur (WeeklySchedule & UserSchedule) hari itu
 * - Jika backup dari dept BAR atau lainnya → jadwal tetap normal
 */
class BackupController {

  /**
   * GET /rotation/backups?date=YYYY-MM-DD
   * Ambil semua backup assignment untuk tanggal tertentu beserta data user
   */
  async listBackups(req, res, next) {
    try {
      const { date } = req.query;
      if (!date) throw new AppError('Parameter date wajib diisi', 400, 'VALIDATION_ERROR');

      const dateObj = new Date(`${date}T00:00:00Z`);

      let backups;
      try {
        backups = await prisma.backupAssignment.findMany({
          where: { date: dateObj },
          orderBy: { createdAt: 'asc' },
        });
      } catch (err) {
        // Jika kolom shift_number belum dimigrasikan, fallback tanpa kolom itu
        // agar halaman tetap berfungsi (bukan 500 total).
        if (isMissingShiftColumn(err)) {
          console.warn('[backup] Kolom shift_number belum ada — jalankan prisma migrate deploy. Fallback tanpa shift.');
          backups = await prisma.backupAssignment.findMany({
            where: { date: dateObj },
            orderBy: { createdAt: 'asc' },
            select: {
              id: true, date: true, absentUserId: true, backupUserId: true,
              absentPositionId: true, backupUserOriginalDepartment: true,
              notes: true, createdAt: true,
            },
          });
        } else {
          throw err;
        }
      }

      // Ambil detail user untuk absent dan backup
      const userIds = [...new Set([
        ...backups.map(b => b.absentUserId),
        ...backups.map(b => b.backupUserId),
      ])];

      const users = userIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, fullName: true, department: true },
          })
        : [];
      const userMap = new Map(users.map(u => [u.id, u]));

      // Ambil detail posisi
      const positionIds = [...new Set(backups.map(b => b.absentPositionId))];
      const positions = positionIds.length > 0
        ? await prisma.position.findMany({
            where: { id: { in: positionIds } },
            select: { id: true, name: true },
          })
        : [];
      const posMap = new Map(positions.map(p => [p.id, p]));

      const enriched = backups.map(b => ({
        ...b,
        absentUser: userMap.get(b.absentUserId) || null,
        backupUser: userMap.get(b.backupUserId) || null,
        absentPosition: posMap.get(b.absentPositionId) || null,
      }));

      return successResponse(res, 200, enriched, 'Data backup berhasil dimuat');
    } catch (err) {
      console.error('[backup] listBackups gagal:', err?.code, err?.message);
      next(err);
    }
  }

  /**
   * POST /rotation/backups
   * Body: { date, absentUserId, backupUserId, absentPositionId, notes? }
   *
   * Jika backup user dari KITCHEN:
   *   - Hapus WeeklySchedule yang berhubungan (berdasarkan userId + weekStart)
   *   - Tandai UserSchedule isOffDay=true untuk hari itu (agar tidak muncul di jadwal dapur)
   */
  async createBackup(req, res, next) {
    try {
      const { date, absentUserId, backupUserId, absentPositionId, shiftNumber, notes } = req.body;

      if (!date || !absentUserId || !backupUserId || !absentPositionId) {
        throw new AppError('Field date, absentUserId, backupUserId, absentPositionId wajib diisi', 400, 'VALIDATION_ERROR');
      }

      // Shift yang membutuhkan backup (default 1). Bisa 2 jika backup diambil dari shift 1.
      const shiftNum = parseInt(shiftNumber) || 1;

      const dateObj = new Date(`${date}T00:00:00Z`);

      // Cek tidak boleh backup diri sendiri
      if (parseInt(absentUserId) === parseInt(backupUserId)) {
        throw new AppError('Staff tidak bisa membackup diri sendiri', 400, 'VALIDATION_ERROR');
      }

      // Ambil info backup user
      const backupUser = await prisma.user.findUnique({
        where: { id: parseInt(backupUserId) },
        select: { id: true, fullName: true, department: true, isActive: true },
      });
      if (!backupUser || !backupUser.isActive) {
        throw new AppError('Staff backup tidak ditemukan atau tidak aktif', 404, 'NOT_FOUND');
      }

      // Cek absent user ada
      const absentUser = await prisma.user.findUnique({
        where: { id: parseInt(absentUserId) },
        select: { id: true, fullName: true, department: true },
      });
      if (!absentUser) throw new AppError('Staff yang libur tidak ditemukan', 404, 'NOT_FOUND');

      // Cek posisi ada
      const position = await prisma.position.findUnique({
        where: { id: parseInt(absentPositionId) },
      });
      if (!position) throw new AppError('Posisi tidak ditemukan', 404, 'NOT_FOUND');

      // Upsert backup assignment
      const existing = await prisma.backupAssignment.findUnique({
        where: { date_absentUserId: { date: dateObj, absentUserId: parseInt(absentUserId) } },
      });

      let backup;
      if (existing) {
        // Batalkan efek backup lama dulu jika backup user berbeda
        if (existing.backupUserId !== parseInt(backupUserId)) {
          await this._revertKitchenBackup(existing.backupUserId, dateObj);
        }
        backup = await prisma.backupAssignment.update({
          where: { id: existing.id },
          data: {
            backupUserId: parseInt(backupUserId),
            absentPositionId: parseInt(absentPositionId),
            shiftNumber: shiftNum,
            backupUserOriginalDepartment: backupUser.department,
            notes: notes || null,
          },
        });
        // Bersihkan jobdesk backup dari backup user lama (jika ada).
        if (existing.backupUserId !== parseInt(backupUserId)) {
          await this._clearBackupJobdesk(existing.backupUserId, dateObj);
        }
      } else {
        backup = await prisma.backupAssignment.create({
          data: {
            date: dateObj,
            absentUserId: parseInt(absentUserId),
            backupUserId: parseInt(backupUserId),
            absentPositionId: parseInt(absentPositionId),
            shiftNumber: shiftNum,
            backupUserOriginalDepartment: backupUser.department,
            notes: notes || null,
          },
        });
      }

      // Jika backup user dari KITCHEN → hapus dari jadwal dapur hari itu
      if (backupUser.department === 'KITCHEN') {
        await this._removeFromKitchenSchedule(parseInt(backupUserId), dateObj);
      }

      // Berikan jobdesk yang dicover kepada backup user: salin kitchenStation
      // milik staff yang absen pada tanggal itu ke UserSchedule backup user,
      // sehingga jobdesk-nya tampil di UI jadwal.
      await this._assignBackupJobdesk(parseInt(backupUserId), parseInt(absentUserId), dateObj);

      return successResponse(res, 201, {
        ...backup,
        absentUser,
        backupUser,
        absentPosition: position,
      }, 'Backup berhasil ditambahkan');
    } catch (err) {
      next(err);
    }
  }

  /**
   * DELETE /rotation/backups/:id
   * Batalkan backup — jika backup user dari KITCHEN, kembalikan ke jadwal dapur
   */
  async deleteBackup(req, res, next) {
    try {
      const id = parseInt(req.params.id);
      const backup = await prisma.backupAssignment.findUnique({ where: { id } });
      if (!backup) throw new AppError('Backup tidak ditemukan', 404, 'NOT_FOUND');

      // Jika backup user dari KITCHEN, kembalikan ke jadwal dapur
      if (backup.backupUserOriginalDepartment === 'KITCHEN') {
        await this._revertKitchenBackup(backup.backupUserId, backup.date);
      }

      // Bersihkan jobdesk backup yang sebelumnya ditempel ke backup user
      await this._clearBackupJobdesk(backup.backupUserId, backup.date);

      await prisma.backupAssignment.delete({ where: { id } });

      return successResponse(res, 200, null, 'Backup berhasil dibatalkan');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Salin jobdesk (kitchenStation) milik staff yang absen ke UserSchedule
   * backup user untuk tanggal itu, sehingga jobdesk yang dicover tampil
   * di UI jadwal. Jika staff absen tidak punya jobdesk, tidak melakukan apa-apa.
   */
  async _assignBackupJobdesk(backupUserId, absentUserId, dateObj) {
    try {
      const absentSchedule = await prisma.userSchedule.findUnique({
        where: { userId_date: { userId: absentUserId, date: dateObj } },
        select: { kitchenStation: true },
      });
      const jobdesk = absentSchedule?.kitchenStation || null;
      if (!jobdesk) return; // posisi tidak punya jobdesk / belum dirotasi

      const existing = await prisma.userSchedule.findUnique({
        where: { userId_date: { userId: backupUserId, date: dateObj } },
        select: { id: true },
      });
      if (existing) {
        await prisma.userSchedule.update({
          where: { id: existing.id },
          data: { kitchenStation: jobdesk },
        });
      } else {
        await prisma.userSchedule.create({
          data: {
            userId: backupUserId,
            date: dateObj,
            isOffDay: false,
            kitchenStation: jobdesk,
            isManualOverride: true, // lindungi dari overwrite saat regenerate
          },
        });
      }
    } catch (err) {
      // Jangan gagalkan proses backup hanya karena penempelan jobdesk gagal
      console.warn('[backup] Gagal menempelkan jobdesk ke backup user:', err?.message);
    }
  }

  /**
   * Hapus kitchenStation milik backup user untuk tanggal itu, HANYA jika
   * row-nya adalah hasil backup (isManualOverride). Row asli hasil rotasi
   * (mis. jadwal asal KITCHEN yang di-revert) tidak disentuh.
   */
  async _clearBackupJobdesk(backupUserId, dateObj) {
    try {
      await prisma.userSchedule.updateMany({
        where: { userId: backupUserId, date: dateObj, isManualOverride: true },
        data: { kitchenStation: null },
      });
    } catch (err) {
      console.warn('[backup] Gagal membersihkan jobdesk backup:', err?.message);
    }
  }

  /**
   * Hapus WeeklySchedule untuk backup user dari KITCHEN pada hari tersebut.
   * Juga tandai UserSchedule sebagai off-day untuk hari itu.
   */
  async _removeFromKitchenSchedule(userId, dateObj) {
    // Hitung weekStart (Monday UTC) dari dateObj
    const day = dateObj.getUTCDay(); // 0=Sun
    const diff = day === 0 ? -6 : 1 - day;
    const weekStart = new Date(dateObj);
    weekStart.setUTCDate(dateObj.getUTCDate() + diff);
    weekStart.setUTCHours(0, 0, 0, 0);

    // Hapus dari WeeklySchedule minggu itu
    await prisma.weeklySchedule.deleteMany({
      where: { userId, weekStart },
    });

    // Tandai UserSchedule sebagai off-day untuk hari itu
    await prisma.userSchedule.upsert({
      where: { userId_date: { userId, date: dateObj } },
      update: { isOffDay: true, isManualOverride: true },
      create: {
        userId,
        date: dateObj,
        isOffDay: true,
        isManualOverride: true,
      },
    });
  }

  /**
   * Kembalikan WeeklySchedule untuk backup user dari KITCHEN.
   * Regenerasi dari posisi dapur yang dia ikuti.
   */
  async _revertKitchenBackup(userId, dateObj) {
    // Hapus flag off-day dari UserSchedule
    await prisma.userSchedule.updateMany({
      where: { userId, date: dateObj, isManualOverride: true },
      data: { isOffDay: false, isManualOverride: false },
    });

    // Hitung weekStart
    const day = dateObj.getUTCDay();
    const diff = day === 0 ? -6 : 1 - day;
    const weekStart = new Date(dateObj);
    weekStart.setUTCDate(dateObj.getUTCDate() + diff);
    weekStart.setUTCHours(0, 0, 0, 0);

    // Cari apakah user ada di roster posisi mana untuk minggu itu
    const roster = await prisma.positionRoster.findFirst({
      where: { userId },
      include: { position: true },
    });

    if (roster) {
      // Periksa apakah WeeklySchedule untuk minggu itu sudah ada
      const existing = await prisma.weeklySchedule.findUnique({
        where: { positionId_weekStart_userId: { positionId: roster.positionId, weekStart, userId } },
      });
      if (!existing) {
        // Kembalikan ke jadwal mingguan
        await prisma.weeklySchedule.create({
          data: {
            positionId: roster.positionId,
            weekStart,
            userId,
            shiftNumber: roster.shiftNumber || 1,
            isGenerated: true,
          },
        }).catch(() => {}); // abaikan jika sudah ada
      }
    }
  }

  /**
   * GET /rotation/backup-candidates?date=YYYY-MM-DD&absentPositionId=N
   * Kembalikan daftar staff yang bisa jadi backup:
   * - Semua staff aktif kecuali yang sedang dijadwalkan di posisi absent itu
   * - Dibagi per department
   */
  async getBackupCandidates(req, res, next) {
    try {
      const { date, absentPositionId, shiftNumber } = req.query;
      if (!date) throw new AppError('Parameter date wajib diisi', 400, 'VALIDATION_ERROR');

      const dateObj = new Date(`${date}T00:00:00Z`);
      const shiftNum = parseInt(shiftNumber) || 1;

      // Hitung weekStart
      const day = dateObj.getUTCDay();
      const diff = day === 0 ? -6 : 1 - day;
      const weekStart = new Date(dateObj);
      weekStart.setUTCDate(dateObj.getUTCDate() + diff);
      weekStart.setUTCHours(0, 0, 0, 0);

      // Ambil semua user aktif
      const allUsers = await prisma.user.findMany({
        where: { isActive: true, role: 'EMPLOYEE' },
        select: { id: true, fullName: true, department: true },
        orderBy: { fullName: 'asc' },
      });

      // Cari user yang sedang dijadwalkan di posisi absent minggu ini (beserta shift-nya)
      const scheduledInPosition = absentPositionId
        ? await prisma.weeklySchedule.findMany({
            where: { positionId: parseInt(absentPositionId), weekStart },
            select: { userId: true, shiftNumber: true },
          })
        : [];

      // User yang terjadwal di posisi yang sama PADA SHIFT YANG SAMA tidak bisa jadi backup.
      // User di posisi yang sama tapi BEDA SHIFT (misal shift 1 saat shift 2 butuh backup)
      // TETAP BISA jadi backup — inilah pengkondisian "ambil dari shift 1".
      const scheduledUserIds = new Set(
        scheduledInPosition
          .filter(s => (s.shiftNumber || 1) === shiftNum)
          .map(s => s.userId)
      );

      // User di posisi yang sama tapi shift lebih awal (lebih kecil) → diprioritaskan.
      const earlierShiftUserIds = new Set(
        scheduledInPosition
          .filter(s => (s.shiftNumber || 1) < shiftNum)
          .map(s => s.userId)
      );

      // Pisahkan kandidat
      const candidates = allUsers
        .filter(u => !scheduledUserIds.has(u.id))
        .map(u => ({
          id: u.id,
          fullName: u.fullName,
          department: u.department,
          // Tandai jika user sedang ada di WeeklySchedule posisi lain
        }));

      // Cek apakah kandidat punya jadwal di posisi lain minggu ini
      const candidateIds = candidates.map(c => c.id);
      const otherSchedules = candidateIds.length > 0
        ? await prisma.weeklySchedule.findMany({
            where: { userId: { in: candidateIds }, weekStart },
            select: {
              userId: true,
              positionId: true,
              position: { select: { name: true } },
            },
          })
        : [];
      const scheduleByUser = new Map();
      for (const s of otherSchedules) {
        scheduleByUser.set(s.userId, {
          name: s.position?.name || 'Posisi lain',
          positionId: s.positionId,
        });
      }

      const enriched = candidates.map(c => ({
        ...c,
        currentPosition: scheduleByUser.get(c.id)?.name || null,
        currentPositionId: scheduleByUser.get(c.id)?.positionId || null,
        isFromKitchen: c.department === 'KITCHEN',
        // Prioritas: user yang terjadwal di posisi yang sama pada shift lebih awal.
        // Berguna saat shift 2 butuh backup → kandidat dari shift 1 posisi yang sama.
        isSamePositionEarlierShift: earlierShiftUserIds.has(c.id),
        samePositionEarlierShiftNumber: earlierShiftUserIds.has(c.id)
          ? (scheduledInPosition.find(s => s.userId === c.id)?.shiftNumber || 1)
          : null,
      }));

      // Urutkan: kandidat prioritas (shift lebih awal di posisi yang sama) di atas.
      enriched.sort((a, b) =>
        (b.isSamePositionEarlierShift ? 1 : 0) - (a.isSamePositionEarlierShift ? 1 : 0)
      );

      return successResponse(res, 200, enriched, 'Kandidat backup berhasil dimuat');
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new BackupController();
