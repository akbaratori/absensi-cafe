// ONE-OFF: perbaiki jadwal kitchen untuk rentang tanggal yang sudah ada.
// Distribusi ulang HANYA menyentuh staff yang TIDAK dikunci admin
// (isManualOverride = false); jobdesk yang dikunci admin tetap dipertahankan
// dan hurufnya dihitung sudah terisi (perbaikan rotasiService).
// Dijalankan: node scripts/repair-kitchen-stations.cjs [FROM] [TO]
(async () => {
  const rotationService = require('../src/services/rotationService');
  const prisma = require('../src/utils/database');

  const FROM = process.argv[2] || '2026-09-01';
  const TO = process.argv[3] || '2026-11-01';
  const dates = [];
  const cur = new Date(`${FROM}T00:00:00Z`);
  const end = new Date(`${TO}T00:00:00Z`);
  while (cur <= end) {
    dates.push(new Date(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  console.log(`[repair] ${FROM}..${TO} (${dates.length} hari)`);
  await rotationService.distributeKitchenJobdesksForDates(dates);
  await prisma.$disconnect();
  console.log('[repair] selesai');
})().catch((e) => { console.error('GAGAL', e); process.exit(1); });