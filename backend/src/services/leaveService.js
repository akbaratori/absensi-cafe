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
     * Get leave balance for user.
     *
     * "Used" = any working day this month where the employee did NOT clock in.
     * This includes:
     *   1. Approved/pending formal Leave request days
     *   2. Days with a UserSchedule (isOffDay=false) but no Attendance record
     *   3. Days with an Attendance record whose status is ABSENT
     *
     * All dates are handled in WITA (UTC+8) to match the rest of the codebase.
     */
    async getLeaveBalance(userId) {
        const WITA_OFFSET_MS = 8 * 60 * 60 * 1000;

        // "Today" in WITA
        const nowWITA = new Date(Date.now() + WITA_OFFSET_MS);
        const todayStr = nowWITA.toISOString().slice(0, 10); // "YYYY-MM-DD"

        // First day of current month in WITA
        const [year, month] = todayStr.split('-').map(Number);
        const monthStartWITA = new Date(`${year}-${String(month).padStart(2, '0')}-01T00:00:00+08:00`);
        // Last moment of yesterday in WITA — we don't penalise today yet (shift may still be ongoing)
        const yesterdayWITA = new Date(nowWITA);
        yesterdayWITA.setUTCDate(yesterdayWITA.getUTCDate() - 1);
        const yesterdayStr = yesterdayWITA.toISOString().slice(0, 10);
        const monthEndUTC = new Date(`${yesterdayStr}T23:59:59+08:00`);

        // If we're on the first day of the month there are no past days yet
        if (monthEndUTC < monthStartWITA) {
            return { used: 0, quota: 4, remaining: 4, breakdown: { leaveDays: 0, absentDays: 0, noShowDays: 0 } };
        }

        // --- 1. Collect formal Leave days this month (not REJECTED) ---
        const leaves = await prisma.leave.findMany({
            where: {
                userId,
                status: { not: 'REJECTED' },
                startDate: { lte: monthEndUTC },
                endDate:   { gte: monthStartWITA },
            },
        });

        // Build a Set of WITA date-strings covered by formal leave
        const leaveDateSet = new Set();
        for (const leave of leaves) {
            const start = leave.startDate < monthStartWITA ? monthStartWITA : leave.startDate;
            const end   = leave.endDate   > monthEndUTC   ? monthEndUTC   : leave.endDate;
            const cur = new Date(start);
            while (cur <= end) {
                const witaStr = new Date(cur.getTime() + WITA_OFFSET_MS).toISOString().slice(0, 10);
                leaveDateSet.add(witaStr);
                cur.setUTCDate(cur.getUTCDate() + 1);
            }
        }

        // --- 2. Collect UserSchedule entries this month where isOffDay = false ---
        const schedules = await prisma.userSchedule.findMany({
            where: {
                userId,
                isOffDay: false,
                date: { gte: monthStartWITA, lte: monthEndUTC },
            },
            select: { date: true },
        });

        // --- 3. Collect Attendance records this month ---
        const attendances = await prisma.attendance.findMany({
            where: {
                userId,
                date: { gte: monthStartWITA, lte: monthEndUTC },
            },
            select: { date: true, status: true },
        });

        // Index attendance by WITA date-string
        const attendanceMap = new Map(); // dateStr -> status
        for (const a of attendances) {
            const witaStr = new Date(a.date.getTime() + WITA_OFFSET_MS).toISOString().slice(0, 10);
            attendanceMap.set(witaStr, a.status);
        }

        // --- 4. Walk scheduled days and classify ---
        let noShowDays = 0;
        let absentDays = 0;

        // Track which dates were already processed via UserSchedule
        const countedDates = new Set();

        for (const sched of schedules) {
            const witaStr = new Date(sched.date.getTime() + WITA_OFFSET_MS).toISOString().slice(0, 10);
            countedDates.add(witaStr);

            // Skip days already covered by a formal Leave entry (avoid double-count)
            if (leaveDateSet.has(witaStr)) continue;

            const status = attendanceMap.get(witaStr);
            if (status === undefined) {
                // Scheduled to work, no attendance record at all — no-show
                noShowDays++;
            } else if (status === 'ABSENT') {
                // Admin explicitly marked as absent
                absentDays++;
            }
            // PRESENT, LATE, HALF_DAY etc. — employee came in, don't count
        }

        // --- 4b. Also count ABSENT attendance records that have no UserSchedule row ---
        // This handles manually-set ABSENT records when absent detection cron is disabled.
        for (const [witaStr, status] of attendanceMap) {
            if (status !== 'ABSENT') continue;
            if (countedDates.has(witaStr)) continue;     // already counted above
            if (leaveDateSet.has(witaStr)) continue;     // covered by formal leave
            absentDays++;
        }

        const leaveDays = leaveDateSet.size;
        const used = leaveDays + noShowDays + absentDays;
        const quota = 4; // Max 4 days per month

        return {
            used,
            quota,
            remaining: Math.max(0, quota - used),
            breakdown: { leaveDays, absentDays, noShowDays },
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
