const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
require('dotenv/config'); // hormati DOTENV_CONFIG_PATH (default: ./.env)
const prisma = require('../src/utils/database');

/**
 * Guard: test TIDAK BOLEH menyentuh database produksi.
 *
 * Latar belakang insiden: backend/.env menunjuk DB produksi, sehingga
 * menjalankan test/script menulis ke data jadwal produksi.
 *
 * Cara pakai:
 *   npm run test:staging
 *   DOTENV_CONFIG_PATH=.env.test npx jest
 *
 * Catatan: `throw` di setupFilesAfterEnv TIDAK menggagalkan suite Jest
 * (Jest melaporkannya sebagai error suite dan tetap "lulus"), jadi guard ini
 * memasang error ke beforeEach() supaya setiap test PASTI gagal, sekaligus
 * memanggil process.exit(1) setelah suite selesai agar exit code bukan 0.
 */
const url = process.env.DATABASE_URL || '';
const envPath = path.join(__dirname, '..', '.env');
const safe = (u) => String(u).replace(/:\/\/([^:]+):[^@]+@/, '://$1:***@');

const sameDatabase = (a, b) => {
  if (!a || !b) return false;
  try {
    const x = new URL(a);
    const y = new URL(b);
    return x.host === y.host && x.pathname.replace(/\/+$/, '') === y.pathname.replace(/\/+$/, '');
  } catch {
    return String(a).trim() === String(b).trim();
  }
};

function dotenvParse(file) {
  return dotenv.parse(fs.readFileSync(file));
}

let guardError = null;

if (!url) {
  guardError = new Error(
    '[env-guard] DATABASE_URL kosong. Jalankan: npm run test:staging\n' +
    '  (isi DATABASE_URL DB staging/dev di backend/.env.test)',
  );
} else if (fs.existsSync(envPath) && sameDatabase(url, dotenvParse(envPath).DATABASE_URL)) {
  guardError = new Error(
    '[env-guard] DITOLAK: test menunjuk database yang SAMA dengan backend/.env (produksi).\n' +
    `  URL        : ${safe(url)}\n` +
    '  Diperlukan : DB staging/dev di backend/.env.test\n' +
    '  Jalankan   : npm run test:staging',
  );
}

if (guardError) {
  console.error(`\n${guardError.message}\n`);
  // Gagalkan setiap test -> hasil suite pasti "failed".
  beforeEach(() => {
    throw guardError;
  });
  // Jest tetap exit 0 saat setUp gagal/error di beberapa versi -> pastikan non-zero.
  afterAll(() => {
    setTimeout(() => process.exit(1), 0);
  });
}

afterAll(async () => {
  await prisma.$disconnect();
});


