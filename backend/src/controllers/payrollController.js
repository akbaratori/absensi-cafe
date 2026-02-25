const payrollService = require('../services/payrollService');
const { successResponse, asyncHandler } = require('../utils/response');

class PayrollController {
    /**
     * Get payroll report
     * GET /api/v1/payroll
     */
    getPayrollReport = asyncHandler(async (req, res) => {
        const { startDate, endDate, userId } = req.query;

        if (!startDate || !endDate) {
            const error = new Error('Start date and end date are required');
            error.statusCode = 400;
            throw error;
        }

        let result;
        if (userId) {
            result = [await payrollService.calculatePayroll(parseInt(userId), startDate, endDate)];
        } else {
            result = await payrollService.calculateAllPayroll(startDate, endDate);
        }

        return successResponse(res, 200, result);
    });
}

module.exports = new PayrollController();
