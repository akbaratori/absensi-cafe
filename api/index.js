// Vercel Serverless Entry Point
// Routes all /api/* requests to the Express backend app

// Force NODE_ENV to production in Vercel
process.env.NODE_ENV = 'production';

// Ensure DATABASE_URL is set for Prisma before importing app
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Please set it in Vercel dashboard.');
}

// Run pending migrations on cold start. prisma migrate deploy is idempotent —
// it no-ops if all migrations are already applied — so this is safe every boot.
const { execSync } = require('child_process');
try {
  execSync('npx prisma migrate deploy --schema=./backend/prisma/schema.prisma', {
    stdio: 'inherit',
    cwd: process.cwd(),
  });
} catch (err) {
  // Log but don't crash the function — the app may still work if the DB is
  // already up to date and the error is transient (e.g. network blip).
  console.error('prisma migrate deploy failed:', err.message);
}

const app = require('../backend/src/app');

module.exports = app;
