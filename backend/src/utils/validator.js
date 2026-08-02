const Joi = require('joi');

// Auth Validators
const loginSchema = Joi.object({
  username: Joi.string().pattern(/^[a-zA-Z0-9._-]+$/).min(3).max(50).required().messages({
    'string.pattern.base': 'Username can only contain letters, numbers, dots, underscores, and hyphens',
  }),
  password: Joi.string().min(6).required(),
});

const refreshTokenSchema = Joi.object({
  refreshToken: Joi.string().required(),
});

// Attendance Validators
const clockInSchema = Joi.object({
  location: Joi.object({
    latitude: Joi.number().min(-90).max(90),
    longitude: Joi.number().min(-180).max(180),
  }).optional(),
  notes: Joi.string().max(500).optional(),
});

const clockOutSchema = Joi.object({
  location: Joi.object({
    latitude: Joi.number().min(-90).max(90),
    longitude: Joi.number().min(-180).max(180),
  }).optional(),
});

const attendanceHistorySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  startDate: Joi.date().iso(),
  endDate: Joi.date().iso().greater(Joi.ref('startDate')),
  status: Joi.string().valid('PRESENT', 'LATE', 'ABSENT', 'HALF_DAY'),
});

// User Validators
const createUserSchema = Joi.object({
  username: Joi.string().pattern(/^[a-zA-Z0-9._-]+$/).min(3).max(50).required().messages({
    'string.pattern.base': 'Username can only contain letters, numbers, dots, underscores, and hyphens',
  }),
  password: Joi.string().min(6).required(),
  fullName: Joi.string().min(2).max(100).required(),
  email: Joi.string().email().optional().allow('', null),
  role: Joi.string().valid('ADMIN', 'EMPLOYEE').default('EMPLOYEE'),
  // shift: Joi.string().valid('SHIFT_1', 'SHIFT_2').optional().allow(null), // Deprecated
  shiftId: Joi.number().integer().optional().allow(null),
  employeeId: Joi.string().max(20).optional().allow('', null),
  hourlyRate: Joi.number().min(0).default(0),
  department: Joi.string().valid('BAR', 'KITCHEN').default('BAR'),
  offDay: Joi.number().min(0).max(6).default(0),
});

const updateUserSchema = Joi.object({
  username: Joi.string().pattern(/^[a-zA-Z0-9._-]+$/).min(3).max(50).optional().messages({
    'string.pattern.base': 'Username can only contain letters, numbers, dots, underscores, and hyphens',
  }),
  password: Joi.string().min(6).optional(),
  fullName: Joi.string().min(2).max(100).optional(),
  email: Joi.string().email().optional().allow('', null),
  role: Joi.string().valid('ADMIN', 'EMPLOYEE').optional(),
  // shift: Joi.string().valid('SHIFT_1', 'SHIFT_2').optional().allow(null),
  shiftId: Joi.number().integer().optional().allow(null),
  isActive: Joi.boolean().optional(),
  employeeId: Joi.string().max(20).optional().allow('', null),
  hourlyRate: Joi.number().min(0).optional(),
  department: Joi.string().valid('BAR', 'KITCHEN').optional(),
  offDay: Joi.number().min(0).max(6).optional(),
});

// Admin Validators
const adminAttendanceQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(50),
  date: Joi.date().iso(),
  userId: Joi.number().integer().positive(),
  status: Joi.string().valid('PRESENT', 'LATE', 'ABSENT', 'HALF_DAY'),
  startDate: Joi.date().iso(),
  endDate: Joi.date().iso().greater(Joi.ref('startDate')),
});

const updateAttendanceSchema = Joi.object({
  clockIn: Joi.date().iso().optional(),
  clockOut: Joi.date().iso().greater(Joi.ref('clockIn')).optional(),
  status: Joi.string().valid('PRESENT', 'LATE', 'ABSENT', 'HALF_DAY').optional(),
  notes: Joi.string().max(500).optional(),
});

const updateConfigSchema = Joi.object({
  workStartTime: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).optional(),
  workEndTime: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).optional(),
  lateGraceMinutes: Joi.number().integer().min(0).max(60).optional(),
  autoClockoutHours: Joi.number().integer().min(1).max(24).optional(),
  cafeLatitude: Joi.string().optional().allow(''),
  cafeLongitude: Joi.string().optional().allow(''),
  radiusMeters: Joi.number().integer().min(10).max(1000).optional(),
});

const usersQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  role: Joi.string().valid('ADMIN', 'EMPLOYEE').optional().allow('', null),
  status: Joi.string().valid('active', 'inactive').optional().allow('', null),
  search: Joi.string().max(100).optional().allow('', null),
});

const reportQuerySchema = Joi.object({
  date: Joi.date().iso(),
  month: Joi.string().pattern(/^\d{4}-\d{2}$/).optional(),
  userId: Joi.number().integer().positive().optional(),
});

// Validation Middleware Factory
const validate = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const errors = {};
      error.details.forEach((detail) => {
        const key = detail.path.join('.');
        errors[key] = detail.message;
      });

      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: errors,
        },
      });
    }

    req.body = value;
    next();
  };
};

const validateQuery = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.query, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const errors = {};
      error.details.forEach((detail) => {
        const key = detail.path.join('.');
        errors[key] = detail.message;
      });

      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Query validation failed',
          details: errors,
        },
      });
    }

    req.query = value;
    next();
  };
};

module.exports = {
  loginSchema,
  refreshTokenSchema,
  clockInSchema,
  clockOutSchema,
  attendanceHistorySchema,
  createUserSchema,
  updateUserSchema,
  adminAttendanceQuerySchema,
  updateAttendanceSchema,
  updateConfigSchema,
  usersQuerySchema,
  reportQuerySchema,
  validate,
  validateQuery,
};
