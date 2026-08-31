/**
 * One-time setup: buat posisi "Kitchen" dengan mode "jadwalkan semua yang
 * tidak libur" (scheduleAllWorking = true) untuk formasi fleksibel 3-4 orang.
 * Idempotent: aman dijalankan berulang — tidak akan membuat duplikat.
 *
 * Cara pakai (dari folder backend, dengan DATABASE_URL production):
 *   node scripts/setup-kitchen-position.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const POSITION_NAME = 'Kitchen';

async function main() {
  const existing = await prisma.position.findUnique({ where: { name: POSITION_NAME } });

  if (existing) {
    // Pastikan saklar aktif (jaga-jaga posisi sudah dibuat manual tanpa saklar)
    if (!existing.scheduleAllWorking) {
      await prisma.position.update({
        where: { id: existing.id },
        data: { scheduleAllWorking: true },
      });
      console.log(`✅ Posisi "${POSITION_NAME}" sudah ada — saklar scheduleAllWorking diaktifkan.`);
    } else {
      console.log(`ℹ️  Posisi "${POSITION_NAME}" sudah ada & saklar sudah aktif. Tidak ada perubahan.`);
    }
  } else {
    const pos = await prisma.position.create({
      data: {
        name: POSITION_NAME,
        shift1Capacity: 2, // tidak dipakai saat scheduleAllWorking aktif
        shift2Capacity: 2,
        scheduleAllWorking: true,
      },
    });
    await prisma.rotationState.create({
      data: { positionId: pos.id, currentStartIndex: 0 },
    });
    console.log(`✅ Posisi "${POSITION_NAME}" dibuat dengan scheduleAllWorking = true (id=${pos.id}).`);
  }

  console.log('\nLangkah selanjutnya di aplikasi:');
  console.log('1. Rotasi & Libur → Kelola Roster → isi semua staff Kitchen (Main Cook, Support, Checker, Runner, Helper).');
  console.log('2. Dashboard → Generate. Sistem akan menjadwalkan SEMUA yang tidak libur (3-4 orang),');
  console.log('   dibagi Shift 1/Shift 2 secara bergantian tiap minggu.');
}

main()
  .catch((e) => { console.error('❌ Gagal:', e.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
