const webpush = require('web-push');
const prisma = require('../utils/database');

// Configure VAPID keys (set via environment variables)
webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@cafe.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
);

/**
 * Send a push notification to a specific user
 * @param {number} userId
 * @param {string} title
 * @param {string} body
 * @param {object} data - additional data (e.g. { url: '/attendance' })
 */
async function sendPushToUser(userId, title, body, data = {}) {
    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
        console.log('[Push] VAPID keys not configured, skipping push notification');
        return;
    }

    try {
        const subscriptions = await prisma.pushSubscription.findMany({
            where: { userId }
        });

        if (subscriptions.length === 0) return;

        const payload = JSON.stringify({
            title,
            body,
            icon: '/icons/icon-192x192.png',
            badge: '/icons/badge-72x72.png',
            data: {
                url: data.url || '/',
                ...data
            }
        });

        const sendPromises = subscriptions.map(async (sub) => {
            const pushSubscription = {
                endpoint: sub.endpoint,
                keys: {
                    p256dh: sub.p256dh,
                    auth: sub.auth
                }
            };
            try {
                await webpush.sendNotification(pushSubscription, payload);
            } catch (err) {
                // If subscription is expired/invalid, remove it
                if (err.statusCode === 410 || err.statusCode === 404) {
                    await prisma.pushSubscription.delete({ where: { id: sub.id } });
                    console.log(`[Push] Removed expired subscription for user ${userId}`);
                } else {
                    console.error(`[Push] Error sending to user ${userId}:`, err.message);
                }
            }
        });

        await Promise.all(sendPromises);
    } catch (error) {
        console.error('[Push] sendPushToUser error:', error.message);
    }
}

/**
 * Send a push notification to ALL active users
 */
async function sendPushToAll(title, body, data = {}) {
    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
        console.log('[Push] VAPID keys not configured, skipping broadcast');
        return;
    }

    try {
        const subscriptions = await prisma.pushSubscription.findMany({
            include: { user: { select: { isActive: true } } }
        });

        const activeSubscriptions = subscriptions.filter(s => s.user.isActive);

        const payload = JSON.stringify({
            title,
            body,
            icon: '/icons/icon-192x192.png',
            badge: '/icons/badge-72x72.png',
            data: { url: data.url || '/', ...data }
        });

        const sendPromises = activeSubscriptions.map(async (sub) => {
            const pushSubscription = {
                endpoint: sub.endpoint,
                keys: { p256dh: sub.p256dh, auth: sub.auth }
            };
            try {
                await webpush.sendNotification(pushSubscription, payload);
            } catch (err) {
                if (err.statusCode === 410 || err.statusCode === 404) {
                    await prisma.pushSubscription.delete({ where: { id: sub.id } });
                }
            }
        });

        await Promise.all(sendPromises);
        console.log(`[Push] Broadcasted to ${activeSubscriptions.length} subscriptions`);
    } catch (error) {
        console.error('[Push] sendPushToAll error:', error.message);
    }
}

module.exports = { sendPushToUser, sendPushToAll };
