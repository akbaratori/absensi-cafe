const prisma = require('../utils/database');
const { ErrorCodes } = require('../utils/AppError');
const notificationService = require('./notificationService');
const rotationService = require('./rotationService');
const { canTransition } = require('../utils/swapStateMachine');
const { checkEmployeeScheduleConflict } = require('../utils/conflictValidator');

class OffDayService {
  /**
   * Create an off-day swap request (Step 1: Requester submits)
   */
  async createRequest(requesterId, data) {
    const { targetUserId, offDate, workDate, reason } = data;

    if (!offDate || !workDate) throw new Error('Tanggal libur dan tanggal kerja wajib diisi.');

    const offDateObj = new Date(offDate);
    offDateObj.setUTCHours(0, 0, 0, 0);
    const workDateObj = new Date(workDate);
    workDateObj.setUTCHours(0, 0, 0, 0);

    if (isNaN(offDateObj.getTime()) || isNaN(workDateObj.getTime())) {
      throw new Error('Format tanggal tidak valid.');
    }

    // Validate future dates
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    if (offDateObj < today || workDateObj < today) {
      throw new Error('Tidak dapat mengajukan tukar libur untuk tanggal yang sudah lewat.');
    }

    const targetId = parseInt(targetUserId);
    if (isNaN(targetId)) throw new Error('ID karyawan tujuan tidak valid.');

    if (requesterId === targetId) {
      throw new Error('Tidak dapat bertukar dengan diri sendiri.');
    }

    // Verify target exists and is active
    const target = await prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, fullName: true, isActive: true },
    });
    if (!target || !target.isActive) {
      throw new Error('Karyawan tujuan tidak tersedia.');
    }

    // Dynamic fallback checking: try UserSchedule table first, if missing fallback to rotationService
    const isUserOffDayOnDate = async (userId, dateObj) => {
      const dbSched = await prisma.userSchedule.findUnique({
        where: { userId_date: { userId, date: dateObj } },
      });
      if (dbSched) return dbSched.isOffDay;

      // Fallback: Check generated rotation
      const isoStr = dateObj.toISOString().slice(0, 10);
      const year = dateObj.getUTCFullYear();
      const month = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
      const monthStr = `${year}-${month}`;
      const offEntries = await rotationService.getAllOffDayEntries(monthStr);
      return offEntries.some(o => o.userId === userId && o.date === isoStr);
    };

    const requesterIsOff = await isUserOffDayOnDate(requesterId, offDateObj);
    if (!requesterIsOff) {
      throw new Error(`Anda tidak memiliki jadwal libur pada ${offDateObj.toLocaleDateString('id-ID')}.`);
    }

    const targetIsOffOnWorkDate = await isUserOffDayOnDate(targetId, workDateObj);
    if (!targetIsOffOnWorkDate) {
      throw new Error(`${target.fullName} tidak memiliki jadwal libur pada ${workDateObj.toLocaleDateString('id-ID')}.`);
    }

    const requesterIsOffOnWorkDate = await isUserOffDayOnDate(requesterId, workDateObj);
    if (requesterIsOffOnWorkDate) {
      throw new Error(`Anda tidak memiliki jadwal kerja pada ${workDateObj.toLocaleDateString('id-ID')}.`);
    }

    const targetIsOffOnOffDate = await isUserOffDayOnDate(targetId, offDateObj);
    if (targetIsOffOnOffDate) {
      throw new Error(`${target.fullName} tidak memiliki jadwal kerja pada ${offDateObj.toLocaleDateString('id-ID')}.`);
    }

    // Run conflict validators (sebelum record dibuat)
    const requesterOffConflict = await checkEmployeeScheduleConflict(requesterId, workDateObj);
    const requesterWorkConflict = await checkEmployeeScheduleConflict(requesterId, offDateObj);
    const targetOffConflict = await checkEmployeeScheduleConflict(targetId, workDateObj);
    const targetWorkConflict = await checkEmployeeScheduleConflict(targetId, offDateObj);

    const conflicts = [];
    if (requesterOffConflict.hasConflict) conflicts.push(`Pemohon (tanggal ${workDateObj.toLocaleDateString('id-ID')}): ${requesterOffConflict.reason}`);
    if (requesterWorkConflict.hasConflict) conflicts.push(`Pemohon (tanggal ${offDateObj.toLocaleDateString('id-ID')}): ${requesterWorkConflict.reason}`);
    if (targetOffConflict.hasConflict) conflicts.push(`Karyawan tujuan (tanggal ${workDateObj.toLocaleDateString('id-ID')}): ${targetOffConflict.reason}`);
    if (targetWorkConflict.hasConflict) conflicts.push(`Karyawan tujuan (tanggal ${offDateObj.toLocaleDateString('id-ID')}): ${targetWorkConflict.reason}`);

    if (conflicts.length > 0) {
      throw new Error(conflicts.join(' | '));
    }

    // Create with initial validation status
    const request = await prisma.offDayRequest.create({
      data: {
        userId: requesterId,
        targetUserId: targetId,
        offDate: offDateObj,
        workDate: workDateObj,
        reason: reason || null,
        status: 'PENDING_VALIDATION',
      },
      include: {
        user: { select: { fullName: true } },
        target: { select: { fullName: true } },
      },
    });

    // System auto-validate — passing ID request agar tidak memicu self-conflict dengan record yang baru dibuat
    const validation = await this.systemValidate(request.id);

    const updated = await prisma.offDayRequest.findUnique({
      where: { id: request.id },
      include: {
        user: { select: { fullName: true } },
        target: { select: { fullName: true } },
      },
    });

    // Propagate rejection info ke caller agar controller bisa return 422
    if (validation?.rejected) {
      const err = new Error(validation.reason);
      err.requestData = updated;
      err.isBusinessRejection = true;
      throw err;
    }

    return updated;
  }

  /**
   * System auto-validation (after creation)
   */
  async systemValidate(requestId) {
    const req = await prisma.offDayRequest.findUnique({
      where: { id: requestId },
      include: {
        user: { select: { fullName: true, id: true } },
        target: { select: { fullName: true, id: true, isActive: true } },
      },
    });

    if (!req) throw ErrorCodes.RESOURCE_NOT_FOUND;

    const transition = canTransition(req.status, 'SYSTEM_VALIDATE');
    if (!transition.valid) {
      throw new Error(transition.error);
    }

    // Revalidate conflicts fresh from DB with excludeOffDayId = requestId agar tidak self-conflict
    const requesterOffConflict = await checkEmployeeScheduleConflict(req.userId, req.workDate, null, requestId);
    const requesterWorkConflict = await checkEmployeeScheduleConflict(req.userId, req.offDate, null, requestId);
    const targetOffConflict = await checkEmployeeScheduleConflict(req.targetUserId, req.workDate, null, requestId);
    const targetWorkConflict = await checkEmployeeScheduleConflict(req.targetUserId, req.offDate, null, requestId);

    const conflicts = [];
    if (requesterOffConflict.hasConflict) conflicts.push(requesterOffConflict.reason);
    if (requesterWorkConflict.hasConflict) conflicts.push(requesterWorkConflict.reason);
    if (targetOffConflict.hasConflict) conflicts.push(targetOffConflict.reason);
    if (targetWorkConflict.hasConflict) conflicts.push(targetWorkConflict.reason);

    if (conflicts.length > 0) {
      await prisma.offDayRequest.update({
        where: { id: requestId },
        data: {
          status: 'REJECTED_BY_SYSTEM',
          // NOTE: kolom rejection_note di DB terbatas VARCHAR(191), potong agar tidak error 500
          rejectionNote: conflicts.join(' | ').slice(0, 191),
        },
      });

      await notificationService.create(
        req.userId,
        'Tukar Libur Ditolak Otomatis',
        `Pengajuan tukar libur Anda ditolak sistem: ${conflicts.join(' | ')}`,
        'OFFDAY_REJECTED'
      );

      // Jangan throw — return info rejection agar createRequest bisa return normally
      return { rejected: true, reason: conflicts.join(' | ') };
    }

    // System passes → notify target
    await prisma.offDayRequest.update({
      where: { id: requestId },
      data: { status: transition.nextStatus },
    });

    await notificationService.create(
      req.targetUserId,
      'Permintaan Tukar Libur Baru',
      `${req.user.fullName} ingin bertukar libur dengan Anda. Silakan respons.`,
      'OFFDAY'
    );
  }

  /**
   * Target employee responds (accept/reject) - Step 2
   */
  async respondToRequest(requestId, targetUserId, action) {
    const req = await prisma.offDayRequest.findUnique({
      where: { id: parseInt(requestId) },
      include: {
        user: { select: { id: true, fullName: true } },
        target: { select: { id: true, fullName: true } },
      },
    });

    if (!req) throw ErrorCodes.RESOURCE_NOT_FOUND;
    if (req.targetUserId !== targetUserId) {
      throw new Error('Anda bukan karyawan yang dituju dalam pengajuan ini.');
    }

    const stateAction = action === 'ACCEPT' ? 'TARGET_ACCEPT' : 'TARGET_REJECT';
    const transition = canTransition(req.status, stateAction);

    if (!transition.valid) {
      throw new Error(transition.error);
    }

    const now = new Date();

    if (action === 'REJECT') {
      await prisma.offDayRequest.update({
        where: { id: parseInt(requestId) },
        data: {
          status: transition.nextStatus,
          rejectionNote: 'Ditolak oleh karyawan tujuan.',
          respondedAt: now,
        },
      });

      await notificationService.create(
        req.userId,
        'Tukar Libur Ditolak',
        `${req.target.fullName} menolak permintaan tukar libur Anda.`,
        'OFFDAY_REJECTED'
      );

      return { status: transition.nextStatus, message: 'Permintaan tukar libur berhasil ditolak.' };
    }

    // Target ACCEPT -> update status & timestamp, then notify requester & admin
    await prisma.offDayRequest.update({
      where: { id: parseInt(requestId) },
      data: {
        status: transition.nextStatus,
        respondedAt: now,
      },
    });

    await notificationService.create(
      req.userId,
      'Tukar Libur Disetujui Rekan',
      `${req.target.fullName} menyetujui permintaan tukar libur Anda. Menunggu persetujuan Admin/Manager.`,
      'OFFDAY'
    );

    // Notify all active Admin/Manager
    const admins = await prisma.user.findMany({
      where: { role: { in: ['ADMIN', 'MANAGER'] }, isActive: true },
      select: { id: true },
    });
    for (const admin of admins) {
      await notificationService.create(
        admin.id,
        'Persetujuan Tukar Libur Diperlukan',
        `${req.user.fullName} dan ${req.target.fullName} mengajukan tukar libur. Silakan tinjau.`,
        'OFFDAY_ADMIN_APPROVAL'
      );
    }

    return { status: transition.nextStatus, message: 'Permintaan berhasil disetujui, menunggu persetujuan Admin/Manager.' };
  }

  /**
   * Admin approves or rejects - Step 3
   */
  async approveByAdmin(requestId, adminUserId, action) {
    const req = await prisma.offDayRequest.findUnique({
      where: { id: parseInt(requestId) },
      include: {
        user: { select: { id: true, fullName: true } },
        target: { select: { id: true, fullName: true } },
      },
    });

    if (!req) throw ErrorCodes.RESOURCE_NOT_FOUND;

    const stateAction = action === 'APPROVE' ? 'ADMIN_APPROVE' : 'ADMIN_REJECT';
    const transition = canTransition(req.status, stateAction);

    if (!transition.valid) {
      throw new Error(transition.error);
    }

    const now = new Date();

    if (action === 'REJECT') {
      await prisma.offDayRequest.update({
        where: { id: parseInt(requestId) },
        data: {
          status: transition.nextStatus,
          rejectionNote: 'Ditolak oleh Admin/Manager.',
          approverId: adminUserId,
          approvedAt: now,
        },
      });

      await notificationService.create(
        req.userId,
        'Tukar Libur Ditolak Admin',
        'Permintaan tukar libur Anda ditolak oleh Admin/Manager.',
        'OFFDAY_REJECTED'
      );

      await notificationService.create(
        req.targetUserId,
        'Tukar Libur Ditolak Admin',
        'Permintaan tukar libur yang Anda setujui ditolak oleh Admin/Manager.',
        'OFFDAY_REJECTED'
      );

      return { status: transition.nextStatus, message: 'Permintaan tukar libur ditolak.' };
    }

    // Apply schedule changes using transaction with upsert for safety
    await prisma.$transaction(async (tx) => {
      // 1. Get shift IDs for requester and target (from User.shiftId or default)
      const requesterUser = await tx.user.findUnique({ where: { id: req.userId }, select: { shiftId: true } });
      const targetUser = await tx.user.findUnique({ where: { id: req.targetUserId }, select: { shiftId: true } });

      const requesterDefaultShift = requesterUser?.shiftId || 1;
      const targetDefaultShift = targetUser?.shiftId || 1;

      // Fetch existing schedules if any
      const [reqOffDateSched, reqWorkDateSched, targetOffDateSched, targetWorkDateSched] = await Promise.all([
        tx.userSchedule.findUnique({ where: { userId_date: { userId: req.userId, date: req.offDate } } }),
        tx.userSchedule.findUnique({ where: { userId_date: { userId: req.userId, date: req.workDate } } }),
        tx.userSchedule.findUnique({ where: { userId_date: { userId: req.targetUserId, date: req.offDate } } }),
        tx.userSchedule.findUnique({ where: { userId_date: { userId: req.targetUserId, date: req.workDate } } }),
      ]);

      // Determine shifts when swapping off-days:
      // offDate: Requester originally OFF, Target originally WORK.
      // After swap: Requester WORKS on offDate (taking Target's shift), Target is OFF on offDate.
      // workDate: Target originally OFF, Requester originally WORK.
      // After swap: Target WORKS on workDate (taking Requester's shift), Requester is OFF on workDate.
      const shiftForRequesterOnOffDate = targetOffDateSched?.shiftId || requesterDefaultShift;
      const shiftForTargetOnWorkDate = reqWorkDateSched?.shiftId || targetDefaultShift;

      // 1. Requester on offDate: isOffDay = false (Requester works replacing Target)
      await tx.userSchedule.upsert({
        where: { userId_date: { userId: req.userId, date: req.offDate } },
        update: { isOffDay: false, shiftId: shiftForRequesterOnOffDate, isManualOverride: true },
        create: { userId: req.userId, date: req.offDate, isOffDay: false, shiftId: shiftForRequesterOnOffDate, isManualOverride: true },
      });

      // 2. Target on offDate: isOffDay = true (Target gets Requester's off-day)
      await tx.userSchedule.upsert({
        where: { userId_date: { userId: req.targetUserId, date: req.offDate } },
        update: { isOffDay: true, isManualOverride: true },
        create: { userId: req.targetUserId, date: req.offDate, isOffDay: true, isManualOverride: true },
      });

      // 3. Requester on workDate: isOffDay = true (Requester gets Target's off-day)
      await tx.userSchedule.upsert({
        where: { userId_date: { userId: req.userId, date: req.workDate } },
        update: { isOffDay: true, isManualOverride: true },
        create: { userId: req.userId, date: req.workDate, isOffDay: true, isManualOverride: true },
      });

      // 4. Target on workDate: isOffDay = false (Target works replacing Requester)
      await tx.userSchedule.upsert({
        where: { userId_date: { userId: req.targetUserId, date: req.workDate } },
        update: { isOffDay: false, shiftId: shiftForTargetOnWorkDate, isManualOverride: true },
        create: { userId: req.targetUserId, date: req.workDate, isOffDay: false, shiftId: shiftForTargetOnWorkDate, isManualOverride: true },
      });

      // Update OffDayRequest status
      await tx.offDayRequest.update({
        where: { id: parseInt(requestId) },
        data: {
          status: transition.nextStatus,
          approverId: adminUserId,
          approvedAt: now,
        },
      });
    });

    await notificationService.create(
      req.userId,
      'Tukar Libur Disetujui',
      'Permintaan tukar libur Anda telah DISETUJUI. Jadwal telah diperbarui.',
      'OFFDAY_APPROVED'
    );

    await notificationService.create(
      req.targetUserId,
      'Tukar Libur Disetujui',
      'Tukar libur telah DISETUJUI. Jadwal Anda telah diperbarui.',
      'OFFDAY_APPROVED'
    );

    return { status: transition.nextStatus, message: 'Tukar libur berhasil disetujui dan jadwal telah diupdate.' };
  }

  /**
   * Requester cancels
   */
  async cancelRequest(requestId, requesterId) {
    const req = await prisma.offDayRequest.findUnique({
      where: { id: parseInt(requestId) },
      include: {
        user: { select: { fullName: true } },
        target: { select: { fullName: true } },
      },
    });

    if (!req) throw ErrorCodes.RESOURCE_NOT_FOUND;
    if (req.userId !== requesterId) {
      throw new Error('Hanya pemohon yang dapat membatalkan pengajuan.');
    }

    const transition = canTransition(req.status, 'REQUESTER_CANCEL');
    if (!transition.valid) {
      throw new Error(transition.error);
    }

    await prisma.offDayRequest.update({
      where: { id: parseInt(requestId) },
      data: { status: transition.nextStatus },
    });

    await notificationService.create(
      req.targetUserId,
      'Permintaan Tukar Libur Dibatalkan',
      `${req.user.fullName} membatalkan permintaan tukar libur.`,
      'OFFDAY_CANCELLED'
    );

    return { status: transition.nextStatus, message: 'Pengajuan dibatalkan.' };
  }

  async getUserRequests(userId, filters = {}) {
    const where = {
      OR: [
        { userId: userId },
        { targetUserId: userId },
      ],
    };
    if (filters.status) where.status = filters.status;

    return await prisma.offDayRequest.findMany({
      where,
      include: {
        user: { select: { id: true, fullName: true, employeeId: true } },
        target: { select: { id: true, fullName: true, employeeId: true } },
        approver: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getAllRequests(filters = {}) {
    const where = {};
    if (filters.status) where.status = filters.status;

    return await prisma.offDayRequest.findMany({
      where,
      include: {
        user: { select: { id: true, fullName: true, employeeId: true } },
        target: { select: { id: true, fullName: true, employeeId: true } },
        approver: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getPendingTargetResponse(userId) {
    return await prisma.offDayRequest.findMany({
      where: { targetUserId: userId, status: 'PENDING_TARGET_RESPONSE' },
      include: {
        user: { select: { id: true, fullName: true, employeeId: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getPendingAdminApproval() {
    return await prisma.offDayRequest.findMany({
      where: { status: 'PENDING_APPROVAL' },
      include: {
        user: { select: { id: true, fullName: true, employeeId: true } },
        target: { select: { id: true, fullName: true, employeeId: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}

module.exports = new OffDayService();
