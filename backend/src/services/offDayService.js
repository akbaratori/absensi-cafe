const prisma = require('../utils/database');
const notificationService = require('./notificationService');

class OffDayService {
    /**
     * Create a request to swap Off-Day
     * @param {number} userId 
     * @param {Date} offDate - Date user wants to be OFF (currently working)
     * @param {Date} workDate - Date user wants to WORK (currently off)
     * @param {string} reason 
     */
    async createRequest(userId, offDate, workDate, reason) {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) throw new Error('User not found');

        const requestedOffDate = new Date(offDate);
        const requestedWorkDate = new Date(workDate);
        requestedOffDate.setHours(0, 0, 0, 0);
        requestedWorkDate.setHours(0, 0, 0, 0);

        // 1. Validate: Dates must be in future
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (requestedOffDate <= today || requestedWorkDate <= today) {
            throw new Error('Tanggal harus di masa depan');
        }

        // 2. Validate: Dates must be different
        if (requestedOffDate.getTime() === requestedWorkDate.getTime()) {
            throw new Error('Tanggal libur dan ganti tidak boleh sama');
        }

        // 3. Validate Days
        const offDayIndex = user.offDay; // 0=Sunday
        const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
        const userOffDayName = days[offDayIndex];

        // requestedOffDate should currently be a WORK DAY (day != offDayIndex)
        if (requestedOffDate.getDay() === offDayIndex) {
            const dayName = days[requestedOffDate.getDay()];
            throw new Error(`Tanggal Ingin Libur (${requestedOffDate.toLocaleDateString('id-ID')} - ${dayName}) tidak valid karena hari ${dayName} sudah merupakan hari libur rutin Anda. Pilih hari kerja biasa.`);
        }

        // requestedWorkDate should currently be an OFF DAY (day == offDayIndex)
        if (requestedWorkDate.getDay() !== offDayIndex) {
            const dayName = days[requestedWorkDate.getDay()];
            throw new Error(`Tanggal Pengganti (${requestedWorkDate.toLocaleDateString('id-ID')} - ${dayName}) tidak valid. Tanggal pengganti harus merupakan hari ${userOffDayName} (hari libur rutin Anda).`);
        }

        // 4. Check for existing pending requests or overlapping approved requests
        const existing = await prisma.offDayRequest.findFirst({
            where: {
                userId,
                status: { in: ['PENDING', 'APPROVED'] },
                OR: [
                    { offDate: requestedOffDate },
                    { workDate: requestedWorkDate },
                    { offDate: requestedWorkDate }, // Overlap check
                    { workDate: requestedOffDate }
                ]
            }
        });

        if (existing) {
            throw new Error('Sudah ada pengajuan tukar libur pada tanggal tersebut');
        }

        // Create Request
        const request = await prisma.offDayRequest.create({
            data: {
                userId,
                offDate: requestedOffDate,
                workDate: requestedWorkDate,
                reason,
                status: 'PENDING'
            }
        });

        // Notify Admin (All admins)
        const admins = await prisma.user.findMany({ where: { role: 'ADMIN', isActive: true } });
        for (const admin of admins) {
            await notificationService.create(
                admin.id,
                'Pengajuan Tukar Libur Baru',
                `${user.fullName} mengajukan tukar libur: ${requestedOffDate.toLocaleDateString()} diganti ${requestedWorkDate.toLocaleDateString()}`,
                'OFF_DAY_REQUEST'
            );
        }

        return request;
    }

    /**
     * Approve Request
     */
    async approveRequest(requestId, adminId) {
        const request = await prisma.offDayRequest.findUnique({
            where: { id: parseInt(requestId) },
            include: { user: true }
        });
        if (!request) throw new Error('Request not found');
        if (request.status !== 'PENDING') throw new Error('Request status is not PENDING');

        // Execute in transaction to ensure consistency
        const updated = await prisma.$transaction(async (tx) => {
            // 1. Update Request Status
            const res = await tx.offDayRequest.update({
                where: { id: parseInt(requestId) },
                data: { status: 'APPROVED' }
            });

            // 2. Update UserSchedule for Off Date (Became OFF)
            // We set isOffDay = true and shiftId = null
            await tx.userSchedule.upsert({
                where: {
                    userId_date: {
                        userId: request.userId,
                        date: request.offDate
                    }
                },
                update: {
                    isOffDay: true,
                    shiftId: null
                },
                create: {
                    userId: request.userId,
                    date: request.offDate,
                    isOffDay: true,
                    shiftId: null
                }
            });

            // 3. Update UserSchedule for Work Date (Became WORK)
            // We set isOffDay = false. 
            // Note: Ideally we should determine the shiftId from the schedule pattern,
            // but for now we'll pick the user's current shiftId preference or default.
            // If the user has a preferred shift, we use it, otherwise we might need a fallback.
            // For a robust fix, we fetch the schedule or use default.
            await tx.userSchedule.upsert({
                where: {
                    userId_date: {
                        userId: request.userId,
                        date: request.workDate
                    }
                },
                update: {
                    isOffDay: false,
                    // If a shift was already assigned (unlikely if it was an off day), keep it, otherwise use user's default
                    shiftId: request.user.shiftId || 1
                },
                create: {
                    userId: request.userId,
                    date: request.workDate,
                    isOffDay: false,
                    shiftId: request.user.shiftId || 1
                }
            });

            return res;
        });

        // Notify User
        await notificationService.create(
            request.userId,
            'Tukar Libur Disetujui',
            `Pengajuan tukar libur Anda (${request.offDate.toLocaleDateString()} -> ${request.workDate.toLocaleDateString()}) telah DISETUJUI.`,
            'OFF_DAY_APPROVED'
        );

        return updated;
    }

    /**
     * Reject Request
     */
    async rejectRequest(requestId, adminId) {
        const request = await prisma.offDayRequest.findUnique({
            where: { id: parseInt(requestId) },
            include: { user: true }
        });
        if (!request) throw new Error('Request not found');
        if (request.status !== 'PENDING') throw new Error('Request status is not PENDING');

        const updated = await prisma.offDayRequest.update({
            where: { id: parseInt(requestId) },
            data: { status: 'REJECTED' }
        });

        // Notify User
        await notificationService.create(
            request.userId,
            'Tukar Libur Ditolak',
            `Pengajuan tukar libur Anda telah DITOLAK.`,
            'OFF_DAY_REJECTED'
        );

        return updated;
    }

    /**
     * Get Requests
     */
    async getRequests(userId, role, status) {
        const where = {};
        if (role !== 'ADMIN') {
            where.userId = userId;
        }
        if (status) {
            where.status = status;
        }

        return await prisma.offDayRequest.findMany({
            where,
            include: { user: true },
            orderBy: { createdAt: 'desc' }
        });
    }

    /**
     * Check if a date is effectively an OFF DAY for a user
     * (Checking Default Off Day + Approved Swaps)
     */
    async isOffDay(userId, date) {
        const checkDate = new Date(date);
        checkDate.setHours(0, 0, 0, 0);

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) return false;

        const defaultOffDay = user.offDay;
        const dayOfWeek = checkDate.getDay();

        // Check for Approved Swaps
        const swap = await prisma.offDayRequest.findFirst({
            where: {
                userId,
                status: 'APPROVED',
                OR: [
                    { offDate: checkDate }, // User wanted this day OFF (even if normally work)
                    { workDate: checkDate } // User wanted this day WORK (even if normally off)
                ]
            }
        });

        if (swap) {
            // If today matches 'offDate', it is now OFF.
            if (swap.offDate.getTime() === checkDate.getTime()) return true;
            // If today matches 'workDate', it is now WORKING.
            if (swap.workDate.getTime() === checkDate.getTime()) return false;
        }

        // Default Fallback
        return dayOfWeek === defaultOffDay;
    }
}

module.exports = new OffDayService();
