// Vercel Serverless Entry Point
// Routes all /api/* requests to the Express backend app

// Force NODE_ENV to production in Vercel
process.env.NODE_ENV = 'production';

// Ensure DATABASE_URL is set for Prisma before importing app
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Please set it in Vercel dashboard.');
}

const app = require('../backend/src/app');

// Run any missing DDL migrations at cold start using the Prisma client directly.
// This is necessary because Vercel serverless functions cannot execute shell
// commands (no npx, no writable home directory) so prisma migrate deploy cannot
// run in this environment. Using IF NOT EXISTS makes every statement idempotent.
const prisma = require('../backend/src/utils/database');
(async () => {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`manual_off_days\` (
        \`id\` INTEGER NOT NULL AUTO_INCREMENT,
        \`user_id\` INTEGER NOT NULL,
        \`date\` DATE NOT NULL,
        \`week_start\` DATE NOT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        UNIQUE INDEX \`manual_off_days_user_id_date_key\`(\`user_id\`, \`date\`),
        INDEX \`manual_off_days_week_start_idx\`(\`week_start\`),
        PRIMARY KEY (\`id\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`backup_assignments\` (
        \`id\` INTEGER NOT NULL AUTO_INCREMENT,
        \`date\` DATE NOT NULL,
        \`absent_user_id\` INTEGER NOT NULL,
        \`backup_user_id\` INTEGER NOT NULL,
        \`absent_position_id\` INTEGER NOT NULL,
        \`backup_user_original_department\` VARCHAR(191) NOT NULL DEFAULT 'BAR',
        \`notes\` VARCHAR(500) NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        INDEX \`backup_assignments_date_idx\`(\`date\`),
        INDEX \`backup_assignments_absent_user_id_idx\`(\`absent_user_id\`),
        INDEX \`backup_assignments_backup_user_id_idx\`(\`backup_user_id\`),
        UNIQUE INDEX \`backup_assignments_date_absent_user_id_key\`(\`date\`, \`absent_user_id\`),
        PRIMARY KEY (\`id\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log('DDL migrations applied (or already up to date).');
  } catch (err) {
    console.error('DDL migration failed:', err.message);
  }
})();

module.exports = app;

