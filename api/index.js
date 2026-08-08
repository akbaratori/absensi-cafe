// Vercel Serverless Entry Point
// Routes all /api/* requests to the Express backend app

// Force NODE_ENV to production in Vercel
process.env.NODE_ENV = 'production';

const app = require('../backend/src/app');

module.exports = app;
