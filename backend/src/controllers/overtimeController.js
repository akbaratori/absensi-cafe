const overtimeService = require('../services/overtimeService');
const { successResponse, asyncHandler } = require('../utils/response');

class OvertimeController {
  /**
   * Create overtime request (employee)
   * POST /api/v1/overtime
   */
  createOvertime = asyncHandler(async (req, res) => {
    const result = await overtimeService.createOvertime(req.user.id, req.body);

    return successResponse(res, 201, result, 'Pengajuan lembur berhasil dibuat');
  });

  /**
   * Get my overtime history (employee)
   * GET /api/v1/overtime/my
   */
  getMyOvertime = asyncHandler(async (req, res) => {
    const result = await overtimeService.getMyOvertime(req.user.id, req.query);

    return successResponse(res, 200, result);
  });

  /**
   * Get my overtime summary (employee)
   * GET /api/v1/overtime/my/summary?month=YYYY-MM
   */
  getMySummary = asyncHandler(async (req, res) => {
    const month = req.query.month || new Date().toISOString().slice(0, 7);
    const result = await overtimeService.getMySummary(req.user.id, month);

    return successResponse(res, 200, result);
  });

  /**
   * Admin: List all overtime requests
   * GET /api/v1/admin/overtime
   */
  getAll = asyncHandler(async (req, res) => {
    const result = await overtimeService.getAll(req.query);

    return successResponse(res, 200, result);
  });

  /**
   * Admin: Approve overtime request
   * PATCH /api/v1/admin/overtime/:id/approve
   */
  approve = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { notes } = req.body;

    const result = await overtimeService.approve(parseInt(id), req.user.id, notes);

    return successResponse(res, 200, result, 'Pengajuan lembur disetujui');
  });

  /**
   * Admin: Reject overtime request
   * PATCH /api/v1/admin/overtime/:id/reject
   */
  reject = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { notes } = req.body;

    const result = await overtimeService.reject(parseInt(id), req.user.id, notes);

    return successResponse(res, 200, result, 'Pengajuan lembur ditolak');
  });

  /**
   * Admin: Delete overtime request
   * DELETE /api/v1/admin/overtime/:id
   */
  delete = asyncHandler(async (req, res) => {
    const { id } = req.params;

    await overtimeService.delete(parseInt(id), req.user.id);

    return successResponse(res, 200, null, 'Pengajuan lembur dihapus');
  });
}

module.exports = new OvertimeController();