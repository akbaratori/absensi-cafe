const shiftRepository = require('../repositories/shiftRepository');
const { ErrorCodes } = require('../utils/AppError');

class ShiftService {
    async getAllShifts() {
        return await shiftRepository.findAll();
    }

    async getShiftById(id) {
        const shift = await shiftRepository.findById(id);
        if (!shift) {
            throw ErrorCodes.SHIFT_ERRORS.SHIFT_NOT_FOUND;
        }
        return shift;
    }

    async createShift(data) {
        // Basic validation
        if (!data.name || !data.startTime || !data.endTime) {
            throw ErrorCodes.SHIFT_ERRORS.SHIFT_TIME_REQUIRED;
        }
        return await shiftRepository.create(data);
    }

    async updateShift(id, data) {
        await this.getShiftById(id); // Ensure exists
        return await shiftRepository.update(id, data);
    }

    async deleteShift(id) {
        await this.getShiftById(id); // Ensure exists
        // TODO: Check if users are assigned to this shift before deleting?
        // For now, let's assume Prisma handles constraint errors if users exist
        return await shiftRepository.delete(id);
    }
}

module.exports = new ShiftService();
