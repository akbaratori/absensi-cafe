const scheduleService = require('../services/scheduleService');
const { successResponse } = require('../utils/response');
const { ErrorCodes } = require('../utils/AppError');

class ScheduleController {
    async generateSchedule(req, res, next) {
        try {
            const { userId, startDate, months, shiftPattern, baseOffDay, rotateOffDay } = req.body;

            // Basic validation
            if (!userId || !startDate || !months || !shiftPattern) {
                throw ErrorCodes.SCHEDULE_ERRORS.MISSING_REQUIRED_FIELDS;
            }

            const schedules = await scheduleService.generateSchedule(parseInt(userId), startDate, parseInt(months), {
                shiftPattern,
                baseOffDay: parseInt(baseOffDay),
                rotateOffDay: rotateOffDay === true || rotateOffDay === 'true'
            });

            return successResponse(res, 200, schedules, 'Jadwal berhasil digenerate');
        } catch (err) {
            console.error('[ScheduleController] Error:', err);
            next(err);
        }
    }

    async getUserSchedule(req, res, next) {
        try {
            const { userId } = req.params;
            const { startDate, endDate } = req.query;

            if (!startDate || !endDate) {
                // Default to current month if not specified
                const start = new Date();
                start.setDate(1);
                const end = new Date(start);
                end.setMonth(end.getMonth() + 1);
                end.setDate(0);

                req.query.startDate = start.toISOString().split('T')[0];
                req.query.endDate = end.toISOString().split('T')[0];
            }

            const schedules = await scheduleService.getUserSchedule(
                parseInt(userId),
                new Date(req.query.startDate),
                new Date(req.query.endDate)
            );

            return successResponse(res, 200, schedules, 'Data jadwal berhasil dimuat');
        } catch (err) {
            next(err);
        }
    }

    async distributeKitchenShifts(req, res, next) {
        try {
            // Attempt to get month from body OR query
            const month = req.body?.month || req.query?.month;

            console.log('[ScheduleController] distributeKitchenShifts Debug:', {
                headers: req.headers,
                body: req.body,
                query: req.query,
                resolvedMonth: month
            });

            if (!month) {
                console.error('[ScheduleController] Missing month. Body:', req.body, 'Query:', req.query);
                return res.status(400).json({
                    success: false,
                    message: 'Missing required field: month',
                    debug: {
                        receivedBody: req.body,
                        receivedQuery: req.query
                    }
                });
            }

            const result = await scheduleService.distributeKitchenShifts(month);
            return successResponse(res, 200, result, 'Shift kitchen berhasil didistribusikan');
        } catch (err) {
            next(err);
        }
    }

    async redistributeStations(req, res, next) {
        try {
            const { date } = req.body;
            if (!date) throw ErrorCodes.SCHEDULE_ERRORS.MISSING_REQUIRED_FIELDS;

            const result = await scheduleService.redistributeStations(date);
            return successResponse(res, 200, result, 'Station berhasil diredistribusi ulang');
        } catch (err) {
            next(err);
        }
    }

    async assignStationsRotation(req, res, next) {
        try {
            const { month } = req.body;
            if (!month) throw ErrorCodes.SCHEDULE_ERRORS.MISSING_REQUIRED_FIELDS;

            const result = await scheduleService.assignStationsRotation(month);
            return successResponse(res, 200, result, 'Rotasi Station berhasil digenerate');
        } catch (err) {
            next(err);
        }
    }


    async updateSchedule(req, res, next) {
        try {
            const { id } = req.params;
            const { shiftId, isOffDay } = req.body;

            const updatedSchedule = await scheduleService.updateSchedule(parseInt(id), {
                shiftId: shiftId ? parseInt(shiftId) : null,
                isOffDay: isOffDay
            });

            return successResponse(res, 200, updatedSchedule, 'Jadwal berhasil diperbarui');
        } catch (err) {
            next(err);
        }
    }

    async getAllSchedules(req, res, next) {
        try {
            const { startDate, endDate, department } = req.query;

            if (!startDate || !endDate) {
                throw ErrorCodes.SCHEDULE_ERRORS.MISSING_REQUIRED_FIELDS;
            }

            const schedules = await scheduleService.getAllSchedules(
                new Date(startDate),
                new Date(endDate),
                department
            );

            return successResponse(res, 200, schedules, 'Success fetching schedules');
        } catch (err) {
            next(err);
        }
    }
    async checkConflicts(req, res, next) {
        try {
            const { userId, startDate, months, baseOffDay, rotateOffDay } = req.body;

            const conflicts = await scheduleService.checkConflicts(
                parseInt(userId),
                startDate,
                parseInt(months),
                {
                    baseOffDay: parseInt(baseOffDay),
                    rotateOffDay: rotateOffDay === true || rotateOffDay === 'true'
                }
            );

            return successResponse(res, 200, conflicts, 'Conflict check completed');
        } catch (err) {
            next(err);
        }
    }

    async getPublicSchedule(req, res, next) {
        try {
            const { startDate, endDate } = req.query;

            // Default to today and tomorrow if not specified
            let start = startDate ? new Date(startDate) : new Date();
            let end = endDate ? new Date(endDate) : new Date();

            if (!startDate && !endDate) {
                end.setDate(end.getDate() + 1); // Tomorrow
            }

            const schedules = await scheduleService.getAllSchedules(start, end, 'ALL');

            // Sanitize data: Only return Name, Department, Shift Name, Start/End Time
            const publicData = schedules.map(s => ({
                id: s.id,
                date: s.date,
                employeeName: s.user.fullName, // Only Name
                department: s.user.department,
                shiftName: s.isOffDay ? 'OFF' : (s.shift?.name || 'Unknown'),
                startTime: s.shift?.startTime,
                endTime: s.shift?.endTime,
                isOffDay: s.isOffDay
            }));

            return successResponse(res, 200, publicData, 'Public schedule fetched');
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new ScheduleController();
