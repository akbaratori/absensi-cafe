// Vercel Serverless Entry Point
// Routes all /api/* requests to the Express backend app

// Force NODE_ENV to production in Vercel
process.env.NODE_ENV = 'production';

// Ensure DATABASE_URL is set for Prisma before importing app
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Please set it in Vercel dashboard.');
}

const app = require('../backend/src/app');
const prisma = require('../backend/src/utils/database');

// ---------------------------------------------------------------------------
// Cold-start DDL guard
//
// Vercel serverless functions cannot run shell commands (no npx, no writable
// home directory), so `prisma migrate deploy` is not usable at runtime.
// Instead we run idempotent CREATE TABLE IF NOT EXISTS statements directly
// via the Prisma client before the first request is handled.
//
// `ddlReady` is a Promise that resolves once both tables exist.  The
// middleware below holds every incoming request until that Promise settles,
// then calls next() so Express can serve the request normally.
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

    console.log('[DDL] Tables ensured (manual_off_days, backup_assignments).');
  } catch (err) {
    // Log but do not crash — if the tables already exist the error is benign;
    // if they genuinely don't exist the downstream query will fail with a
    // clear message rather than a silent startup crash.
    console.error('[DDL] Migration error (non-fatal):', err.message);
  }
})();

// Middleware: wait for DDL to finish before handling any request.
// On warm invocations ddlReady is already resolved, so await is instant.
app.use((req, res, next) => {
  ddlReady.then(() => next()).catch(() => next());
});

module.exports = app;

