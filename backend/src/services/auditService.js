const prisma = require('../utils/database');

/**
 * Audit Trail Service
 * Logs all admin/system actions to the AuditLog table for compliance and traceability.
 */
class AuditService {
    /**
     * Create an audit log entry
     * @param {Object} params
     * @param {number|null} params.userId - The user performing the action (null for system actions)
     * @param {string} params.action - Action performed (CREATE, UPDATE, DELETE, AUTO_CLOCKOUT, etc.)
     * @param {string} params.entityType - Type of entity affected (ATTENDANCE, SCHEDULE, USER, LEAVE, CONFIG, etc.)
     * @param {string} params.entityId - ID of the affected entity
     * @param {string|null} params.details - JSON string or description of what changed
     */
    async log({ userId = null, action, entityType, entityId, details = null }) {
        try {
            await prisma.auditLog.create({
                data: {
                    userId,
                    action,
                    entityType,
                    entityId: String(entityId),
                    details: typeof details === 'object' ? JSON.stringify(details) : details,
                },
            });
        } catch (error) {
            // Audit logging should never crash the main flow
            console.error('[AuditService] Failed to write audit log:', error.message);
        }
    }

    /**
     * Log attendance modification by admin
     */
    async logAttendanceUpdate(adminId, attendanceId, changes) {
        await this.log({
            userId: adminId,
            action: 'UPDATE',
            entityType: 'ATTENDANCE',
            entityId: attendanceId,
            details: changes,
        });
    }

    /**
     * Log attendance deletion by admin
     */
    async logAttendanceDelete(adminId, attendanceId, record) {
        await this.log({
            userId: adminId,
            action: 'DELETE',
            entityType: 'ATTENDANCE',
            entityId: attendanceId,
            details: { deletedRecord: record },
        });
    }

    /**
     * Log auto clock-out by system
     */
    async logAutoClockout(attendanceId, userId, clockOutTime) {
        await this.log({
            userId: null,
            action: 'AUTO_CLOCKOUT',
            entityType: 'ATTENDANCE',
            entityId: attendanceId,
            details: { userId, clockOutTime: clockOutTime.toISOString(), reason: 'System auto clock-out' },
        });
    }

    /**
     * Log schedule modification
     */
    async logScheduleChange(adminId, scheduleId, changes) {
        await this.log({
            userId: adminId,
            action: 'UPDATE',
            entityType: 'SCHEDULE',
            entityId: scheduleId,
            details: changes,
        });
    }

    /**
     * Log user creation/update/deletion
     */
    async logUserChange(adminId, action, targetUserId, details = null) {
        await this.log({
            userId: adminId,
            action,
            entityType: 'USER',
            entityId: targetUserId,
            details,
        });
    }

    /**
     * Log config changes
     */
    async logConfigChange(adminId, changes) {
        await this.log({
            userId: adminId,
            action: 'UPDATE',
            entityType: 'CONFIG',
            entityId: 'system',
            details: changes,
        });
    }

    /**
     * Log leave approval/rejection
     */
    async logLeaveAction(adminId, action, leaveId, details = null) {
        await this.log({
            userId: adminId,
            action,
            entityType: 'LEAVE',
            entityId: leaveId,
            details,
        });
    }

    /**
     * Get audit logs with optional filters
     */
    async getLogs(filters = {}) {
        const { page = 1, limit = 50, userId, action, entityType, startDate, endDate } = filters;
        const skip = (page - 1) * limit;

        const where = {};
        if (userId) where.userId = parseInt(userId);
        if (action) where.action = action;
        if (entityType) where.entityType = entityType;
        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) where.createdAt.gte = new Date(startDate);
            if (endDate) where.createdAt.lte = new Date(endDate);
        }

        const [logs, total] = await Promise.all([
            prisma.auditLog.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
            }),
            prisma.auditLog.count({ where }),
        ]);

        return {
            logs,
            pagination: {
                page,
                limit,
                totalRecords: total,
                totalPages: Math.ceil(total / limit),
            },
        };
    }
}

module.exports = new AuditService();
