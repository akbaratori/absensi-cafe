const prisma = require('../utils/database');

// Get user notifications
exports.getUserNotifications = async (req, res) => {
    try {
        const notifications = await prisma.notification.findMany({
            where: { userId: req.user.id },
            orderBy: { createdAt: 'desc' },
            take: 20
        });

        const unreadCount = await prisma.notification.count({
            where: {
                userId: req.user.id,
                isRead: false
            }
        });

        res.status(200).json({
            success: true,
            data: {
                notifications,
                unreadCount
            }
        });
    } catch (error) {
        console.error('Get notifications error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch notifications'
        });
    }
};

// Mark notification as read
exports.markAsRead = async (req, res) => {
    try {
        await prisma.notification.updateMany({
            where: {
                id: parseInt(req.params.id),
                userId: req.user.id
            },
            data: { isRead: true }
        });

        res.status(200).json({
            success: true,
            message: 'Notification marked as read'
        });
    } catch (error) {
        console.error('Mark read error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update notification'
        });
    }
};

// Mark all as read
exports.markAllAsRead = async (req, res) => {
    try {
        await prisma.notification.updateMany({
            where: {
                userId: req.user.id,
                isRead: false
            },
            data: { isRead: true }
        });

        res.status(200).json({
            success: true,
            message: 'All notifications marked as read'
        });
    } catch (error) {
        console.error('Mark all read error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update notifications'
        });
    }
};

// ─── Web Push Subscriptions ───────────────────────────────────────────────────

// Get VAPID public key
exports.getVapidPublicKey = (req, res) => {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    if (!publicKey) {
        return res.status(503).json({
            success: false,
            message: 'Push notifications not configured'
        });
    }
    res.status(200).json({ success: true, data: { publicKey } });
};

// Save push subscription from browser
exports.subscribe = async (req, res) => {
    try {
        const { endpoint, keys } = req.body;
        const userId = req.user.id;

        if (!endpoint || !keys?.p256dh || !keys?.auth) {
            return res.status(400).json({
                success: false,
                message: 'Invalid subscription data'
            });
        }

        // Upsert: avoid duplicate subscriptions for same endpoint
        const existing = await prisma.pushSubscription.findFirst({
            where: { userId, endpoint }
        });

        if (!existing) {
            await prisma.pushSubscription.create({
                data: {
                    userId,
                    endpoint,
                    p256dh: keys.p256dh,
                    auth: keys.auth
                }
            });
        }

        res.status(200).json({ success: true, message: 'Subscribed to push notifications' });
    } catch (error) {
        console.error('Subscribe error:', error);
        res.status(500).json({ success: false, message: 'Failed to subscribe' });
    }
};

// Remove push subscription (on logout)
exports.unsubscribe = async (req, res) => {
    try {
        const { endpoint } = req.body;
        const userId = req.user.id;

        if (endpoint) {
            await prisma.pushSubscription.deleteMany({
                where: { userId, endpoint }
            });
        } else {
            // Remove all subscriptions for this user
            await prisma.pushSubscription.deleteMany({ where: { userId } });
        }

        res.status(200).json({ success: true, message: 'Unsubscribed from push notifications' });
    } catch (error) {
        console.error('Unsubscribe error:', error);
        res.status(500).json({ success: false, message: 'Failed to unsubscribe' });
    }
};
