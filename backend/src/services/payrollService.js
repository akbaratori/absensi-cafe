const { ErrorCodes } = require('../utils/AppError');
const attendanceRepository = require('../repositories/attendanceRepository'); // Reuse attendance repo
const userRepository = require('../repositories/userRepository');
const prisma = require('../utils/database');
const { calculateTotalHours } = require('../utils/attendanceHelpers');

class PayrollService {
    /**
     * Calculate payroll for a specific user within a date range
     */
    async calculatePayroll(userId, startDate, endDate) {
        const user = await userRepository.findById(userId);
        if (!user) {
            throw ErrorCodes.USER_ERRORS.USER_NOT_FOUND;
        }

        const attendanceRecords = await attendanceRepository.getUserHistory(userId, {
            startDate,
            endDate,
            limit: 1000 // Ensure we get all records
        });

        let totalHours = 0;
        let totalDays = 0;
        let lateCount = 0;

        attendanceRecords.records.forEach(record => {
            if (record.clockOut && record.clockIn) {
                totalDays++;
                const hours = calculateTotalHours(record.clockIn, record.clockOut);
                totalHours += parseFloat(hours); // Ensure float addition
            }
            if (record.status === 'LATE') {
                lateCount++;
            }
        });

        // Default rate if not set
        const hourlyRate = user.hourlyRate || 0;
        const baseSalary = totalHours * hourlyRate;

        return {
            userId: user.id,
            fullName: user.fullName,
            startDate,
            endDate,
            totalWorkingDays: totalDays,
            totalHours: parseFloat(totalHours.toFixed(2)),
            hourlyRate,
            baseSalary: Math.round(baseSalary), // Round to nearest integer
            lateCount
        };
    }

    /**
     * Calculate payroll for all users
     */
    async calculateAllPayroll(startDate, endDate) {
        const users = await userRepository.list({ limit: 1000, isActive: 'true' }); // Only active users

        // Process in parallel
        const payrolls = await Promise.all(
            users.users.map(async (user) => {
                try {
                    return await this.calculatePayroll(user.id, startDate, endDate);
                } catch (error) {
                    console.error(`Error calculating payroll for user ${user.id}:`, error);
                    return null;
                }
            })
        );

        return payrolls.filter(p => p !== null);
    }
}

module.exports = new PayrollService();
