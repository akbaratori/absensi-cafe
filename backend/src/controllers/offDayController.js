const offDayService = require('../services/offDayService');
const { successResponse } = require('../utils/response');
const { asyncHandler } = require('../utils/response');

/**
 * POST /api/v1/off-days
 * Create off-day swap request
 */
exports.createRequest = asyncHandler(async (req, res) => {
  const data = req.body;
  const result = await offDayService.createRequest(req.user.id, data);
  return successResponse(res, 201, { request: result });
});

/**
 * POST /api/v1/off-days/:id/respond
 * Target employee responds (accept/reject)
 */
exports.respondToRequest = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { action } = req.body; // 'ACCEPT' or 'REJECT'

  if (!action || !['ACCEPT', 'REJECT'].includes(action)) {
    return res.status(400).json({ success: false, message: 'Action harus ACCEPT atau REJECT.' });
  }

  const result = await offDayService.respondToRequest(id, req.user.id, action);
  return successResponse(res, 200, { request: result }, result.message);
});

/**
 * POST /api/v1/off-days/:id/approve
 * Admin approves or rejects
 */
exports.approveByAdmin = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { action } = req.body; // 'APPROVE' or 'REJECT'

  if (!action || !['APPROVE', 'REJECT'].includes(action)) {
    return res.status(400).json({ success: false, message: 'Action harus APPROVE atau REJECT.' });
  }

  const result = await offDayService.approveByAdmin(id, req.user.id, action);
  return successResponse(res, 200, { request: result }, result.message);
});

/**
 * POST /api/v1/off-days/:id/cancel
 * Requester cancels their request
 */
exports.cancelRequest = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const result = await offDayService.cancelRequest(id, req.user.id);
  return successResponse(res, 200, { request: result }, result.message);
});

/**
 * GET /api/v1/off-days/my
 * Get current user's requests
 */
exports.getMyRequests = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const requests = await offDayService.getUserRequests(req.user.id, { status });
  return successResponse(res, 200, { requests });
});

/**
 * GET /api/v1/off-days
 * Admin: get all requests
 */
exports.getAllRequests = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const requests = await offDayService.getAllRequests({ status });
  return successResponse(res, 200, { requests });
});

/**
 * GET /api/v1/off-days/inbox
 * Get requests needing target response
 */
exports.getInbox = asyncHandler(async (req, res) => {
  const requests = await offDayService.getPendingTargetResponse(req.user.id);
  return successResponse(res, 200, { requests });
});

/**
 * GET /api/v1/off-days/pending-admin-approval
 * Admin: get requests needing approval
 */
exports.getPendingAdminApproval = asyncHandler(async (req, res) => {
  const requests = await offDayService.getPendingAdminApproval();
  return successResponse(res, 200, { requests });
});