const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const config = require('./config');
const routes = require('./routes');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { apiLimiter, adminLimiter } = require('./middleware/rateLimiter');
const swaggerDocs = require('./utils/swagger');
const prisma = require('./utils/database');

// Create Express app
const app = express();

// ---------------------------------------------------------------------------
// Cold-start DDL guard
//
// Vercel serverless functions cannot run shell commands (no npx, no writable
// home directory), so `prisma migrate deploy` is not usable at runtime.
// Instead we run idempotent CREATE TABLE IF NOT EXISTS statements here,
// BEFORE any routes are registered, so the middleware executes first.
//
// `ddlReady` is a module-level Promise — on warm invocations it is already
// resolved, so the await in the middleware below is instant (no added latency).
// ---------------------------------------------------------------------------
const ddlReady = (async () => {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`manual_off_days\` (
        \`id\`         INTEGER      NOT NULL AUTO_INCREMENT,
        \`user_id\`    INTEGER      NOT NULL,
        \`date\`       DATE         NOT NULL,
        \`week_start\` DATE         NOT NULL,
        \`created_at\` DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        UNIQUE INDEX \`manual_off_days_user_id_date_key\`(\`user_id\`, \`date\`),
        INDEX        \`manual_off_days_week_start_idx\`(\`week_start\`),
        PRIMARY KEY  (\`id\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`backup_assignments\` (
        \`id\`                              INTEGER      NOT NULL AUTO_INCREMENT,
        \`date\`                            DATE         NOT NULL,
        \`absent_user_id\`                  INTEGER      NOT NULL,
        \`backup_user_id\`                  INTEGER      NOT NULL,
        \`absent_position_id\`              INTEGER      NOT NULL,
        \`backup_user_original_department\` VARCHAR(191) NOT NULL DEFAULT 'BAR',
        \`notes\`                           VARCHAR(500) NULL,
        \`created_at\`                      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        INDEX        \`backup_assignments_date_idx\`(\`date\`),
        INDEX        \`backup_assignments_absent_user_id_idx\`(\`absent_user_id\`),
        INDEX        \`backup_assignments_backup_user_id_idx\`(\`backup_user_id\`),
        UNIQUE INDEX \`backup_assignments_date_absent_user_id_key\`(\`date\`, \`absent_user_id\`),
        PRIMARY KEY  (\`id\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);

    // Tambahkan kolom schedule_all_working (saklar "jadwalkan semua yang tidak
    // libur" untuk posisi Kitchen) jika belum ada. MySQL tidak mendukung
    // ADD COLUMN IF NOT EXISTS secara portabel, jadi cek dulu via information_schema.
    const colCheck = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*) AS cnt
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'positions'
        AND COLUMN_NAME = 'schedule_all_working'
    `);
    const colExists = Number(colCheck?.[0]?.cnt ?? 0) > 0;
    if (!colExists) {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE \`positions\`
          ADD COLUMN \`schedule_all_working\` BOOLEAN NOT NULL DEFAULT false
      `);
      console.log('[DDL] Column added: positions.schedule_all_working');
    }

    console.log('[DDL] Tables ensured: manual_off_days, backup_assignments');
  } catch (err) {
    // Non-fatal: log the error but let the app start.
    // If tables truly don't exist the first query will fail with a clear message.
    console.error('[DDL] Migration error (non-fatal):', err.message);
  }
})();

// Block every incoming request until DDL has finished.
// On warm containers ddlReady is already settled — await returns immediately.
app.use((req, res, next) => {
  ddlReady.then(() => next()).catch(() => next());
});

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

// Initialize Telegram bot
// NOTE: Polling disabled — Hermes profile absensi-bot handles all Telegram messages
// initBot() removed to avoid token conflict with Hermes gateway
// try {
//   const { initBot } = require('./services/telegramService');
//   initBot();
// } catch (err) {
//   console.error('Telegram bot init failed:', err.message);
// }

module.exports = app;
