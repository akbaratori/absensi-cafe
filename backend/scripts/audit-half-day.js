/**
 * audit-half-day.js
 *
 * DRY-RUN (READ-ONLY). Tidak mengubah data apa pun.
 *
 * Menampilkan record absensi yang durasi kerjanya KURANG dari durasi shift
 * efektif hari itu, supaya admin bisa menilai dampak aturan baru:
 *   - durasi < setengah shift  -> status ABSENT   (potong jatah libur 1 hari)
 *   - durasi >= setengah shift -> status HALF_DAY (potong jatah libur 1 hari)
 *   - durasi >= durasi shift   -> status tetap    (tidak potong)
 *
 * Shift efektif mengikuti urutan prioritas aplikasi:
 *   BackupAssignment.shiftNumber > Swap APPROVED > UserSchedule.shift > User.shift
 *
 * Cara pakai (dari folder backend):
 *   node scripts/audit-half-day.js
 *   node scripts/audit-half-day.js --month=2026-09
 *   node scripts/audit-half-day.js --until=2026-09-13
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const prisma = require('../src/utils/database');
const swapService = require('../src/services/swapService');

const WITA_OFFSET_MS = 8 * 60 * 60 * 1000;
const toWITA = (d) => new Date(d.getTime() + WITA_OFFSET_MS);
const isoWITA = (d) => toWITA(d).toISOString().slice(0, 10);
const hhmm = (d) => (d ? toWITA(d).toISOString().slice(11, 16) : '--:--');
const durStr = (min) => `${Math.floor(min / 60)}j${String(Math.round(min % 60)).padStart(2, '0')}m`;

/** "08:15" + "20:00" -> 705 menit (dukung shift lewat tengah malam) */
const shiftMinutes = (startTime, endTime) => {
  const [sh, sm] = String(startTime).split(':').map(Number);
  const [eh, em] = String(endTime).split(':').map(Number);
  let mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins <= 0) mins += 24 * 60;
  return mins;
};

const parseArg = (name, fallback = null) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : fallback;
};

const pad = (s, n) => String(s ?? '').padEnd(n).slice(0, n);

/**
 * Toleransi jam pulang (menit). Orang yang pulang beberapa menit sebelum shift
 * berakhir TIDAK dihitung setengah hari — mis. clock-out 22:27 untuk shift
 * yang berakhir 22:30 tetap dianggap hadir penuh.
 * Ubah dengan: node scripts/audit-half-day.js --grace=90
 */
const DEFAULT_GRACE_MIN = 60;


async function main() {
  console.log('=== AUDIT SETENGAH HARI (DRY-RUN — TIDAK ADA PERUBAHAN DATA) ===\n');

  // --- Daftar shift: number mengikuti urutan id (konvensi rotationService) ---
  const allShifts = await prisma.shift.findMany({ orderBy: { id: 'asc' } });
  if (!allShifts.length) {
    console.log('Tidak ada data shift di tabel shifts. Batal.');
    return;
  }
  const shiftByNumber = new Map(allShifts.map((s, i) => [i + 1, s]));

  console.log('Daftar shift:');
  allShifts.forEach((s, i) => {
    console.log(`  #${i + 1} (id=${s.id}) ${s.name}  ${s.startTime}-${s.endTime}  = ${durStr(shiftMinutes(s.startTime, s.endTime))}`);
  });
  console.log('');

  // --- Rentang bulan berjalan (WITA) ---
  const nowWITA = toWITA(new Date());
  const monthArg = parseArg('month', nowWITA.toISOString().slice(0, 7)); // YYYY-MM
  const monthStartWITA = new Date(`${monthArg}-01T00:00:00+08:00`);

  const yesterdayWITA = new Date(nowWITA);
  yesterdayWITA.setUTCDate(yesterdayWITA.getUTCDate() - 1);
  const untilStr = parseArg('until', isoWITA(yesterdayWITA));
  const graceMin = Number(parseArg('grace', DEFAULT_GRACE_MIN));

  const rangeStartUTC = new Date(monthStartWITA.getTime() - 24 * 60 * 60 * 1000); // geser 1 hari, aman utk boundary
  const rangeEndUTC = new Date(`${untilStr}T23:59:59+08:00`);

  console.log(`Periode: ${monthArg}-01 s/d ${untilStr} (WITA)`);
  console.log(`Toleransi jam pulang: ${graceMin} menit (pulang lebih awal <= ${graceMin} menit = hadir penuh)`);
  console.log('Catatan: hari ini tidak dihitung karena shift bisa masih berjalan.\n');

  if (rangeEndUTC < monthStartWITA) {
    console.log('Tidak ada hari yang bisa dianalisis pada periode ini.');
    return;
  }

  const records = await prisma.attendance.findMany({
    where: { date: { gte: rangeStartUTC, lte: rangeEndUTC } },
    include: { user: { select: { id: true, fullName: true, shift: true, department: true } } },
    orderBy: [{ date: 'asc' }, { userId: 'asc' }],
  });

  const inMonth = records.filter((r) => isoWITA(r.date).startsWith(monthArg));

  if (!inMonth.length) {
    console.log('Tidak ada record absensi pada periode ini.');
    return;
  }

  const flagged = [];   // perlu diubah jadi ABSENT/HALF_DAY
  const pending = [];   // belum clock-out / tanpa acuan shift
  const okCount = { present: 0, late: 0, half: 0 };

  for (const rec of inMonth) {
    const witaDate = isoWITA(rec.date);
    const dayStart = new Date(`${witaDate}T00:00:00+08:00`);
    const dayEnd = new Date(`${witaDate}T23:59:59+08:00`);

    // --- Shift efektif (prioritas sama dengan aplikasi) ---
    let shift = null;
    let source = '-';

    const backup = await prisma.backupAssignment.findFirst({
      where: { backupUserId: rec.userId, date: { gte: dayStart, lte: dayEnd } },
    });
    if (backup && shiftByNumber.has(backup.shiftNumber)) {
      shift = shiftByNumber.get(backup.shiftNumber);
      source = `backup shift ${backup.shiftNumber}`;
    }

    if (!shift) {
      const swapShift = await swapService.getActiveSwap(rec.userId, dayStart);
      if (swapShift) {
        shift = swapShift;
        source = 'swap disetujui';
      }
    }

    if (!shift) {
      const us = await prisma.userSchedule.findFirst({
        where: { userId: rec.userId, date: { gte: dayStart, lte: dayEnd } },
        include: { shift: true },
      });
      if (us?.shift) {
        shift = us.shift;
        source = 'jadwal';
      }
    }

    if (!shift && rec.user?.shift) {
      shift = rec.user.shift;
      source = 'shift default user';
    }

    if (!rec.clockOut || !shift) {
      pending.push({
        witaDate,
        name: rec.user?.fullName || `#${rec.userId}`,
        department: rec.user?.department || '-',
        status: rec.status,
        clockIn: hhmm(rec.clockIn),
        why: !rec.clockOut ? 'belum clock-out' : 'tanpa acuan shift',
      });
      continue;
    }

    const worked = Math.round((rec.clockOut.getTime() - rec.clockIn.getTime()) / 60000);
    const full = shiftMinutes(shift.startTime, shift.endTime);
    const half = full / 2;
    const fullWithGrace = full - graceMin;
    const proposed = worked < half ? 'ABSENT' : (worked < fullWithGrace ? 'HALF_DAY' : null);

    if (!proposed) {
      if (rec.status === 'LATE') okCount.late++; else okCount.present++;
      continue;
    }
    if (rec.status === proposed) { okCount.half++; continue; }

    flagged.push({
      witaDate,
      name: rec.user?.fullName || `#${rec.userId}`,
      userId: rec.userId,
      clockIn: hhmm(rec.clockIn),
      clockOut: hhmm(rec.clockOut),
      worked,
      shiftName: shift.name,
      shiftWindow: `${shift.startTime}-${shift.endTime}`,
      source,
      full,
      half,
      current: rec.status,
      proposed,
      potong: rec.status === 'ABSENT' ? 0 : 1,
      notes: rec.notes,
    });
  }

  // --- Laporan per tanggal ---
  console.log('=== RECORD YANG STATUSNYA BERUBAH MENURUT ATURAN BARU ===');
  if (!flagged.length) {
    console.log('Tidak ada. Semua durasi kerja >= durasi shift efektif.\n');
  } else {
    const byDate = new Map();
    for (const f of flagged) {
      if (!byDate.has(f.witaDate)) byDate.set(f.witaDate, []);
      byDate.get(f.witaDate).push(f);
    }
    for (const [date, list] of [...byDate.entries()].sort()) {
      console.log(`\n${date}`);
      for (const f of list) {
        console.log(`  ${pad(f.name, 12)} ${f.clockIn}-${f.clockOut} = ${pad(durStr(f.worked), 7)} dari ${pad(durStr(f.full), 7)} (setengah: ${durStr(f.half)})`);
        console.log(`    shift  : ${f.shiftName} ${f.shiftWindow}  [${f.source}]`);
        console.log(`    status : ${f.current} -> ${f.proposed}${f.potong ? '   ** POTONG JATAH 1 HARI **' : ''}`);
        if (f.notes) console.log(`    notes  : ${f.notes}`);
      }
    }
  }

  // --- Dampak jatah libur per user ---
  const deltaByUser = new Map();
  for (const f of flagged) {
    if (!f.potong) continue;
    if (!deltaByUser.has(f.userId)) deltaByUser.set(f.userId, { name: f.name, days: 0 });
    deltaByUser.get(f.userId).days += 1;
  }

  console.log(`\n=== DAMPAK JATAH LIBUR (perkiraan, bulan ${monthArg}) ===`);
  if (!deltaByUser.size) {
    console.log('Tidak ada jatah libur yang perlu dipotong ulang.');
  } else {
    for (const [, d] of deltaByUser) {
      console.log(`  ${pad(d.name, 12)} +${d.days} hari terpakai  (jatah 4/bulan)`);
    }
  }

  // --- Record yang belum bisa dinilai ---
  console.log('\n=== BELUM BISA DINILAI ===');
  if (!pending.length) {
    console.log('Tidak ada.');
  } else {
    for (const p of pending) {
      console.log(`  ${p.witaDate}  ${pad(p.name, 12)} ${pad(p.department, 8)} masuk ${p.clockIn}  status=${pad(p.status, 9)} -> ${p.why}`);
    }
    const pendByUser = new Map();
    for (const p of pending) {
      const key = `${p.name} (${p.department})`;
      if (!pendByUser.has(key)) pendByUser.set(key, { total: 0, noOut: 0, noShift: 0 });
      const e = pendByUser.get(key);
      e.total += 1;
      if (p.why === 'belum clock-out') e.noOut += 1; else e.noShift += 1;
    }
    console.log('\n  Rekap:');
    for (const [key, e] of pendByUser) {
      console.log(`    ${pad(key, 22)} ${e.total} hari  (belum clock-out: ${e.noOut}, tanpa acuan shift: ${e.noShift})`);
    }
  }

  console.log('\n=== RINGKASAN ===');
  console.log(`  Total record periode ini   : ${inMonth.length}`);
  console.log(`  Perlu ubah status          : ${flagged.length}`);
  console.log(`  Sudah sesuai aturan baru   : ${okCount.half}`);
  console.log(`  Hadir penuh (aman)         : ${okCount.present + okCount.late}`);
  console.log(`  Belum bisa dinilai         : ${pending.length}`);
  console.log('\nDRY-RUN selesai — TIDAK ADA data yang diubah.');
}

main()
  .catch((err) => {
    console.error('❌ Error:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

