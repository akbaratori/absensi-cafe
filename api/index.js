// Vercel Serverless Entry Point
// Routes all /api/* requests to the Express backend app

// Force NODE_ENV to production in Vercel
process.env.NODE_ENV = 'production';

// Ensure database URL is correctly set from Neon integration
// Neon integration provides POSTGRES_PRISMA_URL, which Prisma schema reads
// Also set DATABASE_URL for any code that references it
if (process.env.POSTGRES_PRISMA_URL) {
  process.env.DATABASE_URL = process.env.POSTGRES_PRISMA_URL;
}

const app = require('../backend/src/app');

module.exports = app;
