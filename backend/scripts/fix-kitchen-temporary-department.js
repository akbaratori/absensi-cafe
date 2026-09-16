/**
 * fix-kitchen-temporary-department.js
 *
 * DRY-RUN default (tidak mengubah data). Jalankan dengan --apply untuk menerapkan.
 *
 * Masalah: rotationService.setScheduleAssignment dulu memakai
 * `position.name === 'Kitchen'`, padahal posisi di DB bernama "Dapur" → setiap
 * override shift manual menulis temporaryDepartment = 'BAR' untuk staff Dapur.
 * Akibatnya distributeKitchenJobdesksForDates (yang hanya memproses staff dengan
 * temporaryDepartment 'KITCHEN'/null) melewati mereka SEMUA → jobdesk tidak pernah
 * didistribusikan ulang saat ada yang libur.
 *
 * Script ini mengembalikan temporaryDepartment menjadi 'KITCHEN' untuk baris
 * user_schedules milik user yang:
 *   1. terdaftar di roster posisi Kitchen/Dapur, DAN
 *   2. department-nya 'KITCHEN'
 * dan temporaryDepartment-nya sekarang bukan 'KITCHEN'.
 *
 * Cara pakai (dari folder backend):
 *   node scripts/fix-kitchen-temporary-department.js
 *   node scripts/fix-kitchen-temporary-department.js --apply
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const prisma = require('../src/utils/database');

const APPLY = process.argv.includes('--apply');

async function main() {
  console.log('=== PERBAIKI temporary_department STAFF DAPUR ===');
  console.log(APPLY ? 'MODE: APPLY (data akan diubah)\n' : 'MODE: DRY-RUN (tidak ada data diubah)\n');

  const position = await prisma.position.findFirst({
    where: { OR: [{ name: 'Kitchen' }, { name: 'Dapur' }], isActive: true },
    include: { rosters: { select: { userId: true } } },
  });

  if (!position) {
    console.log('Posisi Kitchen/Dapur aktif tidak ditemukan. Batal.');
    return;
  }

  const rosterIds = position.rosters.map((r) => r.userId);
  console.log(`Posisi: ${position.name} (id=${position.id}), ${rosterIds.length} staff di roster\n`);

  if (!rosterIds.length) {
    console.log('Roster kosong. Batal.');
    return;
  }

  const rows = await prisma.userSchedule.findMany({
    where: {
      userId: { in: rosterIds },
      temporaryDepartment: { not: 'KITCHEN' },
    },
    include: { user: { select: { id: true, fullName: true, department: true } } },
    orderBy: [{ userId: 'asc' }, { date: 'asc' }],
  });

  // Hanya perbaiki nilai yang memang nama departemen lain ('BAR').
  // Nilai penanda lain (mis. 'PULANG SAKIT (...)') TIDAK diubah — itu jejak admin.
  const affected = rows.filter((r) => r.user?.department === 'KITCHEN' && r.temporaryDepartment === 'BAR');
  const untouched = rows.filter((r) => r.user?.department === 'KITCHEN' && r.temporaryDepartment !== 'BAR');

  if (untouched.length) {
    const labels = new Set(untouched.map((r) => String(r.temporaryDepartment)));
    console.log(`Dilewati: ${untouched.length} baris dengan penanda non-departemen (${[...labels].join(' | ')})\n`);
  }

  if (!affected.length) {
    console.log('Tidak ada baris yang perlu diperbaiki.');
    return;
  }

  const byUser = new Map();
  for (const r of affected) {
    const key = r.user.fullName;
    if (!byUser.has(key)) byUser.set(key, { count: 0, values: new Set(), first: r.date, last: r.date });
    const e = byUser.get(key);
    e.count += 1;
    e.values.add(String(r.temporaryDepartment));
    if (r.date < e.first) e.first = r.date;
    if (r.date > e.last) e.last = r.date;
  }

  console.log(`Ditemukan ${affected.length} baris milik ${byUser.size} staff:\n`);
  for (const [name, e] of byUser) {
    console.log(`  ${name.padEnd(12)} ${String(e.count).padStart(3)} baris  dept sekarang: ${[...e.values].join(', ')}  (${e.first.toISOString().slice(0, 10)} s/d ${e.last.toISOString().slice(0, 10)})`);
  }

  if (!APPLY) {
    console.log('\nDRY-RUN selesai. Jalankan dengan --apply untuk mengubah menjadi KITCHEN.');
    return;
  }

  const result = await prisma.userSchedule.updateMany({
    where: {
      userId: { in: affected.map((r) => r.userId) },
      id: { in: affected.map((r) => r.id) },
    },
    data: { temporaryDepartment: 'KITCHEN' },
  });

  console.log(`\n✅ Selesai. ${result.count} baris diubah menjadi temporaryDepartment = 'KITCHEN'.`);
}

main()
  .catch((err) => {
    console.error('❌ Error:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
