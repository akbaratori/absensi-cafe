const cron = require('node-cron');
const prisma = require('../utils/database');
const { sendPushToUser } = require('../services/pushService');

/**
 * Initialize all cron jobs for scheduled push notifications
 */
function initScheduler() {
    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
        console.log('[Scheduler] VAPID keys not set — scheduler push notifications disabled');
        return;
    }

    // ─────────────────────────────────────────────
    // Every minute: check if any shift starts in 30 minutes
    // ─────────────────────────────────────────────
    cron.schedule('* * * * *', async () => {
        try {
            const now = new Date();
            // Target time = now + 30 minutes
            const target = new Date(now.getTime() + 30 * 60 * 1000);
            const targetHHMM = `${String(target.getHours()).padStart(2, '0')}:${String(target.getMinutes()).padStart(2, '0')}`;

            // Get today's date as a Date at 00:00:00
            const todayStart = new Date(now);
            todayStart.setHours(0, 0, 0, 0);
            const todayEnd = new Date(todayStart);
            todayEnd.setDate(todayEnd.getDate() + 1);

            // Find all active users whose shift starts exactly at targetHHMM
            const users = await prisma.user.findMany({
                where: {
                    isActive: true,
                    shift: { startTime: targetHHMM }
                },
                include: { shift: true }
            });

            // Only notify users who have a schedule today (not off day)
            for (const user of users) {
                const schedule = await prisma.userSchedule.findFirst({
                    where: {
                        userId: user.id,
                        date: { gte: todayStart, lt: todayEnd },
                        isOffDay: false
                    }
                });

                if (schedule || !user.shiftId) {
                    // Check user hasn't already clocked in today
                    const attendance = await prisma.attendance.findFirst({
                        where: {
                            userId: user.id,
                            date: { gte: todayStart, lt: todayEnd }
                        }
                    });

                    if (!attendance) {
                        await sendPushToUser(
                            user.id,
                            '⏰ Pengingat Shift',
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

    console.log('[Scheduler] Push notification cron jobs initialized ✅');
}

module.exports = { initScheduler };
