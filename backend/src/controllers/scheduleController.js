const scheduleService = require('../services/scheduleService');
const { successResponse } = require('../utils/response');
const { AppError, ErrorCodes } = require('../utils/AppError');

class ScheduleController {
    async generateSchedule(req, res, next) {
        return next(new AppError('Fitur generate jadwal sudah digantikan oleh Posisi & Rotasi', 410, 'FEATURE_DEPRECATED'));
        try {
            const { userId, startDate, months, shiftPattern, baseOffDay, rotateOffDay } = req.body;

            // Basic validation
            if (!userId || !startDate || !months || !shiftPattern) {
                throw ErrorCodes.SCHEDULE_ERRORS.MISSING_REQUIRED_FIELDS;
            }

            // Auto conflict check before generating
            const conflicts = await scheduleService.checkConflicts(parseInt(userId), startDate, parseInt(months), {
                baseOffDay: parseInt(baseOffDay),
                rotateOffDay: rotateOffDay === true || rotateOffDay === 'true'
            });

            const schedules = await scheduleService.generateSchedule(parseInt(userId), startDate, parseInt(months), {
                shiftPattern,
                baseOffDay: parseInt(baseOffDay),
                rotateOffDay: rotateOffDay === true || rotateOffDay === 'true'
            });

            const hasConflicts = Object.keys(conflicts).length > 0;
            const message = hasConflicts
                ? `Jadwal berhasil digenerate (⚠️ ${Object.keys(conflicts).length} hari konflik dengan karyawan lain di departemen yang sama)`
                : 'Jadwal berhasil digenerate';

            return successResponse(res, 200, { schedules, conflicts }, message);
        } catch (err) {
            console.error('[ScheduleController] Error:', err);
            next(err);
        }
    }

    async bulkGenerateSchedule(req, res, next) {
        return next(new AppError('Fitur generate jadwal sudah digantikan oleh Posisi & Rotasi', 410, 'FEATURE_DEPRECATED'));
        try {
            const { userIds, startDate, endDate, shiftId, keepOffDays } = req.body;

            if (!startDate || !endDate || !shiftId) {
                throw ErrorCodes.SCHEDULE_ERRORS.MISSING_REQUIRED_FIELDS;
            }

            // If userIds is 'ALL' or empty, get all active employees
            let targetUserIds = userIds;
            if (!userIds || userIds === 'ALL' || (Array.isArray(userIds) && userIds.length === 0)) {
                const prisma = require('../utils/database');
                const allUsers = await prisma.user.findMany({
                    where: { isActive: true, role: 'EMPLOYEE' },
                    select: { id: true }
                });
                targetUserIds = allUsers.map(u => u.id);
            }

            const result = await scheduleService.bulkGenerateSchedule(
                targetUserIds,
                startDate,
                endDate,
                parseInt(shiftId),
                { keepOffDays: keepOffDays !== false }
            );

            return successResponse(res, 200, result, `Jadwal massal berhasil digenerate untuk ${result.totalUsers} karyawan`);
        } catch (err) {
            console.error('[ScheduleController] Bulk Generate Error:', err);
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

            // Parse as UTC midnight to match how schedules are stored (generateSchedule uses T00:00:00Z)
            const start = new Date(req.query.startDate + 'T00:00:00Z');
            const end = new Date(req.query.endDate + 'T23:59:59.999Z');

            const schedules = await scheduleService.getUserSchedule(
                parseInt(userId),
                start,
                end
            );

            return successResponse(res, 200, schedules, 'Data jadwal berhasil dimuat');
        } catch (err) {
            next(err);
        }
    }

    async distributeKitchenShifts(req, res, next) {
        return next(new AppError('Fitur generate jadwal sudah digantikan oleh Posisi & Rotasi', 410, 'FEATURE_DEPRECATED'));
        try {
            // Attempt to get month or date ranges
            const month = req.body?.month || req.query?.month;
            const startDate = req.body?.startDate || req.query?.startDate;
            const endDate = req.body?.endDate || req.query?.endDate;

            if (!month && (!startDate || !endDate)) {
                return res.status(400).json({
                    success: false,
                    message: 'Missing required field: month OR (startDate and endDate)'
                });
            }

            const result = await scheduleService.distributeKitchenShifts({ month, startDate, endDate });
            return successResponse(res, 200, result, 'Shift kitchen berhasil didistribusikan');
        } catch (err) {
            next(err);
        }
    }

    async redistributeStations(req, res, next) {
        return next(new AppError('Fitur generate jadwal sudah digantikan oleh Posisi & Rotasi', 410, 'FEATURE_DEPRECATED'));
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
        return next(new AppError('Fitur generate jadwal sudah digantikan oleh Posisi & Rotasi', 410, 'FEATURE_DEPRECATED'));
        try {
            const month = req.body?.month || req.query?.month;
            const startDate = req.body?.startDate || req.query?.startDate;
            const endDate = req.body?.endDate || req.query?.endDate;

            if (!month && (!startDate || !endDate)) {
                throw ErrorCodes.SCHEDULE_ERRORS.MISSING_REQUIRED_FIELDS;
            }

            const result = await scheduleService.assignStationsRotation({ month, startDate, endDate });
            return successResponse(res, 200, result, 'Rotasi Station berhasil digenerate');
        } catch (err) {
            next(err);
        }
    }


    async updateSchedule(req, res, next) {
        try {
            const { id } = req.params;
            const { shiftId, isOffDay, kitchenStation, temporaryDepartment } = req.body;

            const updatedSchedule = await scheduleService.updateSchedule(parseInt(id), {
                shiftId: shiftId ? parseInt(shiftId) : null,
                isOffDay: isOffDay,
                kitchenStation: kitchenStation,
                temporaryDepartment: temporaryDepartment,
            });

            // Audit trail
            const auditService = require('../services/auditService');
            await auditService.logScheduleChange(req.user.id, id, {
                shiftId, isOffDay, kitchenStation, temporaryDepartment
            });

            return successResponse(res, 200, updatedSchedule, 'Jadwal berhasil diperbarui');
        } catch (err) {
            next(err);
        }
    }

    async updateUserScheduleCell(req, res, next) {
        try {
            const { userId, date, shiftId, isOffDay, kitchenStation, temporaryDepartment } = req.body;

            if (!userId || !date) {
                return res.status(400).json({ success: false, message: 'User ID and Date are required' });
            }

            const updatedSchedule = await scheduleService.upsertSingleSchedule({
                userId,
                date,
                shiftId: isOffDay ? null : (shiftId ? parseInt(shiftId) : null),
                isOffDay: Boolean(isOffDay),
                kitchenStation: isOffDay ? null : kitchenStation,
                temporaryDepartment,
            });

            // Audit trail
            const auditService = require('../services/auditService');
            await auditService.logScheduleChange(req.user.id, updatedSchedule.id, {
                userId, date, shiftId, isOffDay, kitchenStation, temporaryDepartment
            });

            return successResponse(res, 200, updatedSchedule, 'Sel jadwal berhasil diperbarui');
        } catch (err) {
            next(err);
        }
    }

    /**
     * Simpan banyak sel jadwal SEKALI jalan (Admin only).
     *
     * Dipakai tombol "Simpan Semua" di halaman Jadwal Lengkap: admin menumpuk
     * perubahan jobdesk/stasiun per staff per hari di antrean, lalu mengirimnya
     * lewat satu endpoint. Kalau tiap perubahan dikirim sebagai request sendiri,
     * halaman harus reload sekali per perubahan (lambat saat menata seminggu
     * penuh); di sini cukup satu request + satu reload.
     *
     * PUT /api/v1/schedules/user-schedule-cell/bulk
     * body: { changes: [{ userId, date, shiftId, isOffDay, kitchenStation, temporaryDepartment }] }
     *
     * Hasil parsial dikembalikan apa adanya (`saved` + `failed`) supaya frontend
     * hanya menahan sel yang gagal di antrean — perubahan yang sudah tersimpan
     * tidak perlu diketik ulang.
     */
    async bulkUpdateUserScheduleCells(req, res, next) {
        try {
            const { changes } = req.body;
            if (!Array.isArray(changes) || changes.length === 0) {
                return res.status(400).json({ success: false, message: 'changes harus berupa daftar perubahan jadwal' });
            }
            const invalid = changes.findIndex((c) => !c || !c.userId || !c.date);
            if (invalid !== -1) {
                return res.status(400).json({
                    success: false,
                    message: `Perubahan nomor ${invalid + 1} tidak lengkap (userId dan date wajib diisi)`,
                });
            }

            const result = await scheduleService.bulkUpsertSingleSchedules(changes);

            // Audit trail hanya untuk sel yang benar-benar tersimpan.
            const auditService = require('../services/auditService');
            const isFailed = (c) => result.failed.some(
                (f) => parseInt(f.userId) === parseInt(c.userId) && f.date === String(c.date).slice(0, 10)
            );
            for (const c of changes) {
                if (isFailed(c)) continue;
                await auditService.logScheduleChange(req.user.id, 0, {
                    userId: parseInt(c.userId),
                    date: c.date,
                    shiftId: c.isOffDay ? null : (c.shiftId ?? null),
                    isOffDay: Boolean(c.isOffDay),
                    kitchenStation: c.isOffDay ? null : (c.kitchenStation ?? null),
                    temporaryDepartment: c.temporaryDepartment ?? null,
                    bulk: true,
                });
            }

            const failedCount = result.failed.length;
            return successResponse(
                res,
                200,
                { total: changes.length, saved: result.saved, failed: result.failed },
                failedCount === 0
                    ? `${result.saved} perubahan jadwal berhasil disimpan`
                    : `${result.saved} perubahan tersimpan, ${failedCount} gagal`
            );
        } catch (err) {
            next(err);
        }
    }


    /**
     * Ubah jadwal SATU pegawai untuk RENTANG tanggal sekaligus.
     *
     * Dipakai halaman Jadwal Lengkap: daripada admin mengklik satu sel per hari
     * (dan lupa salah satu), pilih pegawai → pilih shift → pilih rentang.
     *
     * PUT /api/v1/schedules/user-shift-range
     * body: { userId, startDate, endDate, shiftId, isOffDay }
     *
     * Aturan yang dijaga:
     *  - Tanggal diperlakukan sebagai hari WITA (UTC+8), sama seperti kalender
     *    yang dilihat admin, supaya "1-7" tidak bergeser sehari.
     *  - Hari yang DITANDAI LIBUR manual (`manual_off_days`) bisa ditimpa shift,
     *    karena admin memang sedang menyatakan orangnya masuk. Ini sejalan
     *    dengan `upsertSingleSchedule` yang menghapus tanda libur saat diberi shift.
     *  - `shiftId` wajib (kecuali `isOffDay`), supaya tidak ada jadwal menggantung.
     *  - Tanggal yang jadwalnya belum ada akan DIBUAT, jadi admin tidak perlu
     *    generate ulang hanya untuk menambah satu orang di tanggal tertentu.
     */
    async updateUserShiftRange(req, res, next) {
        try {
            const { userId, startDate, endDate, shiftId, isOffDay } = req.body;

            if (!userId || !startDate) {
                return res.status(400).json({ success: false, message: 'userId dan startDate wajib diisi' });
            }

            const off = Boolean(isOffDay);
            if (!off && !shiftId) {
                return res.status(400).json({ success: false, message: 'shiftId wajib diisi bila tidak menandai libur' });
            }

            const lastDate = endDate || startDate;
            if (lastDate < startDate) {
                return res.status(400).json({ success: false, message: 'endDate tidak boleh sebelum startDate' });
            }

            const result = await scheduleService.updateUserShiftRange({
                userId: parseInt(userId),
                startDate,
                endDate: lastDate,
                shiftId: off ? null : parseInt(shiftId),
                isOffDay: off,
            });

            // Audit trail — satu catatan untuk satu aksi rentang, bukan per hari,
            // supaya riwayat perubahan tetap mudah dibaca.
            const auditService = require('../services/auditService');
            await auditService.log({
                userId: req.user.id,
                action: 'UPDATE',
                entityType: 'SCHEDULE_RANGE',
                entityId: String(userId),
                details: {
                    userId,
                    startDate,
                    endDate: lastDate,
                    shiftId: off ? null : parseInt(shiftId),
                    isOffDay: off,
                    daysAffected: result.daysAffected,
                },
            });

            return successResponse(
                res,
                200,
                result,
                `Jadwal ${result.daysAffected} hari berhasil diperbarui`
            );
        } catch (err) {
            next(err);
        }
    }

    async deleteSchedule(req, res, next) {
        try {
            const { id } = req.params;
            const prisma = require('../utils/database');

            // Get schedule before delete for audit
            const schedule = await prisma.userSchedule.findUnique({ where: { id: parseInt(id) } });

            await prisma.userSchedule.delete({
                where: { id: parseInt(id) }
            });

            // Audit trail
            const auditService = require('../services/auditService');
            await auditService.log({
                userId: req.user.id,
                action: 'DELETE',
                entityType: 'SCHEDULE',
                entityId: id,
                details: schedule ? { deletedSchedule: { userId: schedule.userId, date: schedule.date, shiftId: schedule.shiftId } } : null,
            });

            return successResponse(res, 200, null, 'Jadwal berhasil dihapus');
        } catch (err) {
            next(err);
        }
    }

    async upsertSingleSchedule(req, res, next) {
        try {
            const { userId, date, shiftId, isOffDay, kitchenStation, temporaryDepartment } = req.body;
            
            console.log('[upsertSingleSchedule] body:', req.body);

            if (!userId || !date) {
                return res.status(400).json({ success: false, message: 'User ID and Date are required' });
            }

            const upsertedSchedule = await scheduleService.upsertSingleSchedule({
                userId,
                date,
                shiftId: shiftId ? parseInt(shiftId) : null,
                isOffDay: Boolean(isOffDay),
                kitchenStation,
                temporaryDepartment,
            });

            return successResponse(res, 200, upsertedSchedule, 'Jadwal berhasil ditambahkan');
        } catch (err) {
            console.error('[upsertSingleSchedule] ERROR:', err.message, err.code);
            next(err);
        }
    }

    async getAllSchedules(req, res, next) {
        try {
            const { startDate, endDate, department } = req.query;

            if (!startDate || !endDate) {
                throw ErrorCodes.SCHEDULE_ERRORS.MISSING_REQUIRED_FIELDS;
            }

            // Parse as UTC midnight to match how schedules are stored (generateSchedule uses T00:00:00Z)
            const start = new Date(startDate + 'T00:00:00Z');
            const end = new Date(endDate + 'T23:59:59.999Z');

            const schedules = await scheduleService.getAllSchedules(
                start,
                end,
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

    /**
     * GET /schedules/my-jobdesk-summary?month=YYYY-MM
     *
     * Rekap jobdesk MILIK user yang sedang login (bukan rekap tim). Aman untuk
     * EMPLOYEE karena userId selalu diambil dari token, bukan dari query, jadi
     * tidak mungkin dipakai mengintip jobdesk orang lain.
     */
    async getMyJobdeskSummary(req, res, next) {
        try {
            const month = req.query.month;
            const data = await scheduleService.getMyJobdeskSummary(month, req.user.id);
            res.json({ success: true, data });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /schedules/jobdesk-summary?month=YYYY-MM
     *
     * Rangkuman jobdesk SELURUH pegawai dapur untuk satu bulan (sudah
     * dikelompokkan per pegawai, urut dari yang paling banyak mengerjakan).
     * Dipakai panel "Rangkuman Jobdesk Pegawai" di halaman admin.
     *
     * Beda dari `jobdesk-fairness` yang fokus membandingkan keadilan beban:
     * di sini yang ditonjolkan adalah JUMLAH jobdesk yang sudah dikerjakan.
     */
    async getJobdeskSummary(req, res, next) {
        try {
            const { month } = req.query;
            if (!month) {
                throw new AppError('Parameter month wajib diisi (YYYY-MM)', 400, 'VALIDATION_ERROR');
            }
            const report = await scheduleService.getJobdeskSummary(month);
            return successResponse(res, 200, report, 'Rangkuman jobdesk pegawai berhasil dimuat');
        } catch (err) {
            next(err);
        }
    }

    /**
     * GET /schedules/jobdesk-fairness?month=YYYY-MM
     * Rekap keadilan jobdesk dapur (per staff × jobdesk + beban rata-rata).
     * Dipakai panel "Rekap Keadilan Jobdesk" di halaman Jadwal Lengkap.
     */
    async getJobdeskFairness(req, res, next) {
        try {
            const { month } = req.query;
            if (!month) {
                throw new AppError('Parameter month wajib diisi (YYYY-MM)', 400, 'VALIDATION_ERROR');
            }
            const report = await scheduleService.getJobdeskFairness(month);
            return successResponse(res, 200, report, 'Rekap keadilan jobdesk berhasil dimuat');
        } catch (err) {
            next(err);
        }
    }

    /**
     * PUT /schedules/jobdesk-fairness/adjust
     * Admin mengedit angka kolom A–D satu staf pada rekap keadilan; jadwal
     * hariannya disesuaikan supaya rekap = angka yang diinput admin.
     * Body: { month, userId, targets: { A, B, C, D } }
     */
    async adjustJobdeskFairness(req, res, next) {
        try {
            const { month, userId, targets } = req.body;
            if (!month) {
                throw new AppError('Parameter month wajib diisi (YYYY-MM)', 400, 'VALIDATION_ERROR');
            }
            if (!userId) {
                throw new AppError('Parameter userId wajib diisi', 400, 'VALIDATION_ERROR');
            }
            if (!targets || typeof targets !== 'object') {
                throw new AppError('targets wajib berisi kolom A, B, C, D', 400, 'VALIDATION_ERROR');
            }

            const result = await scheduleService.adjustJobdeskCounts({
                month,
                userId: parseInt(userId, 10),
                targets,
            });

            // Audit trail — jejak siapa mengubah hitungan jobdesk siapa.
            const auditService = require('../services/auditService');
            await auditService.log({
                userId: req.user.id,
                action: 'UPDATE',
                entityType: 'JOBDESK_FAIRNESS',
                entityId: String(result.userId),
                details: {
                    month: result.month,
                    userId: result.userId,
                    fullName: result.fullName,
                    before: result.before,
                    after: result.after,
                    changedDays: result.changedDays,
                    changes: result.changes,
                    coverageWarnings: result.coverageWarnings,
                },
            });

            return successResponse(
                res,
                200,
                result,
                `Rekap jobdesk ${result.fullName} bulan ${result.month} disesuaikan `
                + `(${result.changedDays} hari diubah)`
            );
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
