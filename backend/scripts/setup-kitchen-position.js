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
const KITCHEN_JOBDESKS = ['Main Cook', 'Support/Snack', 'Checker/Stock', 'Runner/Area', 'Helper/Floating'];

async function main() {
  // Pastikan tabel jobdesk ada (MySQL tidak punya CREATE TABLE IF NOT EXISTS portabel
  // via Prisma, jadi pakai raw SQL yang aman dijalankan berulang).
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`position_jobdesks\` (
      \`id\`          INTEGER      NOT NULL AUTO_INCREMENT,
      \`position_id\` INTEGER      NOT NULL,
      \`name\`        VARCHAR(191) NOT NULL,
      \`order_index\` INTEGER      NOT NULL DEFAULT 0,
      \`created_at\`  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      UNIQUE INDEX \`position_jobdesks_position_id_name_key\`(\`position_id\`, \`name\`),
      INDEX        \`position_jobdesks_position_id_idx\`(\`position_id\`),
      PRIMARY KEY  (\`id\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);

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

  // Isi jobdesk default Kitchen bila belum ada (idempotent).
  const posRow = await prisma.position.findUnique({ where: { name: POSITION_NAME } });
  if (posRow) {
    const existingJd = await prisma.positionJobdesk.findMany({ where: { positionId: posRow.id } });
    if (existingJd.length === 0) {
      await prisma.positionJobdesk.createMany({
        data: KITCHEN_JOBDESKS.map((name, i) => ({ positionId: posRow.id, name, orderIndex: i })),
      });
      console.log(`✅ ${KITCHEN_JOBDESKS.length} jobdesk default Kitchen dibuat: ${KITCHEN_JOBDESKS.join(', ')}`);
    } else {
      console.log(`ℹ️  Jobdesk Kitchen sudah ada (${existingJd.length}). Tidak diubah.`);
    }
  }

  console.log('\nLangkah selanjutnya di aplikasi:');
  console.log('1. Rotasi & Libur → Kelola Roster → isi semua staff Kitchen (Main Cook, Support, Checker, Runner, Helper).');
  console.log('2. Dashboard → Generate. Sistem akan menjadwalkan SEMUA yang tidak libur (3-4 orang),');
  console.log('   dibagi Shift 1/Shift 2 secara bergantian tiap minggu.');
}

main()
  .catch((e) => { console.error('❌ Gagal:', e.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
