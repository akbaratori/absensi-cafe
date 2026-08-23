const rotationService = require('../services/rotationService');
const prisma = require('../utils/database');
const { successResponse } = require('../utils/response');
const { AppError } = require('../utils/AppError');

const missingFields = () => new AppError('Field wajib tidak lengkap', 400, 'VALIDATION_ERROR');

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
            const { month, weekStart } = req.query;

            let where = {};
            if (month) {
                const [year, mon] = month.split('-').map(Number);
                if (!year || !mon || isNaN(year) || isNaN(mon)) {
                    return successResponse(res, 200, [], 'Parameter month tidak valid, mengembalikan data kosong');
                }
                const startDate = new Date(Date.UTC(year, mon - 1, 1));
                const endDate = new Date(Date.UTC(year, mon, 0, 23, 59, 59, 999));
                where = { date: { gte: startDate, lte: endDate } };
            } else if (weekStart) {
                where = { weekStart: new Date(weekStart) };
            } else {
                // Jika tidak ada parameter, return empty array (bukan throw 400)
                // agar tidak memunculkan error di console saat komponen mount
                return successResponse(res, 200, [], 'Manual off-days berhasil dimuat');
            }

            const manualOffDays = await prisma.manualOffDay.findMany({ where });
            return successResponse(res, 200, manualOffDays, 'Manual off-days berhasil dimuat');
        } catch (err) {
            next(err);
        }
    }

    async saveManualOffDays(req, res, next) {
        try {
            const { month, weekStart, offDays } = req.body;
            if (!offDays) throw missingFields();
            if (!month && !weekStart) throw missingFields();

            // Ambil semua userId unik untuk lookup nama
            const allUids = [...new Set(offDays.map((item) => parseInt(item.userId)))];
            const usersInDb = await prisma.user.findMany({
                where: { id: { in: allUids } },
                select: { id: true, fullName: true, username: true },
            });
            const nameMap = {};
            for (const u of usersInDb) {
                nameMap[u.id] = u.fullName || u.username || `#${u.id}`;
            }
            const userName = (uid) => nameMap[uid] || `#${uid}`;

            // Validate: each user must have all off-days on the same day-of-week within the month
            const userDowMap = {};
            for (const item of offDays) {
                const uid = parseInt(item.userId);
                const dow = new Date(item.date).getUTCDay();
                if (userDowMap[uid] === undefined) {
                    userDowMap[uid] = dow;
                } else if (userDowMap[uid] !== dow) {
                    return res.status(400).json({
                        success: false,
                        message: `${userName(uid)} memiliki hari libur di hari yang berbeda dalam 1 bulan. Setiap pegawai harus libur di hari yang sama setiap minggunya.`,
                        code: 'VALIDATION_ERROR',
                    });
                }
            }

            // Validate max 4 off-days per employee per month
            const MAX_OFF_PER_MONTH = 4;
            const countByUser = {};
            for (const item of offDays) {
                const uid = parseInt(item.userId);
                countByUser[uid] = (countByUser[uid] || 0) + 1;
            }
            const violations = Object.entries(countByUser)
                .filter(([, count]) => count > MAX_OFF_PER_MONTH)
                .map(([uid, count]) => `${userName(parseInt(uid))}: ${count} hari (maks ${MAX_OFF_PER_MONTH})`);
            if (violations.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: `Melebihi batas libur ${MAX_OFF_PER_MONTH}x per bulan: ${violations.join(', ')}`,
                    code: 'VALIDATION_ERROR',
                });
            }

            const getMonday = (dateStr) => {
                const d = new Date(dateStr);
                d.setUTCHours(0, 0, 0, 0);
                const day = d.getUTCDay();
                const diff = day === 0 ? -6 : 1 - day;
                d.setUTCDate(d.getUTCDate() + diff);
                return d;
            };

            if (month) {
                const [year, mon] = month.split('-').map(Number);
                const startDate = new Date(Date.UTC(year, mon - 1, 1));
                const endDate = new Date(Date.UTC(year, mon, 0, 23, 59, 59, 999));

                await prisma.$transaction([
                    prisma.manualOffDay.deleteMany({
                        where: { date: { gte: startDate, lte: endDate } },
                    }),
                    prisma.manualOffDay.createMany({
                        data: offDays.map((item) => {
                            const dateObj = new Date(item.date);
                            return {
                                userId: parseInt(item.userId),
                                date: dateObj,
                                weekStart: getMonday(item.date),
                            };
                        }),
                        skipDuplicates: true,
                    }),
                ]);
            } else {
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
            }

            return successResponse(res, 200, null, 'Manual off-days berhasil diperbarui');
        } catch (err) {
            next(err);
        }
    }

    async createPosition(req, res, next) {
        try {
            const { name, shift1Capacity, shift2Capacity } = req.body;
            if (!name) throw missingFields();
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

    async deletePosition(req, res, next) {
        try {
            await rotationService.deletePosition(parseInt(req.params.id));
            return successResponse(res, 200, null, 'Posisi berhasil dihapus');
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
            if (!Array.isArray(entries)) throw missingFields();
            const position = await rotationService.setRoster(parseInt(req.params.id), entries);
            return successResponse(res, 200, position, 'Roster berhasil diatur');
        } catch (err) {
            next(err);
        }
    }

    async insertRosterMember(req, res, next) {
        try {
            const { userId, orderIndex } = req.body;
            if (!userId) throw missingFields();
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
            if (!userId) throw missingFields();
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
            if (!month) throw missingFields();
            const result = await rotationService.generateMonth(parseInt(req.params.id), month);
            return successResponse(res, 200, result, 'Jadwal bulanan berhasil di-generate');
        } catch (err) {
            next(err);
        }
    }

    async getAllSchedules(req, res, next) {
        try {
            const { weekStart } = req.query;
            if (!weekStart) throw missingFields();

            const positions = await rotationService.listPositions();
            const results = await Promise.all(
                positions.map(async (pos) => {
                    try {
                        const schedule = await rotationService.getSchedule(pos.id, weekStart);
                        return { position: pos, schedule };
                    } catch {
                        return { position: pos, schedule: null };
                    }
                })
            );
            return successResponse(res, 200, results, 'Semua jadwal berhasil dimuat');
        } catch (err) {
            next(err);
        }
    }

    async getMySchedule(req, res, next) {
        try {
            const userId = req.user.id;
            const { from, to } = req.query;
            if (!from || !to) throw missingFields();
            const result = await rotationService.getMySchedule(userId, from, to);
            return successResponse(res, 200, result, 'Jadwal karyawan berhasil dimuat');
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new RotationController();
