/**
 * audit-jobdesk-days.js
 *
 * DRY-RUN (READ-ONLY). Tidak mengubah data apa pun.
 *
 * Menjawab 3 pertanyaan:
 *  1. Arti angka A/B/C/D di tabel keadilan jobdesk = jumlah HARI staf jadi
 *     stasiun UTAMA grup itu (prioritas A→D). SATU hari kerja hanya tercatat
 *     di satu kolom; hari rangkap (mis. "Support Cook + Checker") tercatat
 *     di stasiun utamanya (B) saja, jadi:
 *         Σ huruf = hari kerja - hari tanpa jobdesk  (tidak boleh > hari kerja)
 *  2. Apakah kuota hari kerja/libur aman: batas kerja = hari-bulan - 4 libur.
 *  3. Siapa yang muncul di tabel padahal tidak bekerja bulan ini
 *     (sisa 1-2 baris dari override/swap lama).
 *
 * Cara pakai (dari folder backend):
 *   node scripts/audit-jobdesk-days.js
 *   node scripts/audit-jobdesk-days.js --month=2026-10
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const prisma = require('../src/utils/database');
const scheduleService = require('../src/services/scheduleService');

const WITA_OFFSET_MS = 8 * 60 * 60 * 1000;
const toWITA = (d) => new Date(new Date(d).getTime() + WITA_OFFSET_MS);
const isoWITA = (d) => toWITA(d).toISOString().slice(0, 10);
const pad = (s, n) => String(s ?? '').padEnd(n).slice(0, n);

const parseArg = (name, fallback = null) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : fallback;
};

/** Jatah libur per bulan sesuai aturan bisnis (dari admin). */
const OFF_DAY_QUOTA = Number(parseArg('quota', '4'));

async function main() {
  const month = parseArg('month', new Date().toISOString().slice(0, 7));
  const [year, mon] = month.split('-').map(Number);
  const start = new Date(Date.UTC(year, mon - 1, 1));
  const end = new Date(Date.UTC(year, mon, 0, 23, 59, 59));
  const daysInMonth = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  const maxWork = daysInMonth - OFF_DAY_QUOTA;

  console.log(`=== AUDIT HARI JOBDESK ${month} (READ-ONLY) ===`);
  console.log(`Hari dalam bulan: ${daysInMonth} | jatah libur/pegawai: ${OFF_DAY_QUOTA} | batas kerja: ${maxWork}\n`);

  // ---- Bagian 1: tabel keadilan (A/B/C/D) + invariant Σ = kerja - kosong ----
  const fair = await scheduleService.getJobdeskFairness(month);
  console.log('--- Tabel keadilan jobdesk (A/B/C/D = HARI jadi stasiun utama grup tsb) ---');
  console.log(pad('NAMA', 14) + 'A    B    C    D    Σ    kerja  rangkap  cek-Σ');
  for (const s of fair.staff) {
    const c = s.counts;
    const sum = c.A + c.B + c.C + c.D;
    const expected = s.daysWorked - s.daysWithoutJobdesk;
    const ok = sum === expected ? 'OK' : `BEDA (ekspektasi ${expected})`;
    console.log(
      pad(s.fullName, 14) +
        pad(c.A, 5) + pad(c.B, 5) + pad(c.C, 5) + pad(c.D, 5) +
        pad(sum, 5) + pad(s.daysWorked, 7) + pad(s.multiJobdeskDays, 9) + ok
    );
  }
  for (const j of fair.byJobdesk) {
    console.log(`  kolom ${j.short}: total=${j.total} min=${j.min} max=${j.max} spread=${j.spread} timpang=${j.isUneven}`);
  }
  for (const h of fair.highlights) console.log(`  [${h.type}] ${h.message}`);

  // ---- Bagian 2: hari kerja vs kuota libur ----
  const rows = await prisma.userSchedule.findMany({
    where: {
      date: { gte: start, lte: end },
      user: { department: 'KITCHEN', isActive: true },
    },
    include: { user: { select: { id: true, fullName: true, isActive: true } } },
    orderBy: [{ date: 'asc' }],
  });

  const byUser = new Map();
  for (const r of rows) {
    const key = r.userId;
    if (!byUser.has(key)) {
      byUser.set(key, { id: r.user.id, name: r.user.fullName, work: 0, off: 0, jobs: 0, rows: [] });
    }
    const e = byUser.get(key);
    e.rows.push(r);
    if (r.isOffDay) e.off += 1;
    else {
      e.work += 1;
      if (String(r.kitchenStation || '').trim()) e.jobs += 1;
    }
  }

  console.log('\n--- Hari kerja vs kuota libur ---');
  console.log(pad('NAMA', 14) + pad('id', 5) + pad('kerja', 8) + pad('libur', 8) + 'CATATAN');
  console.log('-'.repeat(72));

  let suspect = 0;
  for (const e of [...byUser.values()].sort((a, b) => b.work - a.work || a.name.localeCompare(b.name))) {
    const notes = [];
    if (e.work > maxWork) notes.push(`LEBIH dari batas ${maxWork} kerja (+${e.work - maxWork})`);
    if (e.work > 0 && e.work < maxWork) notes.push(`kurang ${maxWork - e.work} hari dari batas`);
    if (e.off === 0 && e.work > 0) notes.push('TIDAK PUNYA hari libur sama sekali');
    if (e.work > 0 && e.work <= 4) notes.push('hanya sisa <=4 hari kerja — cek sisa data lama');
    if (notes.length) suspect += 1;
    console.log(pad(e.name, 14) + pad(e.id, 5) + pad(e.work, 8) + pad(e.off, 8) + (notes.join('; ') || 'ok'));
  }

  // Rincian baris kerja untuk staff yang bermasalah.
  console.log('\n--- Rincian hari kerja staff bermasalah ---');
  for (const e of byUser.values()) {
    if (e.work <= maxWork && e.work > 4) continue;
    console.log(`\n${e.name} (id=${e.id}) — ${e.work} hari kerja, ${e.off} hari libur`);
    for (const r of e.rows) {
      if (r.isOffDay) continue;
      console.log(
        `  ${isoWITA(r.date)}  jobdesk="${r.kitchenStation || '(kosong)'}"` +
        `  manual=${r.isManualOverride ? 'YA' : 'tidak'}  shiftId=${r.shiftId ?? '-'}  deptSementara=${r.temporaryDepartment || '-'}`
      );
    }
  }

  // officially off: user dengan baris libur tapi tidak ada baris kerja.
  console.log('\n--- Libur penuh (semua baris isOffDay) ---');
  let fullOff = 0;
  for (const e of byUser.values()) {
    if (e.off > 0 && e.work === 0) {
      fullOff += 1;
      console.log(`${pad(e.name, 14)} id=${e.id}  ${e.off} hari libur, 0 hari kerja`);
    }
  }
  if (!fullOff) console.log('(tidak ada)');

  console.log(`\nStaff perkiraan perlu diperiksa: ${suspect}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('ERROR:', e.message);
  await prisma.$disconnect();
  process.exit(1);
});
