/**
 * backfill-indy-leave-2026-09.js
 *
 * DRY-RUN default. Jalankan dengan --apply untuk menerapkan.
 *
 * KENAPA script ini ada:
 * Menu Pengajuan Izin (POST /leaves -> leaveService.createLeave) MENOLAK tanggal
 * lampau ("Cannot submit leave requests for past dates"), sehingga izin lisan
 * bulan lalu tidak bisa dirapikan lewat UI. Script ini menulis langsung ke tabel
 * `leaves` sebagai catatan historis (backfill).
 *
 * PENTING — supaya TIDAK dobel potong:
 * `getLeaveBalance()` menghitung potongan dari JADWAL vs ABSENSI, bukan dari
 * tabel `leaves`. Baris `leaves` hanya menambah hitungan lewat `leaveDays`.
 * Karena tanggal-tanggal di bawah SUDAH terhitung sebagai `noShowDays`, script
 * ini memverifikasi bahwa tidak ada hari kerja yang belum terhitung. Kalau ada,
 * script membatalkan diri kecuali dipaksa dengan --force.
 *
 * Kondisi Indy Sep 2026 (hasil audit):
 *   offDays=1, noShowDays=4, halfDays=2 -> potong-aktual=7, used=7, remaining=0
 *   4 hari bolong (10, 13, 14, 15 Sep) semuanya SUDAH terhitung noShow.
 *
 * Cara pakai (dari folder backend):
 *   node scripts/backfill-indy-leave-2026-09.js            # dry-run
 *   node scripts/backfill-indy-leave-2026-09.js --apply    # terapkan
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const prisma = require('../src/utils/database');
const leaveService = require('../src/services/leaveService');

const APPLY = process.argv.includes('--apply');
const FORCE = process.argv.includes('--force');
const WITA_OFFSET_MS = 8 * 60 * 60 * 1000;

const NAMA_STAF = 'Indy';
const TYPE = 'PERMISSION';
// PENTING: hanya 10 Sep. Tanggal 13, 14, 15 Sep TIDAK dimasukkan karena
// ternyata SUDAH tercatat di `leave` milik Indy (3 baris terpisah).
// 11 Sep juga DIKELUARKAN: Indy masuk kerja normal (PRESENT 08:10 -> clockOut NULL).
const REASON = 'Izin tertulis (backfill Sep 2026).';
const RENTANG = ['2026-09-10', '2026-09-10'];

/** Ubah daftar tanggal WITA jadi satu rentang start/end (inklusif). */
function bentukRentang(daftarIso) {
  const start = new Date(`${daftarIso[0]}T00:00:00.000Z`);
  const end = new Date(`${daftarIso[daftarIso.length - 1]}T00:00:00.000Z`);
  return { start, end };
}

async function main() {
  console.log('=== BACKFILL IZIN TERTULIS (PERMISSION) ===');
  console.log(APPLY ? 'MODE: APPLY (data akan diubah)\n' : 'MODE: DRY-RUN (tidak ada data diubah)\n');

  const user = await prisma.user.findFirst({ where: { fullName: { contains: NAMA_STAF } } });
  if (!user) throw new Error(`Staf "${NAMA_STAF}" tidak ditemukan`);
  console.log(`Staf   : ${user.fullName} (id=${user.id})`);
  console.log(`Range  : ${RENTANG[0]} s/d ${RENTANG[RENTANG.length - 1]} (${RENTANG.length} hari)`);
  console.log(`Type   : ${TYPE}\n`);

  // ---------- 1. Cek bentrok dengan leave yang sudah ada ----------
  const { start, end } = bentukRentang(RENTANG);
  const bentrok = await prisma.leave.findFirst({
    where: { userId: user.id, status: { not: 'REJECTED' }, startDate: { lte: end }, endDate: { gte: start } },
  });
  if (bentrok) {
    console.log(`[!] Sudah ada leave #${bentrok.id} (${bentrok.type}) yang menumpuk. Batal.`);
    return;
  }
  console.log('[OK] Tidak ada leave yang menumpuk.');

  // ---------- 2. Saldo SEBELUM ----------
  const sebelum = await leaveService.getLeaveBalance(user.id);
  const potongSebelum =
    sebelum.breakdown.offDays + sebelum.breakdown.noShowDays + sebelum.breakdown.halfDays + sebelum.breakdown.absentDays;
  console.log(`\nSALDO SEBELUM: used=${sebelum.used} sisa=${sebelum.remaining}`);
  console.log(`  rincian: ${JSON.stringify(sebelum.breakdown)}`);
  console.log(`  potong-aktual = ${potongSebelum}`);

  // ---------- 3. Cari hari kerja yang BELUM terhitung ----------
  const schedules = await prisma.userSchedule.findMany({
    where: {
      userId: user.id,
      isOffDay: false,
      date: { gte: new Date('2026-09-01T00:00:00+08:00'), lte: new Date('2026-09-30T23:59:59+08:00') },
    },
    select: { date: true },
  });
  const attendances = await prisma.attendance.findMany({
    where: { userId: user.id, date: { gte: new Date('2026-09-01T00:00:00+08:00'), lte: new Date('2026-09-30T23:59:59+08:00') } },
    select: { date: true, status: true },
  });

  const attMap = new Map();
  for (const a of attendances) {
    attMap.set(new Date(a.date.getTime() + WITA_OFFSET_MS).toISOString().slice(0, 10), a.status);
  }

  const belumTerhitung = [];
  for (const s of schedules) {
    const iso = new Date(s.date.getTime() + WITA_OFFSET_MS).toISOString().slice(0, 10);
    const st = attMap.get(iso);
    if (st === undefined || st === 'ABSENT' || st === 'HALF_DAY') continue; // sudah terhitung
    belumTerhitung.push(iso);
  }
  console.log(`\nHari kerja yang belum terhitung: ${belumTerhitung.length}`);
  if (belumTerhitung.length) console.log(`  ${belumTerhitung.join(', ')}`);

  const diRange = belumTerhitung.filter((iso) => iso >= RENTANG[0] && iso <= RENTANG[RENTANG.length - 1]);
  if (diRange.length) {
    console.log(`\n[!] Tanggal backfill berikut absensinya BUKAN no-show/ABSENT/HALF_DAY:`);
    console.log(`    ${diRange.join(', ')}`);
    console.log('    Menambah leave di sini akan DOBEL POTONG.');
    if (!FORCE) {
      console.log('    Dibatalkan. Pakai --force kalau tetap mau lanjut.');
      return;
    }
    console.log('    --force diberikan, lanjut...');
  } else {
    console.log('[OK] Semua tanggal backfill sudah terhitung no-show -> potongan tidak berubah (aman).');
  }

  console.log(`\nPROYEKSI potong-aktual sesudah = ${potongSebelum} (harus sama)`);
  console.log(`PROYEKSI saldo sesudah         = used=${potongSebelum} sisa=${Math.max(0, sebelum.quota - potongSebelum)}`);

  if (!APPLY) {
    console.log('\nDRY-RUN selesai. Jalankan dengan --apply untuk menerapkan.');
    return;
  }

  // ---------- 4. Tulis ----------
  const dibuat = await prisma.leave.create({
    data: { userId: user.id, startDate: start, endDate: end, type: TYPE, reason: REASON, status: 'APPROVED' },
  });
  console.log(`\n[OK] Dibuat leave #${dibuat.id}: ${TYPE} ${RENTANG[0]}..${RENTANG[RENTANG.length - 1]} (APPROVED)`);

  // ---------- 5. Verifikasi sesudah ----------
  const sesudah = await leaveService.getLeaveBalance(user.id);
  const potongSesudah =
    sesudah.breakdown.offDays + sesudah.breakdown.noShowDays + sesudah.breakdown.halfDays + sesudah.breakdown.absentDays;
  console.log(`\nSALDO SESUDAH: used=${sesudah.used} sisa=${sesudah.remaining}`);
  console.log(`  rincian: ${JSON.stringify(sesudah.breakdown)}`);
  console.log(`  potong-aktual = ${potongSesudah}`);
  console.log(
    potongSesudah === potongSebelum
      ? '[OK] AMAN: potongan tidak berubah, keterangan jadi izin tertulis.'
      : `[X] TIDAK AMAN: potongan berubah ${potongSebelum} -> ${potongSesudah}. Rollback!`
  );
}

main()
  .catch((e) => { console.error('Error:', e.message); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
