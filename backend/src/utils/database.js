const { PrismaClient } = require('@prisma/client');

// Create a singleton instance with optimized connection pooling
let prisma;

const prismaClientOptions = {
  // Connection pool configuration
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
  // Enable query logging in development only
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
};

if (process.env.NODE_ENV === 'production') {
  // Production: Use connection pooling for better performance
  prisma = new PrismaClient({
    ...prismaClientOptions,
    // Add connection timeout for production
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
