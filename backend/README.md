# Attendance System Backend

Production-grade Node.js/Express backend for employee attendance tracking with JWT authentication.

## Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: JWT (access + refresh tokens)
- **Password Hashing**: bcrypt
- **Validation**: Joi

## Project Structure

```
backend/
├── prisma/
│   └── schema.prisma          # Database schema
├── src/
│   ├── config/                # Configuration files
│   │   └── index.js
│   ├── controllers/           # Request handlers
│   │   ├── authController.js
│   │   ├── attendanceController.js
│   │   └── adminController.js
│   ├── middleware/            # Express middleware
│   │   ├── auth.js            # JWT authentication & authorization
│   │   └── errorHandler.js    # Global error handling
│   ├── repositories/          # Data access layer
│   │   ├── userRepository.js
│   │   ├── attendanceRepository.js
│   │   └── configRepository.js
│   ├── routes/                # API routes
│   │   ├── index.js
│   │   ├── auth.js
│   │   ├── attendance.js
│   │   └── admin.js
│   ├── services/              # Business logic layer
│   │   ├── authService.js
│   │   ├── attendanceService.js
│   │   └── adminService.js
│   ├── utils/                 # Utility functions
│   │   ├── database.js        # Prisma client singleton
│   │   ├── jwt.js             # JWT utilities
│   │   ├── validator.js       # Joi validation schemas
│   │   ├── response.js        # Response helpers
│   │   ├── AppError.js        # Custom error classes
│   │   └── attendanceHelpers.js
│   ├── app.js                 # Express app setup
│   └── server.js              # Server entry point
├── .env.example               # Environment variables template
└── package.json
```

## Setup Instructions

### 1. Prerequisites

- Node.js 18+ and npm 9+
- PostgreSQL 14+

### 2. Install Dependencies

```bash
cd backend
npm install
```

### 3. Environment Configuration

Copy `.env.example` to `.env` and update values:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:
- Set `DATABASE_URL` to your PostgreSQL connection string
- Set `JWT_SECRET` to a strong random string (min 32 characters)
- Adjust other values as needed

> **Penting — jangan uji ke database produksi.**
> `backend/.env` di repo ini menunjuk DB produksi. Semua script sekali-pakai
> (`generateWeek`, backfill, dsb.) akan menulis ke DB tersebut.
> Gunakan `.env.test` (sudah disediakan, isi `DATABASE_URL` ke DB
> staging/dev) dan jalankan script dengan:
> `DOTENV_CONFIG_PATH=.env.test node script.cjs`
> Lihat komentar di `backend/.env.test` untuk guard anti-salah-tembak.

### 4. Database Setup

Generate Prisma client:
```bash
npx prisma generate
```

Run migrations:
```bash
npx prisma migrate dev --name init
```

### 5. Start Development Server

```bash
npm run dev
```

Server will start on `http://localhost:3001`

### 6. Create Admin User

Use the API to create the first admin user:

```bash
POST http://localhost:3001/api/v1/auth/register
{
  "username": "admin",
  "password": "Admin123!",
  "fullName": "System Admin",
  "role": "ADMIN"
}
```

Or use Prisma Studio:
```bash
npx prisma studio
```

### 7. Konfigurasi Database Test (WAJIB sebelum `npm test`)

Repositori ini punya satu `.env` yang menunjuk **database produksi**, sehingga
menjalankan test/script langsung bisa menulis ke data produksi. Karena itu
test dijalankan dengan `backend/.env.test` yang menunjuk DB staging/dev.

Siapkan sekali saja:

```bash
cp .env.test.example .env.test   # PowerShell: Copy-Item .env.test.example .env.test
```

Lalu isi `DATABASE_URL` di `.env.test` ke database **staging/dev**, bukan
produksi — mis. `mysql://USER:PASSWORD@HOST:PORT/absensi_cafe_staging`.

Menjalankan test:

```bash
npm run test:staging
```

`npm run test:staging` memuat `.env.test`, lalu menolak jalan (exit 1, tanpa
perintah apa pun dijalankan) bila:

- `backend/.env.test` belum ada
- `DATABASE_URL`-nya masih placeholder (`CHANGE_ME`)
- `DATABASE_URL`-nya menunjuk host + nama database yang sama dengan `backend/.env`

Guard yang sama juga ada di `tests/setup.js`, jadi `npm test` biasa pun akan
gagal-cepat daripada menyentuh database produksi.

Script sekali-pakai (generateWeek, backfill, dsb.) harus dijalankan lewat
wrapper yang sama:

```bash
node scripts/with-test-db.js node tmp_script.cjs
```

## API Documentation

### Base URL
```
http://localhost:3001/api/v1
```

### Authentication Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/login` | User login |
| POST | `/auth/refresh` | Refresh access token |
| POST | `/auth/logout` | Logout |
| GET | `/auth/me` | Get current user |

### Attendance Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/attendance/clock-in` | Clock in |
| POST | `/attendance/clock-out` | Clock out |
| GET | `/attendance/today` | Get today's attendance |
| GET | `/attendance/history` | Get attendance history |
| GET | `/attendance/:id` | Get specific record |

### Admin Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/admin/users` | List users |
| POST | `/admin/users` | Create user |
| PUT | `/admin/users/:id` | Update user |
| DELETE | `/admin/users/:id` | Deactivate user |
| GET | `/admin/attendance` | Get all attendance |
| PUT | `/admin/attendance/:id` | Update attendance |
| GET | `/admin/reports/daily` | Daily report |
| GET | `/admin/reports/monthly` | Monthly report |
| GET | `/admin/reports/export` | Export CSV |
| GET | `/admin/config` | Get config |
| PUT | `/admin/config` | Update config |

## Key Features

### Security
- JWT-based authentication with access + refresh tokens
- Password hashing with bcrypt (10 rounds)
- Rate limiting on all endpoints
- CORS protection
- Helmet security headers
- Input validation with Joi
- SQL injection prevention (Prisma)

### Architecture
- **Clean Architecture**: Separation of concerns with layers
- **Repository Pattern**: Data access abstraction
- **Service Layer**: Business logic isolation
- **Middleware**: Reusable auth & error handling
- **Singleton Prisma Client**: Efficient connection pooling

### Error Handling
- Custom error classes (AppError)
- Global error handler middleware
- Consistent error response format
- Proper HTTP status codes
- Database error handling (Prisma errors)

### Data Integrity
- Unique constraints (one attendance per user per day)
- Check constraints (clock-out after clock-in)
- Foreign key cascading rules
- Transaction support for critical operations

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment (development/production) | development |
| `PORT` | Server port | 3001 |
| `DATABASE_URL` | PostgreSQL connection string | - |
| `JWT_SECRET` | JWT signing secret | - |
| `JWT_ACCESS_EXPIRY` | Access token expiry (seconds) | 900 |
| `JWT_REFRESH_EXPIRY` | Refresh token expiry (seconds) | 604800 |
| `BCRYPT_SALT_ROUNDS` | Bcrypt cost factor | 10 |
| `RATE_LIMIT_WINDOW` | Rate limit window (ms) | 60000 |
| `RATE_LIMIT_MAX` | Max requests per window | 100 |
| `CORS_ORIGIN` | Allowed CORS origin | http://localhost:3000 |
| `WORK_START_TIME` | Standard work start time | 08:00 |
| `WORK_END_TIME` | Standard work end time | 17:00 |
| `LATE_GRACE_MINUTES` | Grace period for late | 15 |
| `AUTO_CLOCKOUT_HOURS` | Auto clock-out after X hours | 10 |

## Production Deployment

1. Set `NODE_ENV=production`
2. Use strong `JWT_SECRET`
3. Set up proper PostgreSQL database
4. Configure reverse proxy (nginx/Apache)
5. Enable HTTPS
6. Set up process manager (PM2/systemd)
7. Configure logging
8. Set up database backups
9. Monitor server health

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start production server |
| `npm run dev` | Start development server with nodemon |
| `npm run migrate` | Run Prisma migrations |
| `npm run migrate:deploy` | Deploy migrations (production) |
| `npm run prisma:generate` | Generate Prisma client |
| `npm test` | Run tests |
| `npm run test:staging` | Run tests against the staging/dev DB (`.env.test`), with production guard |
| `npm run lint` | Run ESLint |

## Database Schema

See `prisma/schema.prisma` for complete schema.

Main tables:
- `users` - User accounts
- `attendance` - Attendance records
- `system_config` - Configuration key-value store
- `audit_logs` - Audit trail (optional)

## License

MIT
