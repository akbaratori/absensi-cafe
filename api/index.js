// Vercel Serverless Entry Point
// Routes all /api/* requests to the Express backend app

// Force NODE_ENV to production in Vercel
process.env.NODE_ENV = 'production';

// Ensure DATABASE_URL is set for Prisma before importing app
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Please set it in Vercel dashboard.');
}

// DDL guard is handled inside app.js (before any routes are registered).
const app = require('../backend/src/app');

module.exports = app;

