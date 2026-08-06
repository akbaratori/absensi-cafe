const cron = require('node-cron');
const prisma = require('../utils/database');
const { sendPushToUser } = require('../services/pushService');
const auditService = require('../services/auditService');

// WITA offset (UTC+8) in milliseconds
const WITA_OFFSET_MS = 8 * 60 * 60 * 1000;

/**
 * Initialize all cron jobs for scheduled push notifications
 */
function initScheduler() {
    // Daily absent auto-marking at 23:05 WITA
    cron.schedule('5 23 * * *', async () => {
        try {
            console.log('[Scheduler] Running daily absent auto-marking...');

            const now = new Date();
            const witaNow = new Date(now.getTime() + WITA_OFFSET_MS);
            const witaDateStr = witaNow.toISOString().slice(0, 10);
            const todayStart = new Date(`${witaDateStr}T00:00:00+08:00`);
            const todayEnd = new Date(`${witaDateStr}T23:59:59.999+08:00`);

            const employees = await prisma.user.findMany({
                where: { isActive: true },
                select: {
                    id: true,
                    fullName: true,
                    shiftId: true,
                    shift: true,
                },
            });

            let absentCount = 0;

            for (const emp of employees) {
                try {
                    const attendance = await prisma.attendance.findFirst({
                        where: {
                            userId: emp.id,
                            date: { gte: todayStart, lt: todayEnd },
                        },
                    });

                    if (attendance) {
                        continue;
                    }

                    const absentTime = new Date(`${witaDateStr}T23:00:00+08:00`);
                    await prisma.attendance.create({
                        data: {
                            userId: emp.id,
                            date: todayStart,
                            clockIn: absentTime,
                            status: 'ABSENT',
                            notes: '[Tidak hadir tanpa keterangan - Auto-detected]',
                        },
                    });

                    absentCount++;
                } catch (e) {
                    console.error(`[Scheduler] Failed to auto-mark absent for user ${emp.id}:`, e.message);
                }

            await auditService.logSystemAction(
                'AUTO_MARK_ABSENT',
                { date: witaDateStr, absentCount },
                { source: 'scheduler' }
            );

            console.log(`[Scheduler] Daily absent auto-marking completed. ${absentCount} employee(s) marked absent.`);
        } catch (err) {
            console.error('[Scheduler] Daily absent auto-marking error:', err.message);
        }
    }, {
        timezone: 'Asia/Makassar',
    });

    // Daily attendance reminder at 10:00 WITA
    cron.schedule('0 10 * * *', async () => {
        try {
            console.log('[Scheduler] Running attendance reminder...');

            const now = new Date();
            const witaNow = new Date(now.getTime() + WITA_OFFSET_MS);
            const witaDateStr = witaNow.toISOString().slice(0, 10);
            const todayStart = new Date(`${witaDateStr}T00:00:00+08:00`);
            const todayEnd = new Date(`${witaDateStr}T23:59:59.999+08:00`);

            const employees = await prisma.user.findMany({
                where: { isActive: true },
                select: {
                    id: true,
                    fullName: true,
                },
            });

            for (const emp of employees) {
                try {
                    const attendance = await prisma.attendance.findFirst({
                        where: {
                            userId: emp.id,
                            date: { gte: todayStart, lt: todayEnd },
                        },
                    });

                    if (!attendance) {
                        await sendPushToUser(
                            emp.id,
                            'Pengingat Absensi',
                            'Anda belum melakukan absensi hari ini. Silakan segera absen.'
                        );
                    }
                } catch (e) {
                    console.error(`[Scheduler] Failed to send reminder for user ${emp.id}:`, e.message);
                }

            console.log('[Scheduler] Attendance reminder completed');
        } catch (err) {
            console.error('[Scheduler] Attendance reminder error:', err.message);
        }
    }, {
        timezone: 'Asia/Makassar',
    });

    // Shift reminder every 5 minutes
    cron.schedule('*/5 * * * *', async () => {
        try {
            const now = new Date();
            const nowWita = new Date(now.getTime() + WITA_OFFSET_MS);
            const witaDateStr = nowWita.toISOString().slice(0, 10);
            const todayStart = new Date(`${witaDateStr}T00:00:00+08:00`);
            const todayEnd = new Date(`${witaDateStr}T23:59:59.999+08:00`);

            const users = await prisma.user.findMany({
                where: {
                    isActive: true,
                },
                include: {
                    shift: true,
                },
            });

            for (const user of users) {
                try {
                    const schedule = await prisma.userSchedule.findFirst({
                        where: {
                            userId: user.id,
                            date: todayStart,
                        },
                        include: {
                            shift: true,
                        },
                    });

                    if (schedule && schedule.isOffDay) continue;
                    if (!schedule && !user.shiftId) continue;

                    const shift = schedule?.shift || user.shift;
                    if (!shift || !shift.startTime) continue;

                    const [hour, minute] = shift.startTime.split(':').map(Number);
                    const shiftStart = new Date(`${witaDateStr}T00:00:00+08:00`);
                    shiftStart.setHours(hour, minute, 0, 0);

                    const diffMs = shiftStart.getTime() - nowWita.getTime();
                    const diffMinutes = Math.round(diffMs / 60000);

                    if (diffMinutes < 25 || diffMinutes > 35) continue;

                    const attendance = await prisma.attendance.findFirst({
                        where: {
                            userId: user.id,
                            date: { gte: todayStart, lt: todayEnd },
                        },
                    });

                    if (!attendance) {
                        await sendPushToUser(
                            user.id,
                            '⏰ Pengingat Shift',
                            `Shift kamu (${shift.name}) dimulai 30 menit lagi! Jangan sampai telat.`,
                            { url: '/attendance' }
                        );
                    }
                } catch (err) {
                    console.error('[Scheduler] Shift reminder error:', err.message);
                }

            console.log('[Scheduler] Shift reminder cron initialized');
        } catch (err) {
            console.error('[Scheduler] Shift reminder cron failed:', err.message);
        }
    }, {
        timezone: 'Asia/Makassar',
    });
}

module.exports = { initScheduler };