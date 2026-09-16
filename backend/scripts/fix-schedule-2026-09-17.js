/**
 * fix-schedule-2026-09-17.js
 *
 * DRY-RUN default. Jalankan dengan --apply untuk menerapkan.
 *
 * Masalah: 17 Sep 2026 staf Dapur cuma masuk 2 orang (Wulan shift 1, Nhelam shift 2)
 * karena Juli DAN Indy dua-duanya berstatus libur di hari yang sama:
 *   - Juli  : is_off_day=true (is_manual_override=true) — padahal pola libur
 *             rotasinya 7/14/21/28 Sep, jadi 17 Sep bukan hari liburnya.
 *   - Indy  : is_off_day=true (ManualOffDay id=567 untuk tanggal ini).
 * Akibatnya Wulan merangkap 4 jobdesk sendirian dan paket jobdesk tidak adil.
 *
 * Perbaikan:
 *   1. Juli  -> masuk, Shift 1 (shiftId=1)
 *   2. Indy  -> masuk, Shift 2 (shiftId=3)
 *   3. Hapus ManualOffDay Indy 17 Sep agar tidak jadi fallback "libur"
 *   4. temporary_department semua staf Dapur hari itu -> 'KITCHEN' + manual override
 *      dibuka, supaya distributeKitchenJobdesksForDates mau memproses mereka
 *   5. Jalankan ulang distribusi paket jobdesk -> 4 orang, pembagian adil
 *
 * Catatan: baris BAR (Baso, Gio) tidak disentuh sama sekali.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const prisma = require('../src/utils/database');
const rotationService = require('../src/services/rotationService');

const APPLY = process.argv.includes('--apply');
const DATE_STR = '2026-09-17';
const DATE = new Date(`${DATE_STR}T00:00:00.000Z`);

const SHIFT_1 = 1; // 08:15-20:00
const SHIFT_2 = 3; // 11:00-22:30

async function state(label) {
  const rows = await prisma.userSchedule.findMany({
    where: { date: DATE, user: { department: 'KITCHEN' } },
    include: { user: { select: { fullName: true } }, shift: true },
    orderBy: { user: { fullName: 'asc' } },
  });
  console.log(`\n--- ${label} ---`);
  for (const r of rows) {
    const s = r.isOffDay ? 'LIBUR' : `shift ${r.shift ? r.shift.name : '(kosong)'}`;
    console.log(
      `  ${r.user.fullName.padEnd(9)} ${s.padEnd(16)} manual=${String(r.isManualOverride).padEnd(5)} tempDept=${(r.temporaryDepartment || '-').padEnd(8)} jobdesk=${r.kitchenStation || '-'}`
    );
  }
  const masuk = rows.filter((r) => !r.isOffDay).length;
  console.log(`  => masuk ${masuk} orang`);
  return rows;
}

async function main() {
  console.log('=== PERBAIKAN JADWAL DAPUR 17 SEP 2026 ===');
  console.log(APPLY ? 'MODE: APPLY (data akan diubah)\n' : 'MODE: DRY-RUN (tidak ada data diubah)\n');

  const before = await state('SEBELUM');

  const juli = before.find((r) => r.user.fullName === 'Juli');
  const indy = before.find((r) => r.user.fullName === 'Indy');

  if (!juli || !indy) {
    console.log('\n❌ Baris Juli/Indy untuk tanggal ini tidak ditemukan. Batal.');
    return;
  }

  console.log('\nRencana perubahan:');
  console.log(`  Juli  -> isOffDay=${juli.isOffDay} jadi false | shiftId=${juli.shiftId} jadi ${SHIFT_1} (Shift 1) | manual=true jadi false | tempDept=BAR jadi KITCHEN`);
  console.log(`  Indy  -> isOffDay=${indy.isOffDay} jadi false | shiftId=${indy.shiftId} jadi ${SHIFT_2} (Shift 2) | manual=${indy.isManualOverride} jadi false | tempDept=BAR jadi KITCHEN`);
  console.log(`  Wulan, Nhelam -> tempDept jadi KITCHEN (jobdesk dihitung ulang)`);
  console.log(`  Hapus ManualOffDay Indy ${DATE_STR} (agar tidak jadi fallback libur)`);
  console.log('  Baso & Gio (BAR) TIDAK disentuh.');

  if (!APPLY) {
    console.log('\nDRY-RUN selesai. Jalankan dengan --apply untuk menerapkan.');
    return;
  }

  // 1. Juli + Indy: batalkan libur, set shift, buka manual override, set dept
  await prisma.userSchedule.update({
    where: { id: juli.id },
    data: {
      isOffDay: false,
      shiftId: SHIFT_1,
      isManualOverride: false,
      temporaryDepartment: 'KITCHEN',
      kitchenStation: null,
    },
  });
  await prisma.userSchedule.update({
    where: { id: indy.id },
    data: {
      isOffDay: false,
      shiftId: SHIFT_2,
      isManualOverride: false,
      temporaryDepartment: 'KITCHEN',
      kitchenStation: null,
    },
  });

  // 2. Sisa staf Dapur: pastikan temporaryDepartment KITCHEN
  const rest = await prisma.userSchedule.updateMany({
    where: {
      date: DATE,
      user: { department: 'KITCHEN' },
      id: { notIn: [juli.id, indy.id] },
    },
    data: { temporaryDepartment: 'KITCHEN' },
  });
  console.log(`\n✅ ${2 + rest.count} baris Dapur disiapkan (dept=KITCHEN).`);

  // 3. Hapus ManualOffDay Indy untuk tanggal ini
  const del = await prisma.manualOffDay.deleteMany({ where: { date: DATE, userId: indy.userId } });
  console.log(`✅ ManualOffDay dihapus: ${del.count} baris.`);

  // 4. Distribusi ulang paket jobdesk
  await rotationService.distributeKitchenJobdesksForDates([DATE]);
  console.log('✅ Distribusi paket jobdesk dijalankan ulang.');

  const after = await state('SESUDAH');
  const masuk = after.filter((r) => !r.isOffDay).length;
  console.log(
    masuk === 4
      ? '\n Selesai — 4 staf Dapur masuk dan jobdesk sudah dibagi rata.'
      : `\n⚠️ Selesai, tapi jumlah masuk = ${masuk} (diharapkan 4). Periksa lagi.`
  );
}

main()
  .catch((err) => {
    console.error('❌ Error:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });