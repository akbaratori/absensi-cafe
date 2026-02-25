const { extractTokenFromHeader, verifyToken } = require('../utils/jwt');
const { ErrorCodes } = require('../utils/AppError');
const { errorResponse } = require('../utils/response');
const prisma = require('../utils/database');

/**
 * Authentication middleware - verifies JWT token
 */
const authenticate = async (req, res, next) => {
  try {
    const token = extractTokenFromHeader(req.headers.authorization);

    if (!token) {
      return errorResponse(res, 401, 'MISSING_TOKEN', 'Authentication token is required');
    }

    // Verify token
    const decoded = verifyToken(token);

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        username: true,
        fullName: true,
        email: true,
        role: true,
        employeeId: true,
        isActive: true,
      },
    });

    if (!user) {
      return errorResponse(res, 401, 'INVALID_TOKEN', 'User not found');
    }

    if (!user.isActive) {
      return errorResponse(res, 403, 'ACCOUNT_INACTIVE', 'Your account has been deactivated');
    }

    // Attach user to request
    req.user = user;
    next();
  } catch (error) {
    if (error.message === 'Token expired') {
      return errorResponse(res, 401, 'TOKEN_EXPIRED', 'Authentication token has expired');
    }
    return errorResponse(res, 401, 'INVALID_TOKEN', 'Invalid authentication token');
  }
};

/**
 * Authorization middleware - checks user role
 * @param {...String} roles - Allowed roles
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return errorResponse(res, 401, 'MISSING_TOKEN', 'Authentication required');
    }

    if (!roles.includes(req.user.role)) {
      return errorResponse(res, 403, 'FORBIDDEN', "You don't have permission to access this resource");
    }

    next();
  };
};

/**
 * Optional authentication - attaches user if token exists, but doesn't require it
 */
const optionalAuth = async (req, res, next) => {
  try {
    const token = extractTokenFromHeader(req.headers.authorization);

    if (token) {
      const decoded = verifyToken(token);
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: {
          id: true,
          username: true,
          fullName: true,
          email: true,
          role: true,
          employeeId: true,
          isActive: true,
        },
      });

      if (user && user.isActive) {
        req.user = user;
      }
    }

    next();
  } catch (error) {
    // Ignore errors, continue without user
    next();
  }
};

module.exports = { authenticate, authorize, optionalAuth };
