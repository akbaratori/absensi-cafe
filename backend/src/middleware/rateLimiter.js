const rateLimit = require('express-rate-limit');
const { errorResponse } = require('../utils/response');

// Kunci limiter per user yang sudah login (fallback ke IP untuk request anonim).
// Lebih akurat dari req.ip murni — di serverless (Vercel) atau di balik proxy
// (Render), banyak pengguna bisa berbagi IP publik yang sama sehingga limiter
// per-IP rawan false-positive 429.
const keyByUser = (req) => req.user?.id?.toString() || req.ip;

// General API rate limiter — 300 requests per 15 minutes per user
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyByUser,
  handler: (req, res) => {
    return errorResponse(res, 429, 'TOO_MANY_REQUESTS', 'Terlalu banyak permintaan. Coba lagi nanti.');
  },
});

// Strict limiter for authentication endpoints — 10 attempts per 15 minutes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: (req, res) => {
    return errorResponse(res, 429, 'TOO_MANY_REQUESTS', 'Terlalu banyak percobaan login. Coba lagi dalam 15 menit.');
  },
});

// Attendance action limiter — 30 clock-in/out per 15 minutes per user
const attendanceActionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id?.toString() || req.ip,
  handler: (req, res) => {
    return errorResponse(res, 429, 'TOO_MANY_REQUESTS', 'Terlalu banyak aksi absensi. Coba lagi nanti.');
  },
});

// Admin dashboard limiter — higher quota to prevent 429 on dashboards
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2000,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyByUser,
  handler: (req, res) => {
    return errorResponse(res, 429, 'TOO_MANY_REQUESTS', 'Terlalu banyak permintaan admin. Coba lagi nanti.');
  },
});

module.exports = {
  apiLimiter,
  authLimiter,
  attendanceActionLimiter,
  adminLimiter,
};
