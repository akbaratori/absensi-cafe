const { errorResponse } = require("../utils/response");

/**
 * Global error handling middleware
 */
const errorHandler = (err, req, res, next) => {
  // Log error for debugging (in production, use proper logging service)
  if (process.env.NODE_ENV === "development") {
    console.error("Error:", err);
    // DEBUG: Write to file
    const fs = require("fs");
    fs.appendFileSync("server_errors.log", `[${new Date().toISOString()}] ${err.stack}\n\n`);
  }

  // Handle AppError (operational errors)
  if (err.isOperational) {
    return errorResponse(res, err.statusCode, err.code, err.message);
  }

  // Handle regular Error objects - check if it's likely a validation/business logic error
  if (err instanceof Error) {
    // If the error message looks like a user-facing validation error (not technical),
    // treat it as a 400 validation error instead of 500
    const technicalErrorPatterns = [/Cannot read property/i, /Cannot read/i, /is not a function/i, /undefined/i, /null/i, /Unexpected/i, /SyntaxError/i, /TypeError/i, /ReferenceError/i];

    const isTechnicalError = technicalErrorPatterns.some((pattern) => pattern.test(err.message) || err.name.match(pattern));

    if (!isTechnicalError) {
      // This looks like a business logic/validation error, return 400 instead of 500
      return errorResponse(res, 400, "VALIDATION_ERROR", err.message);
    }
  }

  // Handle Prisma errors
  if (err.code) {
    switch (err.code) {
      case "P2002": // Unique constraint violation
        const fields = err.meta?.target?.join(", ") || "field";
        return errorResponse(res, 409, "DUPLICATE_ENTRY", `A record with this ${fields} already exists`);

      case "P2025": // Record not found
        return errorResponse(res, 404, "NOT_FOUND", "Record not found");

      case "P2003": // Foreign key constraint
        return errorResponse(res, 400, "INVALID_REFERENCE", "Invalid reference to related record");

      default:
        return errorResponse(res, 500, "DATABASE_ERROR", "Database error occurred");
    }
  }

  // Handle JWT errors
  if (err.name === "JsonWebTokenError") {
    return errorResponse(res, 401, "INVALID_TOKEN", "Invalid token");
  }

  if (err.name === "TokenExpiredError") {
    return errorResponse(res, 401, "TOKEN_EXPIRED", "Token has expired");
  }

  // Handle validation errors
  if (err.name === "ValidationError") {
    return errorResponse(res, 400, "VALIDATION_ERROR", err.message);
  }

  // Generic server error
  return errorResponse(res, 500, "INTERNAL_ERROR", process.env.NODE_ENV === "development" ? err.message : "An unexpected error occurred");
};

/**
 * 404 Not Found handler
 */
const notFoundHandler = (req, res) => {
  errorResponse(res, 404, "NOT_FOUND", `Route ${req.method} ${req.path} not found`);
};

module.exports = { errorHandler, notFoundHandler };
