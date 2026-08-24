const { errorResponse } = require("../utils/response");

/**
 * Global error handling middleware
 */
const errorHandler = (err, req, res, next) => {
  // Always log errors — visible in Vercel function logs regardless of NODE_ENV
  console.error(`[ERROR] ${req.method} ${req.path}`, {
    name: err.name,
    code: err.code,
    message: err.message,
    stack: err.stack,
  });

  if (process.env.NODE_ENV === "development") {
    // DEBUG: Write to file in dev
    const fs = require("fs");
    fs.appendFileSync("server_errors.log", `[${new Date().toISOString()}] ${err.stack}\n\n`);
  }

  // Handle AppError (operational errors)
  if (err.isOperational) {
    return errorResponse(res, err.statusCode, err.code, err.message);
  }

  // Handle Prisma validation errors (e.g. unsupported features like mode:'insensitive' on MySQL)
  if (err.name === "PrismaClientValidationError") {
    return errorResponse(res, 400, "VALIDATION_ERROR", "Invalid query parameters");
  }

  // Handle Prisma known request errors
  if (err.code && typeof err.code === "string" && err.code.startsWith("P")) {
    switch (err.code) {
      case "P2002": { // Unique constraint violation
        const fields = err.meta?.target?.join(", ") || "field";
        return errorResponse(res, 409, "DUPLICATE_ENTRY", `A record with this ${fields} already exists`);
      }
      case "P2025": // Record not found
        return errorResponse(res, 404, "NOT_FOUND", "Record not found");

      case "P2003": // Foreign key constraint
        return errorResponse(res, 400, "INVALID_REFERENCE", "Invalid reference to related record");

      default:
        return errorResponse(res, 500, "DATABASE_ERROR", `Database error: ${err.message}`);
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

  // Generic server error — always include message so Vercel logs are useful
  return errorResponse(res, 500, "INTERNAL_ERROR", err.message || "An unexpected error occurred");
};

/**
 * 404 Not Found handler
 */
const notFoundHandler = (req, res) => {
  errorResponse(res, 404, "NOT_FOUND", `Route ${req.method} ${req.path} not found`);
};

const catchAsync = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = { errorHandler, notFoundHandler, catchAsync };
