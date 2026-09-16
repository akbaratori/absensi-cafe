/**
 * add-plating-jobdesk.js
 *
 * DRY-RUN default. Jalankan dengan --apply untuk menerapkan.
 *
 * Kenapa perlu: jobdesk "Plating" TIDAK PERNAH ada di tabel position_jobdesks.
 * Daftar jobdesk posisi Dapur cuma 5: Main Cook, Support Cook, Checker / Stock,
 * Runner / Area, Helper / Floating. Karena itu rotasi tidak pernah bisa
 * menampilkan "Checker / Stock + Plating", walaupun rotationService sudah
 * menyiapkan aturannya (_kitchenRoleOf -> 'PLATING' otomatis menempel ke CHECKER).
 *
 * Script ini:
 *   1. Menambahkan jobdesk "Plating" (is_heavy=false) ke posisi Dapur/Kitchen
 *      yang aktif, di urutan paling akhir.
 *   2. Menjalankan ulang distribusi paket jobdesk untuk tanggal yang ditentukan
 *      (default: hari ini + besok, waktu WITA).
 *
 * Hasil yang diharapkan: jobdesk Plating selalu menempel ke pemegang
 * "Checker / Stock" pada orang yang sama, mis. "Checker / Stock + Plating".
 *
 * Cara pakai (dari folder backend):
 *   node scripts/add-plating-jobdesk.js                        # dry-run
 *   node scripts/add-plating-jobdesk.js --apply                # terapkan (hari ini + besok)
 *   node scripts/add-plating-jobdesk.js --apply --dates=2026-09-16,2026-09-17
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const prisma = require('../src/utils/database');
const rotationService = require('../src/services/rotationService');

const APPLY = process.argv.includes('--apply');
const NAMA_JOBDESK = 'Plating';
const CATATAN = [];

function argDates() {
  const raw = process.argv.find((a) => a.startsWith('--dates='));
  if (raw) {
    return raw
      .slice('--dates='.length)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => new Date(`${s}T00:00:00.000Z`));
  }
  // Default: hari ini + besok menurut WITA (UTC+8)
  const nowWITA = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const base = new Date(`${nowWITA.toISOString().slice(0, 10)}T00:00:00.000Z`);
  return [base, new Date(base.getTime() + 24 * 60 * 60 * 1000)];
}

async function tampilkanJadwal(dates, label) {
  console.log(`\n--- ${label} ---`);
  for (const d of dates) {
    const iso = d.toISOString().slice(0, 10);
    const rows = await prisma.userSchedule.findMany({
      where: { date: d, user: { department: 'KITCHEN' } },
      include: { user: { select: { fullName: true } } },
      orderBy: { user: { fullName: 'asc' } },
    });
    console.log(`  ${iso}:`);
    for (const r of rows) {
      console.log(
        `    ${r.user.fullName.padEnd(9)} ${(r.isOffDay ? '[LIBUR]' : r.kitchenStation || '(kosong)')}`
      );
    }
  }
}

async function main() {
  console.log('=== TAMBAH JOBDESK "PLATING" KE POSISI DAPUR ===');
  console.log(APPLY ? 'MODE: APPLY (data akan diubah)\n' : 'MODE: DRY-RUN (tidak ada data diubah)\n');

  const positions = await prisma.position.findMany({
    where: { OR: [{ name: 'Kitchen' }, { name: 'Dapur' }], isActive: true },
    include: { jobdesks: { orderBy: { orderIndex: 'asc' } } },
  });

  if (!positions.length) {
    console.log('Posisi Kitchen/Dapur aktif tidak ditemukan. Batal.');
    return;
  }

  const dates = argDates();
  console.log(`Tanggal redistribusi: ${dates.map((d) => d.toISOString().slice(0, 10)).join(', ')}`);

  for (const position of positions) {
    console.log(`\nPosisi: ${position.name} (id=${position.id})`);
    console.log(`  Jobdesk sekarang (${position.jobdesks.length}):`);
    position.jobdesks.forEach((j) => console.log(`    [${j.orderIndex}] ${j.name}${j.isHeavy ? ' (berat)' : ''}`));

    const exists = position.jobdesks.some((j) => j.name.toLowerCase() === NAMA_JOBDESK.toLowerCase());

    if (exists) {
      console.log(`  -> "${NAMA_JOBDESK}" SUDAH ADA, dilewati.`);
      CATATAN.push(`${position.name}: sudah ada`);
      continue;
    }

    const nextIndex = position.jobdesks.length
      ? Math.max(...position.jobdesks.map((j) => j.orderIndex)) + 1
      : 0;

    console.log(`  -> akan tambah "${NAMA_JOBDESK}" (orderIndex=${nextIndex}, isHeavy=false)`);

    if (APPLY) {
      const created = await prisma.positionJobdesk.create({
        data: { positionId: position.id, name: NAMA_JOBDESK, orderIndex: nextIndex, isHeavy: false },
      });
      console.log(`  ✅ dibuat, id=${created.id}`);
      CATATAN.push(`${position.name}: ditambahkan (id=${created.id})`);
    }
  }

  if (!APPLY) {
    console.log('\nDRY-RUN selesai. Jalankan dengan --apply untuk menerapkan.');
    return;
  }

  await tampilkanJadwal(dates, 'SEBELUM redistribusi');

  await rotationService.distributeKitchenJobdesksForDates(dates);
  console.log('\n✅ Distribusi paket jobdesk dijalankan ulang.');

  await tampilkanJadwal(dates, 'SESUDAH redistribusi');

  console.log(`\nRingkasan: ${CATATAN.join(' | ')}`);
}

main()
  .catch((err) => {
    console.error('❌ Error:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });