const offDayService = require("../services/offDayService");
const { successResponse } = require("../utils/response");
const { asyncHandler } = require("../utils/response");

exports.createRequest = asyncHandler(async (req, res) => {
  const { offDate, workDate, reason } = req.body;
  const userId = req.user.id;

  if (!offDate || !workDate) {
    throw new Error("Tanggal libur dan tanggal pengganti wajib diisi");
  }

  const request = await offDayService.createRequest(userId, offDate, workDate, reason);

  return successResponse(res, 201, { request });
});

exports.getRequests = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const userId = req.user.id;
  const role = req.user.role;

  const requests = await offDayService.getRequests(userId, role, status);

  return successResponse(res, 200, { requests });
});

exports.approveRequest = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const adminId = req.user.id; // Admin performing approval

  const request = await offDayService.approveRequest(id, adminId);

  return successResponse(res, 200, { request }, "Permintaan tukar libur disetujui");
});

exports.rejectRequest = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const adminId = req.user.id;

  const request = await offDayService.rejectRequest(id, adminId);

  return successResponse(res, 200, { request }, "Permintaan tukar libur ditolak");
});
