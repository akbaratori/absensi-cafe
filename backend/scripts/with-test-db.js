#!/usr/bin/env node
/**
 * Jalankan perintah dengan environment DATABASE dari backend/.env.test
 * (DB staging/dev), BUKAN dari backend/.env (produksi).
 *
 * Latar belakang: backend/.env repo ini menunjuk DB produksi, sehingga script
 * sekali-pakai (generateWeek, backfill, uji manual) tanpa sengaja menulis ke
 * data produksi. Wrapper ini menggagalkan perintah sebelum dijalankan bila
 * .env.test belum diisi atau justru menunjuk database yang sama dengan .env.
 *
 * Pemakaian:
 *   node scripts/with-test-db.js node tmp_script.cjs
 *   node scripts/with-test-db.js node node_modules/jest/bin/jest.js --coverage
 *   npm run test:staging
 *
 * Script anak yang memanggil require('dotenv').config({ path: '.env' }) tetap
 * aman: dotenv TIDAK menimpa variabel yang sudah ada di process.env, dan
 * DATABASE_URL sudah diisi wrapper ini dari .env.test.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const backendDir = path.join(__dirname, '..');
const testEnvPath = path.join(backendDir, '.env.test');
const prodEnvPath = path.join(backendDir, '.env');

const mask = (u) => String(u).replace(/:\/\/([^:]+):[^@]+@/, '://$1:***@');
const dbKey = (u) => {
  try {
    const x = new URL(u);
    return `${x.host}${x.pathname.replace(/\/+$/, '')}`;
  } catch {
    return String(u).trim();
  }
};

function fail(message) {
  console.error(`\n[with-test-db] ${message}\n`);
  process.exit(1);
}

if (!fs.existsSync(testEnvPath)) {
  fail(
    'backend/.env.test tidak ditemukan.\n' +
    '  Salin dari backend/.env.test.example, lalu isi DATABASE_URL ke DB staging/dev.',
  );
}

const testEnv = dotenv.parse(fs.readFileSync(testEnvPath));
const testUrl = testEnv.DATABASE_URL;

if (!testUrl) fail('DATABASE_URL tidak ada di backend/.env.test.');
if (/CHANGE_ME/i.test(testUrl)) {
  fail('DATABASE_URL di backend/.env.test masih placeholder (CHANGE_ME). Isi dulu dengan DB staging/dev.');
}

const prodUrl = fs.existsSync(prodEnvPath) ? dotenv.parse(fs.readFileSync(prodEnvPath)).DATABASE_URL : null;
if (prodUrl && dbKey(prodUrl) === dbKey(testUrl)) {
  fail(
    'DITOLAK: DATABASE_URL di .env.test menunjuk database yang SAMA dengan backend/.env (produksi).\n' +
    `  URL: ${mask(testUrl)}\n` +
    '  Perintah TIDAK dijalankan supaya data produksi tidak tersentuh.',
  );
}

const [command, ...args] = process.argv.slice(2);
if (!command) {
  fail('Pemakaian: node scripts/with-test-db.js <perintah> [argumen...]');
}

console.log(`[with-test-db] memakai DATABASE dari .env.test -> ${mask(testUrl)}`);

const child = spawn(command, args, {
  cwd: process.cwd(),
  stdio: 'inherit',
  env: { ...process.env, ...testEnv, NODE_ENV: 'test', DOTENV_CONFIG_PATH: testEnvPath },
});

child.on('exit', (code, signal) => process.exit(signal ? 1 : code ?? 0));
child.on('error', (err) => fail(`gagal menjalankan "${command}": ${err.message}`));
