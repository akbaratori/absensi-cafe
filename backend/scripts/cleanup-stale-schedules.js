/**
 * cleanup-stale-schedules.js
 * 
 * Hapus baris user_schedules untuk user yang tidak terdaftar di position_rosters.
 * Baris-baris ini adalah sisa dari bug auto-generate Shift 1 yang sudah diperbaiki.
 * 
 * Run: node scripts/cleanup-stale-schedules.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const prisma = require('../src/utils/database');

async function main() {
  console.log('=== Cleanup Stale User Schedules ===\n');

  // 1. Cek dulu siapa yang akan dihapus
  const staleRows = await prisma.$queryRaw`
    SELECT us.id, us.user_id, u.full_name, us.date
    FROM user_schedules us
    JOIN users u ON u.id = us.user_id
    WHERE us.user_id NOT IN (SELECT DISTINCT user_id FROM position_rosters)
    ORDER BY us.user_id, us.date
  `;

  if (staleRows.length === 0) {
    console.log('✅ Tidak ada stale rows. Database sudah bersih.');
    return;
  }

  console.log(`Ditemukan ${staleRows.length} baris stale yang akan dihapus:\n`);

  // Tampilkan per user
  const byUser = {};
  for (const row of staleRows) {
    const key = `${row.user_id} - ${row.full_name}`;
    if (!byUser[key]) byUser[key] = [];
    byUser[key].push(row.date instanceof Date ? row.date.toISOString().split('T')[0] : String(row.date));
  }

  for (const [user, dates] of Object.entries(byUser)) {
    console.log(`  👤 ${user}: ${dates.length} rows (${dates[0]} s/d ${dates[dates.length - 1]})`);
  }

  // 2. Konfirmasi otomatis (non-interactive) — jalankan DELETE
  console.log('\nMenjalankan DELETE...');

  const result = await prisma.$executeRaw`
    DELETE FROM user_schedules
    WHERE user_id NOT IN (SELECT DISTINCT user_id FROM position_rosters)
  `;

  console.log(`\n✅ Selesai. ${result} baris dihapus.`);
}

main()
  .catch((err) => {
    console.error('❌ Error:', err.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
