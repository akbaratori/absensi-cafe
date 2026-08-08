const { PrismaClient } = require('@prisma/client');
const config = require('../config');

// Create a singleton instance with optimized connection pooling
let prisma;

const prismaClientOptions = {
  // Connection pool configuration (for MySQL; ignored for SQLite)
  datasources: {
    db: {
      url: config.databaseUrl,
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
