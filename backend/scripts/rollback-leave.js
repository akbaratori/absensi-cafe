#!/usr/bin/env node
/**
 * rollback-leave.js — HAPUS SATU BARIS `leave` berdasarkan ID (untuk membatalkan backfill salah).
 *
 * DRY-RUN default. Jalankan dengan --apply untuk benar-benar menghapus.
 *
 * Contoh (dari folder backend):
 *   node scripts/rollback-leave.js 2            # lihat dulu
 *   node scripts/rollback-leave.js 2 --apply    # hapus
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const prisma = require('../src/utils/database');

const APPLY = process.argv.includes('--apply');
const id = parseInt(process.argv.find((a) => /^\d+$/.test(a)) || '', 10);

(async () => {
  if (!id) {
    console.log('Pakai: node scripts/rollback-leave.js <ID> [--apply]');
    process.exitCode = 1;
    return;
  }

  const leave = await prisma.leave.findUnique({ where: { id }, include: { user: { select: { fullName: true } } } });
  if (!leave) {
    console.log(`Leave #${id} tidak ditemukan.`);
    return;
  }

  console.log('=== ROLLBACK LEAVE ===');
  console.log(APPLY ? 'MODE: APPLY\n' : 'MODE: DRY-RUN\n');
  console.log(`  #${leave.id} | ${leave.user.fullName} | ${leave.type} | ${leave.status}`);
  console.log(`  ${leave.startDate.toISOString()} .. ${leave.endDate.toISOString()}`);
  console.log(`  reason: ${leave.reason}`);

  if (!APPLY) {
    console.log('\nDRY-RUN selesai. Tambahkan --apply untuk menghapus.');
    return;
  }

  await prisma.leave.delete({ where: { id } });
  console.log(`\n[OK] Leave #${id} dihapus.`);
})().catch((e) => { console.error('Error:', e.message); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
