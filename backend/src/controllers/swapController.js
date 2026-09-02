const swapService = require('../services/swapService');

/**
 * POST /api/v1/swaps
 * Create a new shift swap request
 */
async function createRequest(req, res, next) {
  try {
    const data = req.body;
    const result = await swapService.createRequest(req.user.id, data);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/v1/swaps/:id/respond
 * Target employee accepts or rejects the swap
 */
async function respondToRequest(req, res, next) {
  try {
    const { id } = req.params;
    const { action } = req.body; // 'ACCEPT' or 'REJECT'

    if (!action || !['ACCEPT', 'REJECT'].includes(action)) {
      return res.status(400).json({ success: false, message: 'Action harus ACCEPT atau REJECT.' });
    }

    const result = await swapService.respondToRequest(id, req.user.id, action);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

/**
 * POST/PUT /api/v1/swaps/:id/approve
 * Admin approves or rejects the swap
 */
async function approveByAdmin(req, res, next) {
  try {
    const { id } = req.params;
    const { action } = req.body; // 'APPROVE' or 'REJECT'

    if (!action || !['APPROVE', 'REJECT'].includes(action)) {
      return res.status(400).json({ success: false, message: 'Action harus APPROVE atau REJECT.' });
    }

    const result = await swapService.approveByAdmin(id, req.user.id, action);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/v1/swaps/:id/cancel
 * Requester cancels their request (only if still pending target response)
 */
async function cancelRequest(req, res, next) {
  try {
    const { id } = req.params;
    const result = await swapService.cancelRequest(id, req.user.id);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/swaps/my
 * Get swaps for the current user
 */
async function getMySwaps(req, res, next) {
  try {
    const { status } = req.query;
    const swaps = await swapService.getUserSwaps(req.user.id, { status });
    res.json({ success: true, data: swaps });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/swaps
 * Get all swaps (admin only)
 */
async function getAllSwaps(req, res, next) {
  try {
    const { status } = req.query;
    const swaps = await swapService.getAllSwaps({ status });
    res.json({ success: true, data: swaps });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/swaps/inbox
 * Get swaps that need current user's target response
 */
async function getInbox(req, res, next) {
  try {
    const swaps = await swapService.getPendingTargetResponse(req.user.id);
    res.json({ success: true, data: swaps });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/swaps/pending-admin-approval
 * Get swaps that need admin approval
 */
async function getPendingAdminApproval(req, res, next) {
  try {
    const swaps = await swapService.getPendingAdminApproval();
    res.json({ success: true, data: swaps });
  } catch (error) {
    next(error);
  }
}

async function revertByAdmin(req, res, next) {
  try {
    const result = await swapService.revertByAdmin(
      req.params.id,
      req.user.id,
      req.body.note
    );
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createRequest,
  respondToRequest,
  approveByAdmin,
  revertByAdmin,
  cancelRequest,
  getMySwaps,
  getAllSwaps,
  getInbox,
  getPendingAdminApproval,
};