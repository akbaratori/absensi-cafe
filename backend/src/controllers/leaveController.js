const leaveService = require('../services/leaveService');
const { asyncHandler } = require('../utils/response');

exports.createLeave = asyncHandler(async (req, res) => {
    const photo = req.file ? `/uploads/leaves/${req.file.filename}` : null;
    const leaveData = { ...req.body, proof: photo };

    const leave = await leaveService.createLeave(req.user.id, leaveData);

    // Notify Admins
    const prisma = require('../utils/database');
    const admins = await prisma.user.findMany({ where: { role: 'ADMIN' } });

    if (admins.length > 0) {
        await prisma.notification.createMany({
            data: admins.map(admin => ({
                userId: admin.id,
                title: 'Permintaan Cuti Baru',
                message: `${req.user.fullName} mengajukan cuti ${leaveData.type}`,
                type: 'INFO',
                link: '/admin/leaves'
            }))
        });
    }

    res.status(201).json({
        status: 'success',
        data: { leave },
    });
});

exports.getMyLeaves = asyncHandler(async (req, res) => {
    const leaves = await leaveService.getUserLeaves(req.user.id);

    res.status(200).json({
        status: 'success',
        data: { leaves },
    });
});

exports.getLeaveQuota = asyncHandler(async (req, res) => {
    const balance = await leaveService.getLeaveBalance(req.user.id);

    res.status(200).json({
        status: 'success',
        data: balance,
    });
});

exports.getAllLeaves = asyncHandler(async (req, res) => {
    const filters = req.query; // e.g. ?status=PENDING
    const leaves = await leaveService.getAllLeaves(filters);

    res.status(200).json({
        status: 'success',
        data: { leaves },
    });
});

exports.updateLeaveStatus = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status } = req.body; // APPROVED or REJECTED

    const leave = await leaveService.updateLeaveStatus(id, status);

    // Notify User
    const prisma = require('../utils/database');
    await prisma.notification.create({
        data: {
            userId: leave.userId,
            title: `Pengajuan Cuti ${status === 'APPROVED' ? 'Disetujui' : 'Ditolak'}`,
            message: `Pengajuan cuti Anda telah ${status === 'APPROVED' ? 'disetujui' : 'ditolak'} oleh admin.`,
            type: status === 'APPROVED' ? 'SUCCESS' : 'ERROR',
            link: '/leaves'
        }
    });

    res.status(200).json({
        status: 'success',
        data: { leave },
    });
});

exports.deleteLeave = asyncHandler(async (req, res) => {
    const { id } = req.params;

    await leaveService.deleteLeave(id);

    res.status(200).json({
        status: 'success',
        message: 'Leave request deleted successfully',
    });
});
