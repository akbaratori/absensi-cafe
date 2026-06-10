const { ErrorCodes } = require('../utils/AppError');
const attendanceRepository = require('../repositories/attendanceRepository'); // Reuse attendance repo
const userRepository = require('../repositories/userRepository');
const prisma = require('../utils/database');
const { calculateTotalHours } = require('../utils/attendanceHelpers');

class PayrollService {
    /**
     * Calculate payroll for a specific user within a date range
     * Includes: late deductions, handling missing clock-out (uses shift end time),
     * and absent tracking.
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
        let totalLateMinutes = 0;
        let absentCount = 0;
        let missingClockOutDays = 0;

        // Get user's shift for fallback clock-out estimation
        const userShift = user.shift;
        const shiftEndTime = userShift?.endTime || '17:00';

        attendanceRecords.records.forEach(record => {
            if (record.status === 'ABSENT') {
                absentCount++;
                return; // Skip hour calculation for absent records
            }

            if (record.clockOut && record.clockIn) {
                totalDays++;
                const hours = calculateTotalHours(record.clockIn, record.clockOut);
                totalHours += parseFloat(hours);
            } else if (record.clockIn && !record.clockOut) {
                // Handle missing clock-out: estimate using shift end time
                missingClockOutDays++;
                totalDays++;
                const [endH, endM] = shiftEndTime.split(':').map(Number);
                const estimatedEnd = new Date(record.clockIn);
                estimatedEnd.setHours(endH, endM, 0, 0);
                // If estimated end is before clock-in (shift end is next day?), use clockIn + 8h
                if (estimatedEnd <= record.clockIn) {
                    estimatedEnd.setTime(record.clockIn.getTime() + 8 * 60 * 60 * 1000);
                }
                const hours = calculateTotalHours(record.clockIn, estimatedEnd);
                totalHours += parseFloat(hours);
            }

            if (record.status === 'LATE') {
                lateCount++;
                totalLateMinutes += record.lateMinutes || 0;
            }
        });

        // Default rate if not set
        const hourlyRate = user.hourlyRate || 0;
        const baseSalary = totalHours * hourlyRate;

        // Late deduction: deduct lateMinutes converted to hours × hourlyRate
        const lateDeduction = Math.round((totalLateMinutes / 60) * hourlyRate);

        // Absent deduction: deduct 1 full shift equivalent per absent day
        const [shiftStartH, shiftStartM] = (userShift?.startTime || '08:00').split(':').map(Number);
        const [shiftEndH, shiftEndM] = shiftEndTime.split(':').map(Number);
        const shiftHours = (shiftEndH + shiftEndM / 60) - (shiftStartH + shiftStartM / 60);
        const absentDeduction = Math.round(absentCount * Math.max(shiftHours, 0) * hourlyRate);

        const totalDeductions = lateDeduction + absentDeduction;
        const netSalary = Math.max(0, Math.round(baseSalary) - totalDeductions);

        return {
            userId: user.id,
            fullName: user.fullName,
            employeeId: user.employeeId,
            startDate,
            endDate,
            totalWorkingDays: totalDays,
            totalHours: parseFloat(totalHours.toFixed(2)),
            hourlyRate,
            baseSalary: Math.round(baseSalary),
            lateCount,
            totalLateMinutes,
            lateDeduction,
            absentCount,
            absentDeduction,
            totalDeductions,
            netSalary,
            missingClockOutDays,
            notes: missingClockOutDays > 0
                ? `${missingClockOutDays} hari tanpa clock-out (diestimasi berdasarkan jam shift)`
                : null,
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
