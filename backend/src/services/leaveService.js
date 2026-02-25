const prisma = require('../utils/database');
const { ErrorCodes } = require('../utils/AppError');

class LeaveService {
    /**
     * Create a new leave request
     */


    /**
     * Get monthly leave usage count
     */
    async getMonthlyLeaveCount(userId, date = new Date()) {
        const year = date.getFullYear();
        const month = date.getMonth();

        const startDate = new Date(year, month, 1);
        const endDate = new Date(year, month + 1, 0, 23, 59, 59);

        // Find all leaves in this month
        const leaves = await prisma.leave.findMany({
            where: {
                userId,
                status: { not: 'REJECTED' },
                startDate: {
                    gte: startDate,
                    lte: endDate
                }
            }
        });

        // Calculate total days
        let totalDays = 0;
        leaves.forEach(leave => {
            const start = leave.startDate < startDate ? startDate : leave.startDate;
            const end = leave.endDate > endDate ? endDate : leave.endDate;

            // Calculate difference in days (inclusive)
            const diffTime = Math.abs(end - start);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + (leave.startDate.toDateString() === leave.endDate.toDateString() ? 0 : 1);
            // Better calculation:
            // (end - start) in ms / ms_per_day
            // Actually, let's use a simpler robust one
            const days = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
            totalDays += days;
        });

        return totalDays;
    }

    /**
     * Get leave balance for user
     */
    async getLeaveBalance(userId) {
        const used = await this.getMonthlyLeaveCount(userId);
        const quota = 4; // Max 4 days per month
        return {
            used,
            quota,
            remaining: Math.max(0, quota - used)
        };
    }

    /**
     * Create a new leave request (Updated with Quota Check)
     */
    async createLeave(userId, data) {
        const { startDate, endDate, type, reason, proof } = data;

        // ... basic validations ...
        if (new Date(startDate) > new Date(endDate)) {
            const error = new Error('End date must be after start date');
            error.statusCode = 400;
            error.isOperational = true;
            throw error;
        }

        const start = new Date(startDate);
        const end = new Date(endDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        start.setHours(0, 0, 0, 0);

        if (start < today) {
            const error = new Error('Cannot submit leave requests for past dates');
            error.statusCode = 400;
            error.isOperational = true;
            throw error;
        }

        // Quota Check
        if (type !== 'SICK') { // Sick leave might bypass quota? Or maybe not. Let's enforce for all for now as per request "4 jatah libur".
            // Actually, usually Sick leave is separate. But user said "4 jatah libur" (4 days off quota). 
            // Let's assume this applies to 'ANNUAL' or general leave. 
            // If type is SICK, usually purely based on doctor note. 
            // Let's enforce for PERMISSION and ANNUAL.
            if (['ANNUAL', 'PERMISSION'].includes(type) || !type) {
                const daysRequested = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
                const balance = await this.getLeaveBalance(userId);

                if (balance.remaining < daysRequested) {
                    const error = new Error(`Quota exceeded. You have ${balance.remaining} days remaining this month.`);
                    error.statusCode = 400;
                    error.isOperational = true;
                    throw error;
                }
            }
        }


        // Check for overlapping leaves
        const existingLeave = await prisma.leave.findFirst({
            where: {
                userId,
                status: { not: 'REJECTED' },
                OR: [
                    {
                        startDate: { lte: end },
                        endDate: { gte: start },
                    },
                ],
            },
        });

        if (existingLeave) {
            const error = new Error('You already have a pending or approved leave overlapping with these dates');
            error.statusCode = 400;
            error.isOperational = true;
            throw error;
        }

        const leave = await prisma.leave.create({
            data: {
                userId,
                startDate: start,
                endDate: end,
                type: type || 'ANNUAL',
                reason,
                proof,
                status: 'PENDING',
            },
        });

        return leave;
    }

    /**
     * Get all leaves for a user
     */
    async getUserLeaves(userId) {
        return await prisma.leave.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
        });
    }

    /**
     * Admin: Get all leaves with optional status filter
     */
    async getAllLeaves(filters = {}) {
        const where = {};
        if (filters.status) {
            where.status = filters.status;
        }

        return await prisma.leave.findMany({
            where,
            include: {
                user: {
                    select: {
                        id: true,
                        fullName: true,
                        employeeId: true,
                        role: true,
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    /**
     * Admin: Update leave status
     */
    async updateLeaveStatus(leaveId, status) {
        const leave = await prisma.leave.findUnique({
            where: { id: parseInt(leaveId) },
        });

        if (!leave) {
            throw ErrorCodes.RESOURCE_NOT_FOUND;
        }

        return await prisma.leave.update({
            where: { id: parseInt(leaveId) },
            data: { status },
        });
    }

    /**
     * Get leave details
     */
    async getLeaveById(leaveId) {
        return await prisma.leave.findUnique({
            where: { id: parseInt(leaveId) },
            include: {
                user: {
                    select: {
                        id: true,
                        fullName: true,
                    }
                }
            }
        });
    }

    /**
     * Delete leave request
     */
    async deleteLeave(leaveId) {
        const leave = await prisma.leave.findUnique({
            where: { id: parseInt(leaveId) },
        });

        if (!leave) {
            throw ErrorCodes.RESOURCE_NOT_FOUND;
        }

        await prisma.leave.delete({
            where: { id: parseInt(leaveId) },
        });

        return true;
    }
    /**
     * Count pending leave requests
     */
    async countPendingLeaves() {
        return await prisma.leave.count({
            where: { status: 'PENDING' },
        });
    }
}

module.exports = new LeaveService();
