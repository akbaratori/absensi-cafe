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
                if (cfg) autoClockoutHours = parseInt(cfg.value, 10) || 10;
            } catch (e) { /* use default */ }

            const thresholdTime = new Date(Date.now() - autoClockoutHours * 60 * 60 * 1000);

            const staleRecords = await prisma.attendance.findMany({
                where: {
                    clockOut: null,
                    clockIn: { lt: thresholdTime },
                },
                include: {
                    user: { select: { id: true, fullName: true, shiftId: true } }
                }
            });

            if (staleRecords.length === 0) return;

            console.log(`[AutoClockout] Found ${staleRecords.length} stale attendance records`);

            for (const record of staleRecords) {
                const autoClockOut = new Date(record.clockIn.getTime() + autoClockoutHours * 60 * 60 * 1000);

                await prisma.attendance.update({
                    where: { id: record.id },
                    data: {
                        clockOut: autoClockOut,
                        notes: record.notes
                            ? `${record.notes} | [Auto clock-out oleh sistem]`
                            : '[Auto clock-out oleh sistem]',
                    },
                });

                await auditService.logAutoClockout(record.id, record.userId, autoClockOut);

                await sendPushToUser(
                    record.userId,
                    '\u26a0\ufe0f Auto Clock-Out',
                    `Kamu lupa clock-out! Sistem otomatis mencatat jam pulang setelah ${autoClockoutHours} jam.`,
                    { url: '/attendance' }
                ).catch(() => {});

                console.log(`[AutoClockout] Auto clocked-out user ${record.user.fullName} (record #${record.id})`);
            }
        } catch (err) {
            console.error('[AutoClockout] Cron error:', err.message);
        }
    });

    console.log('[Scheduler] Auto clock-out cron initialized');

    // ABSENT DETECTION: Every day at 23:50 WITA (15:50 UTC)
    cron.schedule('50 15 * * *', async () => {
        try {
            const nowWITA = new Date(Date.now() + WITA_OFFSET_MS);
            const witaDateStr = nowWITA.toISOString().slice(0, 10);
            const todayStart = new Date(`${witaDateStr}T00:00:00+08:00`);
            const todayEnd = new Date(`${witaDateStr}T23:59:59+08:00`);

            // Check if today is a public holiday
            const isPublicHoliday = await prisma.publicHoliday.findFirst({
                where: { date: { gte: todayStart, lte: todayEnd } }
            });
            if (isPublicHoliday) {
                console.log(`[AbsentDetection] Skipped — today is a public holiday: ${isPublicHoliday.name}`);
                return;
            }

            const employees = await prisma.user.findMany({
                where: { isActive: true, role: 'EMPLOYEE' },
                select: { id: true, fullName: true, offDay: true }
            });

            const attendanceToday = await prisma.attendance.findMany({
                where: { date: { gte: todayStart, lte: todayEnd } },
                select: { userId: true }
            });
            const clockedInUserIds = new Set(attendanceToday.map(a => a.userId));

            const approvedLeaves = await prisma.leave.findMany({
                where: {
                    status: 'APPROVED',
                    startDate: { lte: todayEnd },
                    endDate: { gte: todayStart }
                },
                select: { userId: true }
            });
            const onLeaveUserIds = new Set(approvedLeaves.map(l => l.userId));

            const schedules = await prisma.userSchedule.findMany({
                where: {
                    date: { gte: todayStart, lte: todayEnd },
                    isOffDay: true
                },
                select: { userId: true }
            });
            const offDayUserIds = new Set(schedules.map(s => s.userId));

            const dayOfWeek = nowWITA.getDay();
            let absentCount = 0;

            for (const emp of employees) {
                if (clockedInUserIds.has(emp.id)) continue;
                if (onLeaveUserIds.has(emp.id)) continue;
                if (offDayUserIds.has(emp.id)) continue;
                if (emp.offDay === dayOfWeek) continue;

                try {
                    await prisma.attendance.create({
                        data: {
                            userId: emp.id,
                            date: todayStart,
                            clockIn: todayStart,
                            status: 'ABSENT',
                            notes: '[Tidak hadir tanpa keterangan - Auto-detected]'
                        }
                    });
                    absentCount++;
                } catch (e) {
                    if (e.code !== 'P2002') {
                        console.error(`[AbsentDetection] Error for user ${emp.id}:`, e.message);
                    }
                }
            }

            if (absentCount > 0) {
                console.log(`[AbsentDetection] Created ${absentCount} ABSENT records for ${witaDateStr}`);
            }
        } catch (err) {
            console.error('[AbsentDetection] Cron error:', err.message);
        }
    });

    console.log('[Scheduler] Absent detection cron initialized');

    // SHIFT REMINDER: Every minute check if any shift starts in 30 minutes
    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
        console.log('[Scheduler] VAPID keys not set - shift reminder push disabled');
    } else {
        cron.schedule('* * * * *', async () => {
            try {
                const now = new Date();
                const target = new Date(now.getTime() + 30 * 60 * 1000);
                const targetHHMM = `${String(target.getHours()).padStart(2, '0')}:${String(target.getMinutes()).padStart(2, '0')}`;

                const todayStart = new Date(now);
                todayStart.setHours(0, 0, 0, 0);
                const todayEnd = new Date(todayStart);
                todayEnd.setDate(todayEnd.getDate() + 1);

                const users = await prisma.user.findMany({
                    where: {
                        isActive: true,
                        shift: { startTime: targetHHMM }
                    },
                    include: { shift: true }
                });

                for (const user of users) {
                    const schedule = await prisma.userSchedule.findFirst({
                        where: {
                            userId: user.id,
                            date: { gte: todayStart, lt: todayEnd },
                            isOffDay: false
                        }
                    });

                    if (schedule || !user.shiftId) {
                        const attendance = await prisma.attendance.findFirst({
                            where: {
                                userId: user.id,
                                date: { gte: todayStart, lt: todayEnd }
                            }
                        });

                        if (!attendance) {
                            await sendPushToUser(
                                user.id,
                                '\u23f0 Pengingat Shift',
                                `Shift kamu (${user.shift?.name}) dimulai 30 menit lagi! Jangan sampai telat.`,
                                { url: '/attendance' }
                            );
                        }
                    }
                }
            } catch (err) {
                console.error('[Scheduler] Shift reminder error:', err.message);
            }
        });

        console.log('[Scheduler] Shift reminder cron initialized');
    }
}

module.exports = { initScheduler };
