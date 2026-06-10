// Vercel Serverless Entry Point
// Routes all /api/* requests to the Express backend app

// Ensure POSTGRES_PRISMA_URL is available as DATABASE_URL for any code that needs it
if (process.env.POSTGRES_PRISMA_URL && !process.env.DATABASE_URL) {
  process.env.DATABASE_URL = process.env.POSTGRES_PRISMA_URL;
}

const app = require('../backend/src/app');

module.exports = app;
