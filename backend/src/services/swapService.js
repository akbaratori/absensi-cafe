const prisma = require('../utils/database');
const { ErrorCodes } = require('../utils/AppError');
const notificationService = require('./notificationService');
const { canTransition } = require('../utils/swapStateMachine');
const { validateSwapEligibility } = require('../utils/conflictValidator');

class SwapService {
  /**
   * Create a new shift swap request (Step 1: Requester submits)
   */
  async createRequest(requesterId, data) {
    const { targetUserId, date, reason } = data;

    if (!date) throw new Error('Tanggal wajib diisi.');

    const swapDate = new Date(date);
    swapDate.setUTCHours(0, 0, 0, 0);

    if (isNaN(swapDate.getTime())) {
      throw new Error('Format tanggal tidak valid.');
    }

    // Validate future date
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    if (swapDate < today) {
      throw new Error('Tidak dapat mengajukan tukar shift untuk tanggal yang sudah lewat.');
    }

    // RESERVED: system validation slot
    const targetId = parseInt(targetUserId);
    if (isNaN(targetId)) throw new Error('ID karyawan tujuan tidak valid.');

    // Run full eligibility check
    const { valid, errors } = await validateSwapEligibility(requesterId, targetId, swapDate);
    if (!valid) {
      throw new Error(errors.join(' '));
    }

    // Check same shift: bandingkan shift JADWAL HARIAN (UserSchedule) pada tanggal swap,
    // bukan shift tetap dari profil user (user.shiftId)
    const requester = await prisma.user.findUnique({ where: { id: requesterId }, select: { shiftId: true } });
    const target = await prisma.user.findUnique({ where: { id: targetId }, select: { shiftId: true, isActive: true } });

    if (!requester || !target || !target.isActive) {
      throw new Error('Karyawan tujuan tidak tersedia.');
    }

    // Ambil jadwal kedua karyawan pada tanggal yang diminta
    const [requesterSchedule, targetSchedule] = await Promise.all([
      prisma.userSchedule.findFirst({ where: { userId: requesterId, date: swapDate } }),
      prisma.userSchedule.findFirst({ where: { userId: targetId, date: swapDate } }),
    ]);

    if (!requesterSchedule || !targetSchedule) {
      throw new Error('Salah satu karyawan tidak memiliki jadwal pada tanggal tersebut.');
    }

    // Tukar shift bermakna jika shift jadwal harian berbeda, atau salah satu libur
    if (requesterSchedule.isOffDay && targetSchedule.isOffDay) {
      throw new Error('Keduanya libur pada tanggal tersebut, tidak perlu tukar shift.');
    }

    if (!requesterSchedule.isOffDay && !targetSchedule.isOffDay && requesterSchedule.shiftId === targetSchedule.shiftId) {
      throw new Error('Shift jadwal Anda dan karyawan tujuan sama pada tanggal tersebut. Tukar shift hanya bisa dilakukan antar shift berbeda.');
    }

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
      throw new Error('Anda bukan karyawan yang dituju dalam pengajuan ini.');
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

      // 2. Swap shifts in UserSchedule for the given date
      // Requester gets target's shift, target gets requester's shift
      await tx.userSchedule.upsert({
        where: {
          userId_date: {
            userId: swap.requesterId,
            date: swap.date,
          },
        },
        update: {
          shiftId: swap.target.shiftId,
          isOffDay: false,
        },
        create: {
          userId: swap.requesterId,
          date: swap.date,
          shiftId: swap.target.shiftId,
          isOffDay: false,
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
          shiftId: swap.requester.shiftId,
          isOffDay: false,
        },
        create: {
          userId: swap.targetUserId,
          date: swap.date,
          shiftId: swap.requester.shiftId,
          isOffDay: false,
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
      throw new Error('Hanya pemohon yang dapat membatalkan pengajuan.');
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