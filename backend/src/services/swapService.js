const prisma = require('../utils/database');
const { ErrorCodes } = require('../utils/AppError');
const notificationService = require('./notificationService');

class SwapService {
    /**
     * Create a new shift swap request
     */
    async createRequest(requesterId, data) {
        const { targetUserId, date, reason } = data;

        if (requesterId === parseInt(targetUserId)) {
            throw new Error('Cannot swap shift with yourself');
        }

        // Get both users with their shift details
        const requester = await prisma.user.findUnique({ where: { id: requesterId }, include: { shift: true } });
        const target = await prisma.user.findUnique({ where: { id: parseInt(targetUserId) }, include: { shift: true } });

        if (!requester || !target) throw ErrorCodes.RESOURCE_NOT_FOUND;

        // Check if shifts are the same
        if (requester.shiftId === target.shiftId) {
            throw new Error(`Cannot swap with same shift (${requester.shift?.name || 'Unknown'}). Swap is only allowed between different shifts.`);
        }

        if (!date) {
            throw new Error('Date is required');
        }

        // Validate date (must be future)
        const swapDate = new Date(date);
        if (isNaN(swapDate.getTime())) {
            throw new Error('Invalid date format');
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (swapDate < today) {
            throw new Error('Cannot swap shifts for past dates');
        }

        // Check for existing requests for this date
        const existing = await prisma.shiftSwap.findFirst({
            where: {
                OR: [
                    { requesterId: requesterId },
                    { targetUserId: requesterId }
                ],
                date: swapDate,
                status: { not: 'REJECTED' }
            }
        });

        if (existing) {
            throw new Error('You already have a swap request for this date');
        }

        const swap = await prisma.shiftSwap.create({
            data: {
                requesterId,
                targetUserId: parseInt(targetUserId),
                date: swapDate,
                reason,
                status: 'PENDING_USER'
            },
            include: {
                target: { select: { fullName: true } },
                requester: { select: { fullName: true } }
            }
        });

        // Notify Target
        await notificationService.create(
            parseInt(targetUserId),
            'Permintaan Tukar Shift',
            `${swap.requester.fullName} ingin bertukar shift dengan Anda pada tanggal ${swapDate.toLocaleDateString('id-ID')}.`,
            'SHIFT_SWAP'
        );

        return swap;
    }

    /**
     * Get swaps for a user (sent and received)
     */
    async getUserSwaps(userId) {
        return await prisma.shiftSwap.findMany({
            where: {
                OR: [
                    { requesterId: userId },
                    { targetUserId: userId }
                ]
            },
            include: {
                requester: { select: { id: true, fullName: true, employeeId: true } },
                target: { select: { id: true, fullName: true, employeeId: true } }
            },
            orderBy: { date: 'desc' }
        });
    }

    /**
     * Admin: Get all swaps
     */
    async getAllSwaps(filters = {}) {
        const where = {};
        if (filters.status) where.status = filters.status;

        return await prisma.shiftSwap.findMany({
            where,
            include: {
                requester: { select: { id: true, fullName: true, employeeId: true } },
                target: { select: { id: true, fullName: true, employeeId: true } }
            },
            orderBy: { date: 'desc' }
        });
    }

    /**
     * Target User Approves Request
     */
    async approveByUser(swapId, targetUserId) {
        const swap = await prisma.shiftSwap.findUnique({
            where: { id: parseInt(swapId) }
        });

        if (!swap) throw ErrorCodes.RESOURCE_NOT_FOUND;
        if (swap.targetUserId !== targetUserId) throw ErrorCodes.FORBIDDEN;
        if (swap.status !== 'PENDING_USER') throw new Error('Request is not pending user approval');

        const updatedSwap = await prisma.shiftSwap.update({
            where: { id: parseInt(swapId) },
            data: { status: 'PENDING_ADMIN' },
            include: { target: true, requester: true }
        });

        // Notify Requester
        await notificationService.create(
            swap.requesterId,
            'Teman Menyetujui Tukar Shift',
            `${updatedSwap.target.fullName} telah menyetujui permintaan tukar shift Anda. Menunggu verifikasi Admin.`,
            'SHIFT_SWAP'
        );

        // Notify Admins
        const admins = await prisma.user.findMany({ where: { role: 'ADMIN', isActive: true } });
        for (const admin of admins) {
            await notificationService.create(
                admin.id,
                'Persetujuan Tukar Shift',
                `${updatedSwap.requester.fullName} dan ${updatedSwap.target.fullName} menunggu verifikasi tukar shift pada ${updatedSwap.date.toLocaleDateString('id-ID')}.`,
                'SHIFT_SWAP_ADMIN'
            );
        }

        return updatedSwap;
    }

    /**
     * Admin Approves Request (Final)
     */
    async approveByAdmin(swapId) {
        const approvedSwap = await prisma.shiftSwap.update({
            where: { id: parseInt(swapId) },
            data: { status: 'APPROVED' },
            include: { requester: true, target: true }
        });

        // Notify Requester
        await notificationService.create(
            approvedSwap.requesterId,
            'Tukar Shift Disetujui Admin',
            `Permintaan tukar shift Anda dengan ${approvedSwap.target.fullName} pada ${approvedSwap.date.toLocaleDateString('id-ID')} telah DISETUJUI Admin.`,
            'SHIFT_SWAP_APPROVED'
        );

        // Notify Target
        await notificationService.create(
            approvedSwap.targetUserId,
            'Tukar Shift Disetujui Admin',
            `Permintaan tukar shift antara Anda dan ${approvedSwap.requester.fullName} pada ${approvedSwap.date.toLocaleDateString('id-ID')} telah DISETUJUI Admin.`,
            'SHIFT_SWAP_APPROVED'
        );

        return approvedSwap;
    }

    /**
     * Reject Request (User or Admin)
     */
    async rejectRequest(swapId, userId, isAdmin = false) {
        const swap = await prisma.shiftSwap.findUnique({
            where: { id: parseInt(swapId) }
        });

        if (!swap) throw ErrorCodes.RESOURCE_NOT_FOUND;

        // Allow Requester to cancel, Target to reject, or Admin to reject
        const isRequester = swap.requesterId === userId;
        const isTarget = swap.targetUserId === userId;

        if (!isAdmin && !isRequester && !isTarget) {
            throw ErrorCodes.FORBIDDEN;
        }

        const rejectedSwap = await prisma.shiftSwap.update({
            where: { id: parseInt(swapId) },
            data: { status: 'REJECTED' },
            include: { requester: true, target: true }
        });

        // Notifications
        if (isAdmin) {
            // Admin rejected
            await notificationService.create(
                rejectedSwap.requesterId,
                'Tukar Shift Ditolak Admin',
                `Permintaan tukar shift Anda dengan ${rejectedSwap.target.fullName} pada ${rejectedSwap.date.toLocaleDateString('id-ID')} telah DITOLAK oleh Admin.`,
                'SHIFT_SWAP_REJECTED'
            );
            await notificationService.create(
                rejectedSwap.targetUserId,
                'Tukar Shift Ditolak Admin',
                `Permintaan tukar shift antara Anda dan ${rejectedSwap.requester.fullName} pada ${rejectedSwap.date.toLocaleDateString('id-ID')} telah DITOLAK oleh Admin.`,
                'SHIFT_SWAP_REJECTED'
            );
        } else if (isTarget) {
            // Target rejected
            await notificationService.create(
                rejectedSwap.requesterId,
                'Tukar Shift Ditolak',
                `${rejectedSwap.target.fullName} menolak permintaan tukar shift Anda.`,
                'SHIFT_SWAP_REJECTED'
            );
        } else if (isRequester) {
            // Requester cancelled
            await notificationService.create(
                rejectedSwap.targetUserId,
                'Permintaan Tukar Shift Dibatalkan',
                `${rejectedSwap.requester.fullName} membatalkan permintaan tukar shift.`,
                'SHIFT_SWAP_CANCELLED'
            );
        }

        return rejectedSwap;
    }

    /**
     * Check if user has an active approved swap for a given date
     */
    async getActiveSwap(userId, date) {
        const checkDate = new Date(date);
        checkDate.setHours(0, 0, 0, 0);

        // Find if this user is INVOLVED in an APPROVED swap for this date
        // If Requester: They are working Target's shift
        // If Target: They are working Requester's shift

        const swap = await prisma.shiftSwap.findFirst({
            where: {
                date: checkDate,
                status: 'APPROVED',
                OR: [
                    { requesterId: userId },
                    { targetUserId: userId }
                ]
            },
            include: {
                requester: { include: { shift: true } },
                target: { include: { shift: true } }
            }
        });

        if (!swap) return null;

        // Return the *other* user's shift
        if (swap.requesterId === userId) {
            // User is Requester -> Wants Target's Shift
            // But usually "Swap" means "I take your shift, you take mine" OR "I take your slot off"?
            // "Tukar Shift" implies swapping schedules.

            // If User is Requester, and Approved, they now follow Target's shift rules.
            return swap.target.shift;
        } else {
            // User is Target, and Approved, they now follow Requester's shift rules.
            return swap.requester.shift;
        }
    }
}

module.exports = new SwapService();
