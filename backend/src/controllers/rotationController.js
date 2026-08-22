const rotationService = require('../services/rotationService');
const prisma = require('../utils/database');
const { successResponse } = require('../utils/response');
const { ErrorCodes } = require('../utils/AppError');

class RotationController {
    async listPositions(req, res, next) {
        try {
            const positions = await rotationService.listPositions();
            return successResponse(res, 200, positions, 'Daftar posisi berhasil dimuat');
        } catch (err) {
            next(err);
        }
    }

    async getManualOffDays(req, res, next) {
        try {
            const { weekStart } = req.query;
            if (!weekStart) throw ErrorCodes.SCHEDULE_ERRORS.MISSING_REQUIRED_FIELDS;
            const manualOffDays = await prisma.manualOffDay.findMany({
                where: { weekStart: new Date(weekStart) },
            });
            return successResponse(res, 200, manualOffDays, 'Manual off-days berhasil dimuat');
        } catch (err) {
            next(err);
        }
    }

    async saveManualOffDays(req, res, next) {
        try {
            const { weekStart, offDays } = req.body;
            if (!weekStart || !offDays) throw ErrorCodes.SCHEDULE_ERRORS.MISSING_REQUIRED_FIELDS;
            const weekStartDate = new Date(weekStart);
            await prisma.$transaction([
                prisma.manualOffDay.deleteMany({ where: { weekStart: weekStartDate } }),
                prisma.manualOffDay.createMany({
                    data: offDays.map((item) => ({
                        userId: parseInt(item.userId),
                        date: new Date(item.date),
                        weekStart: weekStartDate,
                    })),
                }),
            ]);
            return successResponse(res, 200, null, 'Manual off-days berhasil diperbarui');
        } catch (err) {
            next(err);
        }
    }

    async createPosition(req, res, next) {
        try {
            const { name, shift1Capacity, shift2Capacity } = req.body;
            if (!name) throw ErrorCodes.SCHEDULE_ERRORS.MISSING_REQUIRED_FIELDS;
            const position = await rotationService.createPosition({ name, shift1Capacity, shift2Capacity });
            return successResponse(res, 201, position, 'Posisi berhasil dibuat');
        } catch (err) {
            next(err);
        }
    }

    async getPosition(req, res, next) {
        try {
            const position = await rotationService.getPosition(parseInt(req.params.id));
            return successResponse(res, 200, position, 'Detail posisi berhasil dimuat');
        } catch (err) {
            next(err);
        }
    }

    async updatePosition(req, res, next) {
        try {
            const { name, shift1Capacity, shift2Capacity, isActive } = req.body;
            const position = await rotationService.updatePosition(parseInt(req.params.id), {
                name, shift1Capacity, shift2Capacity, isActive
            });
            return successResponse(res, 200, position, 'Posisi berhasil diperbarui');
        } catch (err) {
            next(err);
        }
    }

    async setRoster(req, res, next) {
        try {
            const { roster, userIds } = req.body;
            const entries = Array.isArray(roster) ? roster : userIds;
            if (!Array.isArray(entries)) throw ErrorCodes.SCHEDULE_ERRORS.MISSING_REQUIRED_FIELDS;
            const position = await rotationService.setRoster(parseInt(req.params.id), entries);
            return successResponse(res, 200, position, 'Roster berhasil diatur');
        } catch (err) {
            next(err);
        }
    }

    async insertRosterMember(req, res, next) {
        try {
            const { userId, orderIndex } = req.body;
            if (!userId) throw ErrorCodes.SCHEDULE_ERRORS.MISSING_REQUIRED_FIELDS;
            const result = await rotationService.insertRosterMember(
                parseInt(req.params.id), parseInt(userId), orderIndex
            );
            return successResponse(res, 201, result, 'Anggota roster berhasil ditambahkan');
        } catch (err) {
            next(err);
        }
    }

    async removeRosterMember(req, res, next) {
        try {
            const { userId } = req.body;
            if (!userId) throw ErrorCodes.SCHEDULE_ERRORS.MISSING_REQUIRED_FIELDS;
            const result = await rotationService.removeRosterMember(
                parseInt(req.params.id), parseInt(userId)
            );
            return successResponse(res, 200, result, 'Anggota roster berhasil dihapus');
        } catch (err) {
            next(err);
        }
    }

    async generateWeek(req, res, next) {
        try {
            const { weekStart } = req.body;
            const result = await rotationService.generateWeek(
                parseInt(req.params.id), weekStart
            );
            return successResponse(res, 200, result, 'Jadwal mingguan berhasil dibuat');
        } catch (err) {
            next(err);
        }
    }

    async getSchedule(req, res, next) {
        try {
            const { weekStart } = req.query;
            const schedule = await rotationService.getSchedule(
                parseInt(req.params.id), weekStart
            );
            return successResponse(res, 200, schedule, 'Jadwal berhasil dimuat');
        } catch (err) {
            next(err);
        }
    }

    async listSchedules(req, res, next) {
        try {
            const { startWeek, endWeek } = req.query;
            const schedules = await rotationService.listSchedules(
                parseInt(req.params.id), startWeek, endWeek
            );
            return successResponse(res, 200, schedules, 'Daftar jadwal berhasil dimuat');
        } catch (err) {
            next(err);
        }
    }

    async generateMonth(req, res, next) {
        try {
            const { month } = req.body;
            if (!month) throw ErrorCodes.SCHEDULE_ERRORS.MISSING_REQUIRED_FIELDS;
            const result = await rotationService.generateMonth(parseInt(req.params.id), month);
            return successResponse(res, 200, result, 'Jadwal bulanan berhasil di-generate');
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new RotationController();