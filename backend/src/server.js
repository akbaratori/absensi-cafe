const app = require('./app');
const config = require('./config');
const prisma = require('./utils/database');
const { initScheduler } = require('./utils/scheduler');
<<<<<<< HEAD
require('fs').writeFileSync('server_started.txt', `Started at ${new Date().toISOString()}`);


=======
>>>>>>> 09b38336db8f0696b9cfc032bf4b7a5f2c46b395

// Start server
const server = app.listen(config.port, async () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║         ATTENDANCE SYSTEM API                              ║
║                                                            ║
║         Environment: ${config.nodeEnv.padEnd(40)}║
║         Port: ${config.port.toString().padEnd(43)}║
║         API: http://localhost:${config.port}${' '.repeat(24)}║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
  `);

  // Test database connection
  try {
    await prisma.$connect();
    console.log('✓ Database connected successfully');
    // Initialize push notification cron scheduler
    initScheduler();
  } catch (error) {
    console.error('✗ Database connection failed:', error.message);
    process.exit(1);
  }
});

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  console.log(`\n${signal} received. Starting graceful shutdown...`);

  // Stop accepting new connections
  server.close(async () => {
    console.log('✓ HTTP server closed');

    try {
      // Disconnect from database
      await prisma.$disconnect();
      console.log('✓ Database disconnected');

      console.log('✓ Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      console.error('✗ Error during shutdown:', error);
      process.exit(1);
    }
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    console.error('✗ Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

<<<<<<< HEAD
// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
=======
// Handle shutdown signals (only register once — database.js already handles SIGINT/SIGTERM for prisma disconnect)
process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.once('SIGINT', () => gracefulShutdown('SIGINT'));
>>>>>>> 09b38336db8f0696b9cfc032bf4b7a5f2c46b395

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('UNHANDLED_REJECTION');
});

module.exports = server;
