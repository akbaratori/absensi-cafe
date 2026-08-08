-- Seed SQL untuk membuat user admin dan employee contoh
-- Password: password123 (bcrypt hash cost 10)
-- Jalankan di database MySQL setelah migrate berhasil.

-- Admin
INSERT INTO users (username, password_hash, full_name, role, email, employee_id, department, is_active, hourly_rate, off_day, created_at, updated_at)
VALUES (
  'admin',
  '$2b$10$knPcDxo8tKCcFAVHoKh96uuhjtWqf2tJaE/R5DsGON.wWpf3CccHu',
  'Administrator',
  'ADMIN',
  'admin@example.com',
  'ADM001',
  'BAR',
  true,
  0,
  0,
  NOW(),
  NOW()
)
ON DUPLICATE KEY UPDATE username = username;

-- Employee contoh
INSERT INTO users (username, password_hash, full_name, role, email, employee_id, department, is_active, hourly_rate, off_day, created_at, updated_at)
VALUES (
  'employee',
  '$2b$10$knPcDxo8tKCcFAVHoKh96uuhjtWqf2tJaE/R5DsGON.wWpf3CccHu',
  'Employee Demo',
  'EMPLOYEE',
  'employee@example.com',
  'EMP001',
  'BAR',
  true,
  10000,
  1,
  NOW(),
  NOW()
)
ON DUPLICATE KEY UPDATE username = username;
