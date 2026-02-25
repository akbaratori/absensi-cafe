const shiftService = require('../services/shiftService');
const { successResponse, errorResponse } = require('../utils/response');

class ShiftController {
    async getAll(req, res) {
        try {
            const shifts = await shiftService.getAllShifts();
            return successResponse(res, 200, { shifts });
        } catch (error) {
            return errorResponse(res, 500, error.message);
        }
    }

    async create(req, res) {
        try {
            const shift = await shiftService.createShift(req.body);
            return successResponse(res, 201, { shift }, 'Shift created successfully');
        } catch (error) {
            return errorResponse(res, 400, error.message);
        }
    }

    async update(req, res) {
        try {
            const shift = await shiftService.updateShift(req.params.id, req.body);
            return successResponse(res, 200, { shift }, 'Shift updated successfully');
        } catch (error) {
            return errorResponse(res, 400, error.message);
        }
    }

    async delete(req, res) {
        try {
            await shiftService.deleteShift(req.params.id);
            return successResponse(res, 200, null, 'Shift deleted successfully');
        } catch (error) {
            return errorResponse(res, 400, error.message);
        }
    }
}

module.exports = new ShiftController();
