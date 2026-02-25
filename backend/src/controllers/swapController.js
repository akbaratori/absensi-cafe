const swapService = require('../services/swapService');
const { asyncHandler } = require('../utils/response');

exports.createRequest = asyncHandler(async (req, res) => {
    const swap = await swapService.createRequest(req.user.id, req.body);

    // Notify Target User (TODO: Add Notification service logic later)

    res.status(201).json({
        status: 'success',
        data: { swap }
    });
});

exports.getMySwaps = asyncHandler(async (req, res) => {
    const swaps = await swapService.getUserSwaps(req.user.id);
    res.status(200).json({
        status: 'success',
        data: { swaps }
    });
});

exports.getAllSwaps = asyncHandler(async (req, res) => {
    const swaps = await swapService.getAllSwaps(req.query);
    res.status(200).json({
        status: 'success',
        data: { swaps }
    });
});

exports.approveByUser = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const swap = await swapService.approveByUser(id, req.user.id);

    // Notify Admins (TODO)

    res.status(200).json({
        status: 'success',
        data: { swap }
    });
});

exports.approveByAdmin = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const swap = await swapService.approveByAdmin(id);

    res.status(200).json({
        status: 'success',
        data: { swap }
    });
});

exports.rejectRequest = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const isAdmin = req.user.role === 'ADMIN' || req.user.role === 'OWNER';

    const swap = await swapService.rejectRequest(id, req.user.id, isAdmin);

    res.status(200).json({
        status: 'success',
        data: { swap }
    });
});
