const overtimeRepository = require('../repositories/overtimeRepository');
const { AppError, ErrorCodes } = require('../utils/AppError');
const auditService = require('./auditService');

class OvertimeService {
  /**
   * Create overtime request (employee)
   */
  async createOvertime(userId, data) {
    const { date, startTime, endTime, reason } = data;

    if (!date || !startTime || !endTime) {
      throw new AppError('Tanggal, jam mulai, dan jam selesai wajib diisi', 400, 'VALIDATION_ERROR');
    }

    const start = new Date(startTime);
    const end = new Date(endTime);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new AppError('Format waktu tidak valid', 400, 'VALIDATION_ERROR');
    }

    if (end <= start) {
      throw new AppError('Jam selesai harus setelah jam mulai', 400, 'VALIDATION_ERROR');
    }

    // Check for overlapping requests
    const overlapping = await overtimeRepository.findOverlapping(userId, start, end);
    if (overlapping) {
      throw new AppError('Sudah ada pengajuan lembur pada rentang waktu tersebut', 409, 'OVERLAPPING_OVERTIME');
    }

    const durationHours = Math.round(((end - start) / (1000 * 60 * 60)) * 100) / 100;

    const record = await overtimeRepository.create({
      userId,
      date: new Date(`${date}T00:00:00+08:00`),
      startTime: start,
      endTime: end,
      durationHours,
      reason: reason || null,
      status: 'PENDING',
    });

    // Audit trail
    await auditService.log({
      userId,
      action: 'CREATE',
      entityType: 'OVERTIME',
      entityId: record.id,
      details: {
        date,
        startTime,
        endTime,
        durationHours,
      },
    });

    return this._formatRecord(record);
  }

  /**
   * Get overtime history for current user
   */
  async getMyOvertime(userId, options) {
    const result = await overtimeRepository.getUserHistory(userId, options);

    return {
      records: result.records.map((r) => this._formatRecord(r)),
      pagination: result.pagination,
    };
  }

  /**
   * Get overtime summary for current user
   */
  async getMySummary(userId, month) {
    return await overtimeRepository.getMonthlySummary(userId, month);
  }

  /**
   * Admin: List all overtime requests
   */
  async getAll(options) {
    const result = await overtimeRepository.findAll(options);

    return {
      records: result.records.map((r) => this._formatRecord(r)),
      pagination: result.pagination,
    };
  }

  /**
   * Admin: Approve overtime request
   */
  async approve(id, adminId, notes) {
    const record = await overtimeRepository.findById(id);

    if (!record) {
      throw ErrorCodes.ATTENDANCE_ERRORS.ATTENDANCE_NOT_FOUND;
    }

    if (record.status === 'APPROVED') {
      throw new AppError('Pengajuan lembur ini sudah disetujui', 409, 'ALREADY_APPROVED');
    }

    const updated = await overtimeRepository.update(id, {
      status: 'APPROVED',
      approvedById: adminId,
      approvedAt: new Date(),
      ...(notes !== undefined && { notes }),
    });

    // Audit trail
    await auditService.log({
      userId: adminId,
      action: 'APPROVE',
      entityType: 'OVERTIME',
      entityId: id,
      details: {
        approvedBy: adminId,
        notes,
      },
    });

    return this._formatRecord(updated);
  }

  /**
   * Admin: Reject overtime request
   */
  async reject(id, adminId, notes) {
    const record = await overtimeRepository.findById(id);

    if (!record) {
      throw ErrorCodes.ATTENDANCE_ERRORS.ATTENDANCE_NOT_FOUND;
    }

    if (record.status === 'REJECTED') {
      throw new AppError('Pengajuan lembur ini sudah ditolak', 409, 'ALREADY_REJECTED');
    }

    const updated = await overtimeRepository.update(id, {
      status: 'REJECTED',
      approvedById: adminId,
      approvedAt: new Date(),
      ...(notes !== undefined && { notes }),
    });

    // Audit trail
    await auditService.log({
      userId: adminId,
      action: 'REJECT',
      entityType: 'OVERTIME',
      entityId: id,
      details: {
        approvedBy: adminId,
        notes,
      },
    });

    return this._formatRecord(updated);
  }

  /**
   * Admin: Delete overtime request
   */
  async delete(id, adminId) {
    const record = await overtimeRepository.findById(id);

    if (!record) {
      throw ErrorCodes.ATTENDANCE_ERRORS.ATTENDANCE_NOT_FOUND;
    }

    await overtimeRepository.delete(id);

    // Audit trail
    await auditService.log({
      userId: adminId,
      action: 'DELETE',
      entityType: 'OVERTIME',
      entityId: id,
      details: {
        userId: record.userId,
        date: record.date,
      },
    });

    return true;
  }

  /**
   * Format record for API response
   */
  _formatRecord(record) {
    return {
      id: record.id,
      userId: record.userId,
      user: record.user
        ? {
            id: record.user.id,
            username: record.user.username,
            fullName: record.user.fullName,
            employeeId: record.user.employeeId,
            department: record.user.department,
          }
        : null,
      date: record.date.toISOString().split('T')[0],
      startTime: record.startTime.toISOString(),
      endTime: record.endTime.toISOString(),
      durationHours: record.durationHours,
      reason: record.reason,
      status: record.status,
      notes: record.notes,
      approvedBy: record.approvedBy
        ? {
            id: record.approvedBy.id,
            username: record.approvedBy.username,
            fullName: record.approvedBy.fullName,
          }
        : null,
      approvedAt: record.approvedAt ? record.approvedAt.toISOString() : null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }
}

module.exports = new OvertimeService();