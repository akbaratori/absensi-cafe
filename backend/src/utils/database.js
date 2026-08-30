const { PrismaClient } = require('@prisma/client');
const config = require('../config');

// Create a singleton instance with optimized connection pooling
let prisma;

// Append a bounded connection pool to the datasource URL for MySQL.
// Prevents "Too many connections" (MySQL error 1040) by capping the number of
// simultaneous connections Prisma opens per process. `connection_limit` is a
// Prisma-specific query parameter (read by the mysql driver) — it is NOT sent
// to the database server itself.
function withConnectionLimit(url) {
  if (!url || typeof url !== 'string') return url;
  // Only applies to MySQL/MariaDB URLs; leave SQLite/postgres untouched.
  if (!url.startsWith('mysql')) return url;

  const LIMIT = Number(process.env.PRISMA_CONNECTION_LIMIT) || 5;
  const SEP = url.includes('?') ? '&' : '?';

  // Remove any pre-existing connection_limit / pool params to avoid duplicates.
  const clean = url
    .replace(/[?&]connection_limit=\d+/gi, '')
    .replace(/[?&]pool_timeout=\d+/gi, '')
    .replace(/[?&]connection_limit=0/gi, '');
  return `${clean}${SEP}connection_limit=${LIMIT}&pool_timeout=10`;
}

const prismaClientOptions = {
  // Connection pool configuration (for MySQL; ignored for SQLite)
  datasources: {
    db: {
      url: withConnectionLimit(config.databaseUrl),
    },
  },
  // Enable query logging in development only
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
};

if (process.env.NODE_ENV === 'production') {
  // Production: Use connection pooling for better performance (safe for MySQL serverless)
  prisma = new PrismaClient({
    ...prismaClientOptions,
  });
} else {
  // In development, use globalThis to prevent multiple instances
  if (!globalThis.prisma) {
    globalThis.prisma = new PrismaClient(prismaClientOptions);
  }
  prisma = globalThis.prisma;
}

// Graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

// Handle process termination
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

module.exports = prisma;
