const cron = require('node-cron');
const prisma = require('../utils/database');
const { sendPushToUser } = require('../services/pushService');
const auditService = require('../services/auditService');

// WITA offset (UTC+8) in milliseconds
const WITA_OFFSET_MS = 8 * 60 * 60 * 1000;

/**
 * Initialize all cron jobs for scheduled push notifications and auto clock-out
 */
function initScheduler() {
    // AUTO CLOCK-OUT: Every 15 minutes, find records without clockOut that exceed max hours
    cron.schedule('*/15 * * * *', async () => {
        try {
            let autoClockoutHours = 10;
            try {
                const cfg = await prisma.systemConfig.findUnique({ where: { key: 'autoClockoutHours' } });
                if (cfg?.value) autoClockoutHours = parseInt(cfg.value, 10);
            } catch (_) { /* fallback to default */ }

            const cutoff = new Date(Date.now() - autoClockoutHours * 60 * 60 * 1000);

            const dangling = await prisma.attendance.findMany({
                where: {
                    clockIn: { lte: cutoff },
                    clockOut: null,
                    status: { not: 'absent' }
                },
                include: {
                    user: { select: { id: true, fullName: true } }
                }
            });

            for (const record of dangling) {
                await prisma.attendance.update({
                    where: { id: record.id },
                    data: { clockOut: new Date(), notes: record.notes ? record.notes + ' | Auto clock-out' : 'Auto clock-out' }
                });
                console.log(`[AutoClockout] Auto clocked-out user ${record.user.fullName} (record #${record.id})`);
            }
        } catch (err) {
            console.error('[AutoClockout] Cron error:', err.message);
        }
    });

    console.log('[Scheduler] Auto clock-out cron initialized');

    // ABSENT DETECTION: DISABLED — staff will do manual attendance
    // cron.schedule('50 15 * * *', async () => { ... });
    console.log('[Scheduler] Absent detection cron DISABLED (manual attendance mode)');

    // SHIFT REMINDER: Every minute check if any shift starts in 30 minutes
    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
        console.log('[Scheduler] VAPID keys not set - shift reminder push disabled');
    } else {
        cron.schedule('* * * * *', async () => {
            try {
                const now = new Date();
                const in30Min = new Date(now.getTime() + 30 * 60 * 1000);

                const nowWITA = new Date(now.getTime() + WITA_OFFSET_MS);
                const witaDateStr = nowWITA.toISOString().slice(0, 10);
                const todayStart = new Date(`${witaDateStr}T00:00:00+08:00`);
                const todayEnd = new Date(`${witaDateStr}T23:59:59+08:00`);

                const schedules = await prisma.schedule.findMany({
                    where: {
                        date: {
                            gte: todayStart,
                            lte: todayEnd
                        },
                        shift: { not: 'LIBUR' }
                    },
                    include: {
                        user: {
                            select: { id: true, fullName: true, shift: true }
                        }
                    }
                });

                for (const schedule of schedules) {
                    const user = schedule.user;
                    if (!user || !user.shift) continue;

                    const shift = await prisma.shift.findFirst({
                        where: { name: schedule.shift }
                    });

                    if (!shift || !shift.startTime) continue;

                    const [sh, sm] = shift.startTime.split(':').map(Number);
                    const shiftStart = new Date(todayStart.getTime() + sh * 60 * 60 * 1000 + sm * 60 * 1000);

                    const diffMs = shiftStart.getTime() - now.getTime();
                    const diffMinutes = Math.round(diffMs / 60000);

                    if (diffMinutes >= 29 && diffMinutes <= 31) {
                        try {
                            await sendPushToUser(
                                user.id,
                                '\u23f0 Pengingat Shift',
                                `Shift kamu (${schedule.shift}) dimulai 30 menit lagi! Jangan sampai telat.`,
                                { url: '/attendance' }
                            );
                        } catch (err) {
                            console.error(`[Scheduler] Failed to send shift reminder to user ${user.id}:`, err.message);
                        }
                    }
                }
            } catch (err) {
                console.error('[Scheduler] Shift reminder error:', err.message);
            }
        });

        console.log('[Scheduler] Shift reminder cron initialized');
    }

    // ROLLING LIBUR OTOMATIS: Setiap tanggal 1 jam 01:00 WITA, geser offDay semua karyawan +1 hari
    // offDay: 0=Minggu, 1=Senin, ..., 6=Sabtu
    cron.schedule('0 1 1 * *', async () => {
        try {
            const users = await prisma.user.findMany({
                where: { isActive: true, role: 'EMPLOYEE' },
                select: { id: true, fullName: true, offDay: true },
            });

            let updated = 0;
            for (const user of users) {
                const newOffDay = (user.offDay + 1) % 7;
                await prisma.user.update({
                    where: { id: user.id },
                    data: { offDay: newOffDay },
                });
                updated++;
            }

            console.log(`[RollingLibur] Berhasil menggeser hari libur ${updated} karyawan (+1 hari)`);
        } catch (err) {
            console.error('[RollingLibur] Cron error:', err.message);
        }
    }, {
        timezone: 'Asia/Makassar', // WITA
    });

    console.log('[Scheduler] Rolling libur otomatis (bulanan) cron initialized');
}

module.exports = { initScheduler };
