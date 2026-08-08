const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const config = require('./config');
const routes = require('./routes');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { apiLimiter, adminLimiter } = require('./middleware/rateLimiter');
const swaggerDocs = require('./utils/swagger');

// Create Express app
const app = express();

// Trust proxy if behind load balancer
// Trust proxy if behind load balancer
// Trigger restart for MySQL migration
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP — app is internal cafe tool, not public-facing
  crossOriginEmbedderPolicy: false,
}));

// CORS configuration
const allowedOrigins = process.env.CORS_ALLOWED_ORIGINS
  ? process.env.CORS_ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
  : [];

// Add localhost defaults for development if not in production or explicitely requested
if (config.nodeEnv === 'development' || !process.env.CORS_ALLOWED_ORIGINS) {
  allowedOrigins.push(
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3100',
    'http://localhost:3101',
    'https://localhost:3101',
    'http://localhost:5173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
    'http://127.0.0.1:3100',
    'http://127.0.0.1:3101'
  );
}

app.use(cors({
  ...config.cors,
  origin: (origin, callback) => {
    // Allow requests with no origin (same-origin, mobile apps, curl, serverless)
    if (!origin) return callback(null, true);

    // Always allow same-origin (Vercel deploys frontend+backend on same domain)
    if (allowedOrigins.indexOf(origin) !== -1 || config.nodeEnv === 'development') {
      callback(null, true);
    } else {
      // In production with combined deploy, allow all .vercel.app domains
      if (origin.endsWith('.vercel.app') || origin.endsWith('.vercel.sh')) {
        return callback(null, true);
      }
      callback(new Error('Not allowed by CORS'));
    }
  }
}));

// Body parsing middleware
// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files
app.use('/uploads', express.static('uploads'));

// Request logging
if (config.nodeEnv === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Apply rate limiting to all API routes
app.use('/api/', apiLimiter);

// Stricter rate limiting for admin endpoints
app.use('/api/v1/admin', adminLimiter);

// API routes
app.use('/api/v1', routes);

// Root endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Attendance System API',
    version: '1.0.0',
    documentation: '/api-docs',
  });
});

// Swagger Documentation
swaggerDocs(app, config.port);

// 404 handler for unmatched routes
app.use(notFoundHandler);

// Global error handler
app.use(errorHandler);

module.exports = app;
