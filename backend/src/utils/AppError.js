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
 * Predefined error factories — each call creates a fresh AppError instance
 * to avoid reusing the same object across multiple throw/catch cycles.
 */
class ErrorCodes {
  static AUTH_ERRORS = {
    get INVALID_CREDENTIALS() { return new AppError('Username or password is incorrect', 401, 'INVALID_CREDENTIALS'); },
    get INVALID_TOKEN() { return new AppError('Authentication token is invalid or expired', 401, 'INVALID_TOKEN'); },
    get MISSING_TOKEN() { return new AppError('Authentication token is required', 401, 'MISSING_TOKEN'); },
    get TOKEN_EXPIRED() { return new AppError('Authentication token has expired', 401, 'TOKEN_EXPIRED'); },
    get ACCOUNT_INACTIVE() { return new AppError('Your account has been deactivated. Please contact admin.', 403, 'ACCOUNT_INACTIVE'); },
    get FORBIDDEN() { return new AppError("You don't have permission to access this resource", 403, 'FORBIDDEN'); },
  };

  static VALIDATION_ERRORS = {
    get VALIDATION_ERROR() { return new AppError('Request validation failed', 400, 'VALIDATION_ERROR'); },
  };

  static ATTENDANCE_ERRORS = {
    get ALREADY_CLOCKED_IN() { return new AppError('You have already clocked in today', 409, 'ALREADY_CLOCKED_IN'); },
    get NOT_CLOCKED_IN() { return new AppError("You haven't clocked in today", 400, 'NOT_CLOCKED_IN'); },
    get ALREADY_CLOCKED_OUT() { return new AppError('You have already clocked out today', 409, 'ALREADY_CLOCKED_OUT'); },
    get ATTENDANCE_NOT_FOUND() { return new AppError('Attendance record not found', 404, 'ATTENDANCE_NOT_FOUND'); },
    get INVALID_LOCATION() { return new AppError('Invalid location', 400, 'INVALID_LOCATION'); },
    get OFF_DAY_WORK() { return new AppError('Hari ini adalah hari libur Anda. Gunakan fitur Tukar Libur jika ingin bekerja.', 400, 'OFF_DAY_WORK'); },
  };

  static USER_ERRORS = {
    get USER_NOT_FOUND() { return new AppError('User not found', 404, 'USER_NOT_FOUND'); },
    get DUPLICATE_USERNAME() { return new AppError('A user with this username already exists', 409, 'DUPLICATE_USERNAME'); },
    get DUPLICATE_EMAIL() { return new AppError('A user with this email already exists', 409, 'DUPLICATE_EMAIL'); },
    get DUPLICATE_EMPLOYEE_ID() { return new AppError('A user with this Employee ID already exists', 409, 'DUPLICATE_EMPLOYEE_ID'); },
  };

  static SHIFT_ERRORS = {
    get SHIFT_NOT_FOUND() { return new AppError('Shift not found', 404, 'SHIFT_NOT_FOUND'); },
    get SHIFT_NAME_REQUIRED() { return new AppError('Shift name is required', 400, 'SHIFT_NAME_REQUIRED'); },
    get SHIFT_TIME_REQUIRED() { return new AppError('Shift start and end times are required', 400, 'SHIFT_TIME_REQUIRED'); },
    get SHIFT_IN_USE() { return new AppError('Cannot delete shift because it is currently assigned to users or schedules', 400, 'SHIFT_IN_USE'); },
  };

  static SCHEDULE_ERRORS = {
    get SCHEDULE_NOT_FOUND() { return new AppError('Schedule not found', 404, 'SCHEDULE_NOT_FOUND'); },
    get INVALID_DATE_RANGE() { return new AppError('Invalid date range', 400, 'INVALID_DATE_RANGE'); },
    get MISSING_REQUIRED_FIELDS() { return new AppError('Missing required fields', 400, 'MISSING_REQUIRED_FIELDS'); },
  };

  static SERVER_ERRORS = {
    get INTERNAL_ERROR() { return new AppError('An unexpected error occurred. Please try again later.', 500, 'INTERNAL_ERROR'); },
    get DATABASE_ERROR() { return new AppError('Database error occurred', 500, 'DATABASE_ERROR'); },
  };
}

module.exports = { AppError, ErrorCodes };
