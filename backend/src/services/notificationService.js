const prisma = require('../utils/database');

class NotificationService {
    /**
     * Create a notification
     */
    async create(userId, title, message, type = 'INFO') {
        return await prisma.notification.create({
            data: {
                userId,
                title,
                message,
                type,
                isRead: false
            }
        });
    }

    /**
     * Get user notifications
     */
    async getUserNotifications(userId) {
        return await prisma.notification.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: 20
        });
    }

    /**
     * Mark as read
     */
    async markAsRead(id, userId) {
        return await prisma.notification.updateMany({
            where: { id: parseInt(id), userId },
            data: { isRead: true }
        });
    }

    /**
     * Mark all as read
     */
    async markAllAsRead(userId) {
        return await prisma.notification.updateMany({
            where: { userId, isRead: false },
            data: { isRead: true }
        });
    }
}

module.exports = new NotificationService();
