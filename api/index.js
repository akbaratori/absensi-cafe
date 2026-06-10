// Vercel Serverless Entry Point
// Routes all /api/* requests to the Express backend app
const app = require('../backend/src/app');

module.exports = app;
