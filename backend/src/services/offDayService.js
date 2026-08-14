const prisma = require('../utils/database');
const { ErrorCodes } = require('../utils/AppError');
const notificationService = require('./notificationService');
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
    offDateObj.setHours(0, 0, 0, 0);
    const workDateObj = new Date(workDate);
    workDateObj.setHours(0, 0, 0, 0);

    if (isNaN(offDateObj.getTime()) || isNaN(workDateObj.getTime())) {
      throw new Error('Format tanggal tidak valid.');
    }

    // Validate future dates
    const today = new Date();
    today.setHours(0, 0, 0, 0);
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

    // Check requester has off-day on offDate
    const requesterOffSchedule = await prisma.userSchedule.findUnique({
      where: { userId_date: { userId: requesterId, date: offDateObj } },
    });

    if (!requesterOffSchedule || !requesterOffSchedule.isOffDay) {
      throw new Error(`Anda tidak memiliki jadwal libur pada ${offDateObj.toLocaleDateString('id-ID')}.`);
    }

    // Check target has off-day on workDate (the day requester will work for target)
    const targetOffSchedule = await prisma.userSchedule.findUnique({
      where: { userId_date: { userId: targetId, date: workDateObj } },
    });

    if (!targetOffSchedule || !targetOffSchedule.isOffDay) {
      throw new Error(`${target.fullName} tidak memiliki jadwal libur pada ${workDateObj.toLocaleDateString('id-ID')}.`);
    }

    // Check requester works on workDate (a shift is assigned)
    const requesterWorkSchedule = await prisma.userSchedule.findUnique({
      where: { userId_date: { userId: requesterId, date: workDateObj } },
    });
    if (!requesterWorkSchedule || requesterWorkSchedule.isOffDay) {
      throw new Error(`Anda tidak memiliki jadwal kerja pada ${workDateObj.toLocaleDateString('id-ID')}.`);
    }

    // Check target works on offDate (has a shift assigned)
    const targetWorkSchedule = await prisma.userSchedule.findUnique({
      where: { userId_date: { userId: targetId, date: offDateObj } },
    });
    if (!targetWorkSchedule || targetWorkSchedule.isOffDay) {
      throw new Error(`${target.fullName} tidak memiliki jadwal kerja pada ${offDateObj.toLocaleDateString('id-ID')}.`);
    }

    // Run conflict validators
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

    // System auto-validate
    await this.systemValidate(request.id);

    const updated = await prisma.offDayRequest.findUnique({
      where: { id: request.id },
      include: {
        user: { select: { fullName: true } },
        target: { select: { fullName: true } },
      },
    });

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

    // Revalidate conflicts fresh from DB
    const requesterOffConflict = await checkEmployeeScheduleConflict(req.userId, req.workDate);
    const requesterWorkConflict = await checkEmployeeScheduleConflict(req.userId, req.offDate);
    const targetOffConflict = await checkEmployeeScheduleConflict(req.targetUserId, req.workDate);
    const targetWorkConflict = await checkEmployeeScheduleConflict(req.targetUserId, req.offDate);

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
          rejectionNote: conflicts.join(' | '),
        },
      });

      await notificationService.create(
        req.userId,
        'Tukar Libur Ditolak Otomatis',
        `Pengajuan tukar libur Anda ditolak sistem: ${conflicts.join(' | ')}`,
        'OFFDAY_REJECTED'
      );

      throw new Error(conflicts.join(' | '));
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

      return { status: transition.nextStatus, message: 'Pengajuan ditolak.' };
    }

    // ACCEPT
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
      `${req.target.fullName} menyetujui permintaan tukar libur Anda. Menunggu persetujuan admin.`,
      'OFFDAY'
    );

    const admins = await prisma.user.findMany({ where: { role: { in: ['ADMIN', 'OWNER'] }, isActive: true } });
    for (const admin of admins) {
      await notificationService.create(
        admin.id,
        'Persetujuan Tukar Libur Diperlukan',
        `${req.user.fullName} dan ${req.target.fullName} menunggu persetujuan tukar libur.`,
        'OFFDAY_ADMIN'
      );
    }

    return { status: transition.nextStatus, message: 'Pengajuan disetujui, menunggu admin.' };
  }

  /**
   * Admin approves or rejects - Step 3
   */
  async approveByAdmin(requestId, adminId, action) {
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
          rejectionNote: 'Ditolak oleh admin.',
          approverId: adminId,
          approvedAt: now,
        },
      });

      await notificationService.create(
        req.userId,
        'Tukar Libur Ditolak Admin',
        'Permintaan tukar libur Anda ditolak oleh admin.',
        'OFFDAY_REJECTED'
      );

      await notificationService.create(
        req.targetUserId,
        'Tukar Libur Ditolak Admin',
        'Permintaan tukar libur ditolak oleh admin.',
        'OFFDAY_REJECTED'
      );

      return { status: transition.nextStatus, message: 'Pengajuan ditolak oleh admin.' };
    }

    // APPROVE - swap off-days in schedule
    await prisma.$transaction(async (tx) => {
      // Update status
      await tx.offDayRequest.update({
        where: { id: parseInt(requestId) },
        data: {
          status: transition.nextStatus,
          approverId: adminId,
          approvedAt: now,
        },
      });

      // On offDate: Requester is OFF → Target becomes OFF (requester works now)
      // On workDate: Target is OFF → Requester becomes OFF (target works now)

      // Swap: requester's schedule on offDate
      await tx.userSchedule.upsert({
        where: {
          userId_date: {
            userId: req.userId,
            date: req.offDate,
          },
        },
        update: { isOffDay: false },
        create: {
          userId: req.userId,
          date: req.offDate,
          isOffDay: false,
        },
      });

      // target's schedule on offDate
      await tx.userSchedule.upsert({
        where: {
          userId_date: {
            userId: req.targetUserId,
            date: req.offDate,
          },
        },
        update: { isOffDay: true },
        create: {
          userId: req.targetUserId,
          date: req.offDate,
          isOffDay: true,
        },
      });

      // requester's schedule on workDate
      await tx.userSchedule.upsert({
        where: {
          userId_date: {
            userId: req.userId,
            date: req.workDate,
          },
        },
        update: { isOffDay: true },
        create: {
          userId: req.userId,
          date: req.workDate,
          isOffDay: true,
        },
      });

      // target's schedule on workDate
      await tx.userSchedule.upsert({
        where: {
          userId_date: {
            userId: req.targetUserId,
            date: req.workDate,
          },
        },
        update: { isOffDay: false },
        create: {
          userId: req.targetUserId,
          date: req.workDate,
          isOffDay: false,
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