const prisma = require('../utils/database');
const { AppError, ErrorCodes } = require('../utils/AppError');
const notificationService = require('./notificationService');
const { canTransition } = require('../utils/swapStateMachine');
const { validateSwapEligibility } = require('../utils/conflictValidator');

class SwapService {
  /**
   * Create a new shift swap request (Step 1: Requester submits)
   */
  async createRequest(requesterId, data) {
    const { targetUserId, date, reason } = data;

    if (!date) throw new AppError('Tanggal wajib diisi.', 400, 'DATE_REQUIRED');

    const swapDate = new Date(date);
    swapDate.setUTCHours(0, 0, 0, 0);

    if (isNaN(swapDate.getTime())) {
      throw new AppError('Format tanggal tidak valid.', 400, 'INVALID_DATE');
    }

    // Validate future date
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    if (swapDate < today) {
      throw new AppError('Tidak dapat mengajukan tukar shift untuk tanggal yang sudah lewat.', 400, 'PAST_DATE');
    }

    // RESERVED: system validation slot
    const targetId = parseInt(targetUserId);
    if (isNaN(targetId)) throw new AppError('ID karyawan tujuan tidak valid.', 400, 'INVALID_TARGET');

    // Run full eligibility check
    const { valid, errors } = await validateSwapEligibility(requesterId, targetId, swapDate);
    if (!valid) {
      throw new AppError(errors.join(' '), 409, 'SWAP_CONFLICT');
    }

    // Check same shift: bandingkan shift JADWAL HARIAN (UserSchedule) pada tanggal swap,
    // bukan shift tetap dari profil user (user.shiftId)
    const requester = await prisma.user.findUnique({ where: { id: requesterId }, select: { shiftId: true } });
    const target = await prisma.user.findUnique({ where: { id: targetId }, select: { shiftId: true, isActive: true } });

    if (!requester || !target || !target.isActive) {
      throw new AppError('Karyawan tujuan tidak tersedia.', 400, 'TARGET_UNAVAILABLE');
    }

    // Ambil jadwal kedua karyawan pada tanggal yang diminta
    const [requesterSchedule, targetSchedule] = await Promise.all([
      prisma.userSchedule.findFirst({ where: { userId: requesterId, date: swapDate } }),
      prisma.userSchedule.findFirst({ where: { userId: targetId, date: swapDate } }),
    ]);

    if (!requesterSchedule || !targetSchedule) {
      throw new AppError('Salah satu karyawan tidak memiliki jadwal pada tanggal tersebut.', 400, 'SCHEDULE_NOT_FOUND');
    }

    // Tukar shift bermakna jika shift jadwal harian berbeda, atau salah satu libur
    if (requesterSchedule.isOffDay && targetSchedule.isOffDay) {
      throw new AppError('Keduanya libur pada tanggal tersebut, tidak perlu tukar shift.', 400, 'BOTH_OFF');
    }

    if (!requesterSchedule.isOffDay && !targetSchedule.isOffDay && requesterSchedule.shiftId === targetSchedule.shiftId) {
      throw new AppError('Shift jadwal Anda dan karyawan tujuan sama pada tanggal tersebut. Tukar shift hanya bisa dilakukan antar shift berbeda.', 400, 'SAME_SHIFT');
    }

    // Cleanup stuck swaps before creating new one
    await this.cleanupStuckSwaps();

    // Create the request - system validates immediately
    const swap = await prisma.shiftSwap.create({
      data: {
        requesterId,
        targetUserId: targetId,
        date: swapDate,
        reason: reason || null,
        status: 'PENDING_VALIDATION',
      },
      include: {
        requester: { select: { fullName: true } },
        target: { select: { fullName: true } },
      },
    });

    // Auto-validate (system passes it to PENDING_TARGET_RESPONSE)
    await this.systemValidate(swap.id);

    // Reload with updated status
    const updatedSwap = await prisma.shiftSwap.findUnique({
      where: { id: swap.id },
      include: {
        requester: { select: { fullName: true } },
        target: { select: { fullName: true } },
      },
    });

    return updatedSwap;
  }

  /**
   * Cleanup swaps stuck in PENDING_VALIDATION for more than 1 hour
   */
  async cleanupStuckSwaps() {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const stuckSwaps = await prisma.shiftSwap.findMany({
      where: {
        status: 'PENDING_VALIDATION',
        createdAt: { lt: oneHourAgo },
      },
    });

    for (const swap of stuckSwaps) {
      await prisma.shiftSwap.update({
        where: { id: swap.id },
        data: {
          status: 'CANCELLED',
          rejectionNote: 'Dibatalkan otomatis: sistem gagal memvalidasi pengajuan.',
        },
      });
      console.log(`[SwapService] Auto-cancelled stuck swap #${swap.id}`);
    }

    // Also cancel past swaps that are still pending
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const pastSwaps = await prisma.shiftSwap.findMany({
      where: {
        status: { in: ['PENDING_VALIDATION', 'PENDING_TARGET_RESPONSE', 'PENDING_APPROVAL'] },
        date: { lt: today },
      },
    });

    for (const swap of pastSwaps) {
      await prisma.shiftSwap.update({
        where: { id: swap.id },
        data: {
          status: 'CANCELLED',
          rejectionNote: 'Dibatalkan otomatis: tanggal pengajuan sudah lewat.',
        },
      });
      console.log(`[SwapService] Auto-cancelled past swap #${swap.id}`);
    }
  }

  /**
   * System auto-validation (Step 2: System validates after creation)
   */
  async systemValidate(swapId) {
    const swap = await prisma.shiftSwap.findUnique({
      where: { id: swapId },
      include: {
        requester: { select: { shiftId: true } },
        target: { select: { shiftId: true, isActive: true, fullName: true } },
      },
    });

    if (!swap) throw ErrorCodes.RESOURCE_NOT_FOUND;

    const transition = canTransition(swap.status, 'SYSTEM_VALIDATE');
    if (!transition.valid) {
      throw new Error(transition.error);
    }

    // Re-validate eligibility at this stage too (fresh from DB)
    const { valid, errors } = await validateSwapEligibility(swap.requesterId, swap.targetUserId, swap.date);
    if (!valid) {
      // Auto-reject by system
      // NOTE: kolom rejection_note di DB terbatas VARCHAR(191), potong agar tidak error 500
      const note = errors.join(' ').slice(0, 191);
      await prisma.shiftSwap.update({
        where: { id: swapId },
        data: {
          status: 'REJECTED_BY_SYSTEM',
          rejectionNote: note,
        },
      });

      await notificationService.create(
        swap.requesterId,
        'Tukar Shift Ditolak Otomatis',
        `Pengajuan tukar shift pada ${swap.date.toLocaleDateString('id-ID')} ditolak sistem: ${errors.join(' ')}`,
        'SHIFT_SWAP_REJECTED'
      );

      throw new Error(errors.join(' '));
    }

    // System passes → notify target
    await prisma.shiftSwap.update({
      where: { id: swapId },
      data: { status: transition.nextStatus },
    });

    await notificationService.create(
      swap.targetUserId,
      'Permintaan Tukar Shift Baru',
      `${swap.requester.fullName} ingin bertukar shift dengan Anda pada ${swap.date.toLocaleDateString('id-ID')}. Silakan respons.`,
      'SHIFT_SWAP'
    );
  }

  /**
   * Target employee responds (accept/reject) - Step 3
   */
  async respondToRequest(swapId, targetUserId, action) {
    const swap = await prisma.shiftSwap.findUnique({
      where: { id: parseInt(swapId) },
      include: {
        requester: { select: { id: true, fullName: true } },
        target: { select: { id: true, fullName: true } },
      },
    });

    if (!swap) throw ErrorCodes.RESOURCE_NOT_FOUND;
    if (swap.targetUserId !== targetUserId) {
      throw new AppError('Anda bukan karyawan yang dituju dalam pengajuan ini.', 403, 'FORBIDDEN');
    }

    const stateAction = action === 'ACCEPT' ? 'TARGET_ACCEPT' : 'TARGET_REJECT';
    const transition = canTransition(swap.status, stateAction);

    if (!transition.valid) {
      throw new Error(transition.error);
    }

    const now = new Date();

    if (action === 'REJECT') {
      await prisma.shiftSwap.update({
        where: { id: parseInt(swapId) },
        data: {
          status: transition.nextStatus,
          rejectionNote: 'Ditolak oleh karyawan tujuan.'.slice(0, 191),
          respondedAt: now,
        },
      });

      await notificationService.create(
        swap.requesterId,
        'Tukar Shift Ditolak',
        `${swap.target.fullName} menolak permintaan tukar shift Anda pada ${swap.date.toLocaleDateString('id-ID')}.`,
        'SHIFT_SWAP_REJECTED'
      );

      return { status: transition.nextStatus, message: 'Pengajuan ditolak.' };
    }

    // ACCEPT → move to PENDING_APPROVAL
    await prisma.shiftSwap.update({
      where: { id: parseInt(swapId) },
      data: {
        status: transition.nextStatus,
        respondedAt: now,
      },
    });

    // Notify requester
    await notificationService.create(
      swap.requesterId,
      'Tukar Shift Disetujui Rekan',
      `${swap.target.fullName} menyetujui permintaan tukar shift Anda. Menunggu persetujuan admin.`,
      'SHIFT_SWAP'
    );

    // Notify admins
    const admins = await prisma.user.findMany({ where: { role: { in: ['ADMIN', 'OWNER'] }, isActive: true } });
    for (const admin of admins) {
      await notificationService.create(
        admin.id,
        'Persetujuan Tukar Shift Diperlukan',
        `${swap.requester.fullName} dan ${swap.target.fullName} menunggu persetujuan tukar shift pada ${swap.date.toLocaleDateString('id-ID')}.`,
        'SHIFT_SWAP_ADMIN'
      );
    }

    return { status: transition.nextStatus, message: 'Pengajuan disetujui, menunggu admin.' };
  }

  /**
   * Admin approves or rejects - Step 4
   */
  async approveByAdmin(swapId, adminId, action) {
    const swap = await prisma.shiftSwap.findUnique({
      where: { id: parseInt(swapId) },
      include: {
        requester: { select: { id: true, fullName: true, shiftId: true } },
        target: { select: { id: true, fullName: true, shiftId: true } },
      },
    });

    if (!swap) throw ErrorCodes.RESOURCE_NOT_FOUND;

    const stateAction = action === 'APPROVE' ? 'ADMIN_APPROVE' : 'ADMIN_REJECT';
    const transition = canTransition(swap.status, stateAction);

    if (!transition.valid) {
      throw new Error(transition.error);
    }

    const now = new Date();

    if (action === 'REJECT') {
      await prisma.shiftSwap.update({
        where: { id: parseInt(swapId) },
        data: {
          status: transition.nextStatus,
          rejectionNote: 'Ditolak oleh admin.',
          approverId: adminId,
          approvedAt: now,
        },
      });

      await notificationService.create(
        swap.requesterId,
        'Tukar Shift Ditolak Admin',
        `Permintaan tukar shift Anda pada ${swap.date.toLocaleDateString('id-ID')} ditolak oleh admin.`,
        'SHIFT_SWAP_REJECTED'
      );

      await notificationService.create(
        swap.targetUserId,
        'Tukar Shift Ditolak Admin',
        `Permintaan tukar shift pada ${swap.date.toLocaleDateString('id-ID')} ditolak oleh admin.`,
        'SHIFT_SWAP_REJECTED'
      );

      return { status: transition.nextStatus, message: 'Pengajuan ditolak oleh admin.' };
    }

    // APPROVE - update schedules
    // Ambil jadwal HARIAN (UserSchedule) kedua pihak pada tanggal swap,
    // BUKAN shift tetap profil (user.shiftId), agar konsisten dengan validasi
    // dan tidak mengganggu mekanisme jadwal berjalan.
    const [requesterSched, targetSched] = await Promise.all([
      prisma.userSchedule.findFirst({ where: { userId: swap.requesterId, date: swap.date } }),
      prisma.userSchedule.findFirst({ where: { userId: swap.targetUserId, date: swap.date } }),
    ]);

    // Nilai jadwal harian yang akan ditukar (fallback ke shift profil jika jadwal harian tidak ada)
    const reqSched = {
      shiftId: requesterSched ? requesterSched.shiftId : swap.requester.shiftId,
      isOffDay: requesterSched ? requesterSched.isOffDay : false,
    };
    const tgtSched = {
      shiftId: targetSched ? targetSched.shiftId : swap.target.shiftId,
      isOffDay: targetSched ? targetSched.isOffDay : false,
    };

    await prisma.$transaction(async (tx) => {
      // 1. Update swap status
      await tx.shiftSwap.update({
        where: { id: parseInt(swapId) },
        data: {
          status: transition.nextStatus,
          approverId: adminId,
          approvedAt: now,
        },
      });

      // 2. Swap jadwal HARIAN (UserSchedule) untuk tanggal tsb.
      // Requester mendapat jadwal target, target mendapat jadwal requester.
      // isOffDay ikut ditukar agar konsisten dengan jadwal sebenarnya.
      await tx.userSchedule.upsert({
        where: {
          userId_date: {
            userId: swap.requesterId,
            date: swap.date,
          },
        },
        update: {
          shiftId: tgtSched.shiftId,
          isOffDay: tgtSched.isOffDay,
        },
        create: {
          userId: swap.requesterId,
          date: swap.date,
          shiftId: tgtSched.shiftId,
          isOffDay: tgtSched.isOffDay,
        },
      });

      await tx.userSchedule.upsert({
        where: {
          userId_date: {
            userId: swap.targetUserId,
            date: swap.date,
          },
        },
        update: {
          shiftId: reqSched.shiftId,
          isOffDay: reqSched.isOffDay,
        },
        create: {
          userId: swap.targetUserId,
          date: swap.date,
          shiftId: reqSched.shiftId,
          isOffDay: reqSched.isOffDay,
        },
      });
    });

    // Notify both parties
    await notificationService.create(
      swap.requesterId,
      'Tukar Shift Disetujui',
      `Permintaan tukar shift Anda dengan ${swap.target.fullName} pada ${swap.date.toLocaleDateString('id-ID')} telah DISETUJUI.`,
      'SHIFT_SWAP_APPROVED'
    );

    await notificationService.create(
      swap.targetUserId,
      'Tukar Shift Disetujui',
      `Tukar shift antara Anda dan ${swap.requester.fullName} pada ${swap.date.toLocaleDateString('id-ID')} telah DISETUJUI.`,
      'SHIFT_SWAP_APPROVED'
    );

    return { status: transition.nextStatus, message: 'Tukar shift berhasil disetujui dan jadwal telah diupdate.' };
  }

  /**
   * Requester cancels before target responds - Step: Cancel
   */
  async cancelRequest(swapId, requesterId) {
    const swap = await prisma.shiftSwap.findUnique({
      where: { id: parseInt(swapId) },
      include: {
        target: { select: { fullName: true } },
        requester: { select: { fullName: true } },
      },
    });

    if (!swap) throw ErrorCodes.RESOURCE_NOT_FOUND;
    if (swap.requesterId !== requesterId) {
      throw new AppError('Hanya pemohon yang dapat membatalkan pengajuan.', 403, 'FORBIDDEN');
    }

    const transition = canTransition(swap.status, 'REQUESTER_CANCEL');
    if (!transition.valid) {
      throw new Error(transition.error);
    }

    await prisma.shiftSwap.update({
      where: { id: parseInt(swapId) },
      data: { status: transition.nextStatus },
    });

    await notificationService.create(
      swap.targetUserId,
      'Permintaan Tukar Shift Dibatalkan',
      `${swap.requester.fullName} membatalkan permintaan tukar shift pada ${swap.date.toLocaleDateString('id-ID')}.`,
      'SHIFT_SWAP_CANCELLED'
    );

    return { status: transition.nextStatus, message: 'Pengajuan dibatalkan.' };
  }

  /**
   * Get swaps for a specific user
   */
  async getUserSwaps(userId, filters = {}) {
    const where = {
      OR: [
        { requesterId: userId },
        { targetUserId: userId },
      ],
    };

    if (filters.status) where.status = filters.status;

    return await prisma.shiftSwap.findMany({
      where,
      include: {
        requester: { select: { id: true, fullName: true, employeeId: true } },
        target: { select: { id: true, fullName: true, employeeId: true } },
        approver: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get all swaps (admin only)
   */
  async getAllSwaps(filters = {}) {
    const where = {};
    if (filters.status) where.status = filters.status;

    return await prisma.shiftSwap.findMany({
      where,
      include: {
        requester: { select: { id: true, fullName: true, employeeId: true } },
        target: { select: { id: true, fullName: true, employeeId: true } },
        approver: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get swaps that need target's response
   */
  async getPendingTargetResponse(userId) {
    return await prisma.shiftSwap.findMany({
      where: {
        targetUserId: userId,
        status: 'PENDING_TARGET_RESPONSE',
      },
      include: {
        requester: { select: { id: true, fullName: true, employeeId: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get swaps that need admin approval
   */
  async getPendingAdminApproval() {
    return await prisma.shiftSwap.findMany({
      where: { status: 'PENDING_APPROVAL' },
      include: {
        requester: { select: { id: true, fullName: true, employeeId: true } },
        target: { select: { id: true, fullName: true, employeeId: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get active swap for a user on a given date (for attendance resolution)
   */
  async getActiveSwap(userId, date) {
    const checkDate = new Date(date);
    checkDate.setUTCHours(0, 0, 0, 0);

    const swap = await prisma.shiftSwap.findFirst({
      where: {
        date: checkDate,
        status: 'APPROVED',
        OR: [
          { requesterId: userId },
          { targetUserId: userId },
        ],
      },
      include: {
        requester: { include: { shift: true } },
        target: { include: { shift: true } },
      },
    });

    if (!swap) return null;

    if (swap.requesterId === userId) {
      return swap.target.shift;
    } else {
      return swap.requester.shift;
    }
  }
}

module.exports = new SwapService();