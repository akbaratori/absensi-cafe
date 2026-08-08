const path = require('path');
const dotenv = require('dotenv');

const envPath = path.join(__dirname, '../../.env');

// Only load .env file in development; production hosts provide env vars directly.
if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: envPath });
}

let databaseUrl = process.env.DATABASE_URL;

  // Resolve relative SQLite paths (file:./...) to absolute paths relative to the
  // backend folder so the database is found regardless of the process cwd.
  if (databaseUrl && databaseUrl.startsWith('file:./')) {
    const relativePath = databaseUrl.slice('file:./'.length);
    const absolutePath = path.resolve(path.dirname(envPath), relativePath);
    databaseUrl = 'file:' + absolutePath.replace(/\\/g, '/');
  }

module.exports = {
  // Server
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  // Database
  databaseUrl,

  // JWT
  jwt: {
    secret: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
    accessTokenExpiry: parseInt(process.env.JWT_ACCESS_EXPIRY || '900', 10), // 15 minutes
    refreshTokenExpiry: parseInt(process.env.JWT_REFRESH_EXPIRY || '604800', 10), // 7 days
  },

  // Bcrypt
  bcrypt: {
    saltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10),
  },

  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '60000', 10), // 1 minute
    max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
  },

  // CORS
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  },

  // Attendance Config Defaults
  attendance: {
    workStartTime: process.env.WORK_START_TIME || '08:00',
    workEndTime: process.env.WORK_END_TIME || '17:00',
    lateGraceMinutes: parseInt(process.env.LATE_GRACE_MINUTES || '15', 10),
    autoClockoutHours: parseInt(process.env.AUTO_CLOCKOUT_HOURS || '10', 10),
    cafeLatitude: parseFloat(process.env.CAFE_LATITUDE || '-6.2088'), // Default: Jakarta
    cafeLongitude: parseFloat(process.env.CAFE_LONGITUDE || '106.8456'), // Default: Jakarta
    radiusMeters: parseInt(process.env.CAFE_RADIUS || '100', 10),
  },
};
