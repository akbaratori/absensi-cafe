/**
 * Custom application error class
 */
class AppError extends Error {
  constructor(message, statusCode, code) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Predefined error instances
 */
class ErrorCodes {
  static AUTH_ERRORS = {
    INVALID_CREDENTIALS: new AppError('Username or password is incorrect', 401, 'INVALID_CREDENTIALS'),
    INVALID_TOKEN: new AppError('Authentication token is invalid or expired', 401, 'INVALID_TOKEN'),
    MISSING_TOKEN: new AppError('Authentication token is required', 401, 'MISSING_TOKEN'),
    TOKEN_EXPIRED: new AppError('Authentication token has expired', 401, 'TOKEN_EXPIRED'),
    ACCOUNT_INACTIVE: new AppError('Your account has been deactivated. Please contact admin.', 403, 'ACCOUNT_INACTIVE'),
    FORBIDDEN: new AppError("You don't have permission to access this resource", 403, 'FORBIDDEN'),
  };

  static VALIDATION_ERRORS = {
    VALIDATION_ERROR: new AppError('Request validation failed', 400, 'VALIDATION_ERROR'),
  };

  static ATTENDANCE_ERRORS = {
    ALREADY_CLOCKED_IN: new AppError('You have already clocked in today', 409, 'ALREADY_CLOCKED_IN'),
    NOT_CLOCKED_IN: new AppError("You haven't clocked in today", 400, 'NOT_CLOCKED_IN'),
    ALREADY_CLOCKED_OUT: new AppError('You have already clocked out today', 409, 'ALREADY_CLOCKED_OUT'),
    ATTENDANCE_NOT_FOUND: new AppError('Attendance record not found', 404, 'ATTENDANCE_NOT_FOUND'),
    INVALID_LOCATION: new AppError('Invalid location', 400, 'INVALID_LOCATION'),
    OFF_DAY_WORK: new AppError('Hari ini adalah hari libur Anda. Gunakan fitur Tukar Libur jika ingin bekerja.', 400, 'OFF_DAY_WORK'),
  };

  static USER_ERRORS = {
    USER_NOT_FOUND: new AppError('User not found', 404, 'USER_NOT_FOUND'),
    DUPLICATE_USERNAME: new AppError('A user with this username already exists', 409, 'DUPLICATE_USERNAME'),
    DUPLICATE_EMAIL: new AppError('A user with this email already exists', 409, 'DUPLICATE_EMAIL'),
    DUPLICATE_EMPLOYEE_ID: new AppError('A user with this Employee ID already exists', 409, 'DUPLICATE_EMPLOYEE_ID'),
  };

  static SHIFT_ERRORS = {
    SHIFT_NOT_FOUND: new AppError('Shift not found', 404, 'SHIFT_NOT_FOUND'),
    SHIFT_NAME_REQUIRED: new AppError('Shift name is required', 400, 'SHIFT_NAME_REQUIRED'),
    SHIFT_TIME_REQUIRED: new AppError('Shift start and end times are required', 400, 'SHIFT_TIME_REQUIRED'),
  };

  static SCHEDULE_ERRORS = {
    SCHEDULE_NOT_FOUND: new AppError('Schedule not found', 404, 'SCHEDULE_NOT_FOUND'),
    INVALID_DATE_RANGE: new AppError('Invalid date range', 400, 'INVALID_DATE_RANGE'),
    MISSING_REQUIRED_FIELDS: new AppError('Missing required fields', 400, 'MISSING_REQUIRED_FIELDS'),
  };

  static SERVER_ERRORS = {
    INTERNAL_ERROR: new AppError('An unexpected error occurred. Please try again later.', 500, 'INTERNAL_ERROR'),
    DATABASE_ERROR: new AppError('Database error occurred', 500, 'DATABASE_ERROR'),
  };
}

module.exports = { AppError, ErrorCodes };
