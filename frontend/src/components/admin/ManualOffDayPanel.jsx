import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import rotationService from '../../services/rotationService';

const HARI = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const HARI_FULL = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const BULAN_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

/** Semua tanggal dalam bulan sebagai array string YYYY-MM-DD */
function getDatesInMonth(year, month) {
  const dates = [];
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const mm = String(month).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    dates.push(`${year}-${mm}-${dd}`);
  }
  return dates;
}

/** Grid kalender 7 kolom, null untuk hari di luar bulan */
function buildCalendarGrid(year, month) {
  const firstDay = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const grid = [];
  let week = [];
  for (let i = 0; i < firstDay; i++) week.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const mm = String(month).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    week.push(`${year}-${mm}-${dd}`);
    if (week.length === 7) { grid.push(week); week = []; }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null);
    grid.push(week);
  }
  return grid;
}

/** Siapa yang libur di tanggal tertentu (userId list) */
function whoIsOffOn(offDays, dateStr) {
  return offDays.filter((o) => o.date === dateStr).map((o) => o.userId);
}

/**
 * Dapatkan hari tetap (dow 0-6) yang sudah dikunci untuk userId ini di bulan ini.
 * Jika belum ada libur sama sekali, return null (bebas pilih hari apa saja).
 * Jika sudah ada, return dow pertama yang terdaftar.
 */
function getLockedDow(offDays, userId) {
  const userOffDays = offDays.filter((o) => o.userId === userId);
  if (userOffDays.length === 0) return null;
  return new Date(userOffDays[0].date).getUTCDay();
}

export default function ManualOffDayPanel({ roster }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [offDays, setOffDays] = useState([]); // [{ userId, date }]
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [focusUser, setFocusUser] = useState(null);

  const monthStr = `${year}-${String(month).padStart(2, '0')}`;

  useEffect(() => { fetchOffDays(); }, [year, month]);

  const fetchOffDays = async () => {
    setFetching(true);
    try {
      const res = await rotationService.getManualOffDaysMonth(monthStr);
      const raw = res.data?.data || [];
      setOffDays(raw.map((item) => ({
        userId: item.userId,
        date: new Date(item.date).toISOString().split('T')[0],
      })));
    } catch (err) {
      toast.error('Gagal memuat data libur: ' + (err.response?.data?.message || err.message));
    } finally {
      setFetching(false);
    }
  };

  const getUserName = (r) => r.user?.fullName || r.user?.name || r.fullName || `User ${r.userId}`;
  const getUserNameById = (userId) => {
    const r = roster.find((x) => x.userId === userId);
    return r ? getUserName(r) : `User ${userId}`;
  };
  const isOff = (userId, dateStr) => offDays.some((o) => o.userId === userId && o.date === dateStr);
  const MAX_OFF_PER_MONTH = 4;
  const offCount = (userId) => offDays.filter((o) => o.userId === userId).length;

  /**
   * Toggle satu tanggal untuk satu pegawai.
   * Aturan:
   * 1. Max 1 pegawai libur per hari
   * 2. Max 4 libur per bulan
   * 3. Semua libur user dalam 1 bulan HARUS di hari yang sama (hari tetap)
   */
  const toggleOffDay = (userId, dateStr) => {
    if (isOff(userId, dateStr)) {
      // Hapus libur
      setOffDays((prev) => prev.filter((o) => !(o.userId === userId && o.date === dateStr)));
      return;
    }

    // Cek aturan hari tetap: dow tanggal ini harus sama dengan dow libur yang sudah ada
    const lockedDow = getLockedDow(offDays, userId);
    const thisDow = new Date(dateStr).getUTCDay();
    if (lockedDow !== null && lockedDow !== thisDow) {
      const name = getUserNameById(userId);
      toast.error(
        `${name} sudah memiliki hari libur di hari ${HARI_FULL[lockedDow]}. ` +
        `Dalam 1 bulan, pegawai hanya bisa libur di satu hari yang sama setiap minggunya.`
      );
      return;
    }

    // Cek apakah sudah ada pegawai lain libur di hari ini
    const othersOff = whoIsOffOn(offDays, dateStr).filter((id) => id !== userId);
    if (othersOff.length > 0) {
      const names = othersOff.map(getUserNameById).join(', ');
      toast.error(`${names} sudah libur di tanggal ini. Hanya 1 pegawai boleh libur per hari.`);
      return;
    }

    // Cek max 4 libur per bulan
    if (offCount(userId) >= MAX_OFF_PER_MONTH) {
      const name = getUserNameById(userId);
      toast.error(`${name} sudah memiliki ${MAX_OFF_PER_MONTH} hari libur bulan ini. Batas maksimum tercapai.`);
      return;
    }

    setOffDays((prev) => [...prev, { userId, date: dateStr }]);
  };

  /**
   * Bulk assign: set semua tanggal hari-dalam-minggu tertentu (dow 0-6) libur untuk userId.
   * Aturan hari tetap: jika user sudah punya libur di dow lain, tolak seluruh operasi.
   */
  const applyDayOfWeek = (userId, dow, enable) => {
    const dates = getDatesInMonth(year, month);
    const targetDates = dates.filter((d) => new Date(d).getUTCDay() === dow);

    if (!enable) {
      // Hapus semua hari itu untuk user ini
      setOffDays((prev) =>
        prev.filter((o) => !(o.userId === userId && targetDates.includes(o.date)))
      );
      return;
    }

    // Cek aturan hari tetap terlebih dahulu
    const lockedDow = getLockedDow(offDays, userId);
    if (lockedDow !== null && lockedDow !== dow) {
      const name = getUserNameById(userId);
      toast.error(
        `${name} sudah memiliki hari libur di hari ${HARI_FULL[lockedDow]}. ` +
        `Tidak bisa menambah libur di hari ${HARI_FULL[dow]}. ` +
        `Hapus dulu semua libur ${HARI_FULL[lockedDow]} jika ingin ganti hari.`
      );
      return;
    }

    // Tambah libur, tapi skip tanggal yang sudah dipakai orang lain atau melebihi kuota
    const currentCount = offCount(userId);
    const remaining = MAX_OFF_PER_MONTH - currentCount;
    const conflicts = [];
    const quotaSkipped = [];
    const toAdd = [];
    targetDates.forEach((dateStr) => {
      if (isOff(userId, dateStr)) return; // sudah libur, skip
      const others = whoIsOffOn(offDays, dateStr).filter((id) => id !== userId);
      if (others.length > 0) {
        conflicts.push({ dateStr, names: others.map(getUserNameById).join(', ') });
      } else if (toAdd.length >= remaining) {
        quotaSkipped.push(dateStr);
      } else {
        toAdd.push({ userId, date: dateStr });
      }
    });

    if (toAdd.length > 0) {
      setOffDays((prev) => [...prev, ...toAdd]);
    }

    const warnings = [];
    if (conflicts.length > 0) {
      const conflictDates = conflicts.map((c) => `${c.dateStr} (${c.names})`).join(', ');
      warnings.push(`${conflicts.length} konflik: ${conflictDates}`);
    }
    if (quotaSkipped.length > 0) {
      const name = getUserNameById(userId);
      warnings.push(`${quotaSkipped.length} dilewati karena ${name} sudah mencapai batas ${MAX_OFF_PER_MONTH}x/bulan`);
    }

    if (warnings.length > 0) {
      toast(`⚠️ ${toAdd.length} hari ditambahkan. ${warnings.join('. ')}`, {
        duration: 6000,
        icon: '⚠️',
      });
    } else if (toAdd.length > 0) {
      toast.success(`${toAdd.length} hari ${HARI_FULL[dow]} ditambahkan sebagai hari libur`);
    } else if (remaining <= 0) {
      const name = getUserNameById(userId);
      toast.error(`${name} sudah mencapai batas maksimum ${MAX_OFF_PER_MONTH} hari libur bulan ini.`);
    }
  };

  /**
   * Cek apakah semua tanggal hari-dalam-minggu (dow) di bulan ini sudah libur untuk userId
   */
  const isDowFullyOn = (userId, dow) => {
    const dates = getDatesInMonth(year, month);
    const targetDates = dates.filter((d) => new Date(d).getUTCDay() === dow);
    return targetDates.length > 0 && targetDates.every((d) => isOff(userId, d));
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      await rotationService.saveManualOffDaysMonth(monthStr, offDays);
      toast.success('Hari libur berhasil disimpan');
    } catch (err) {
      toast.error('Gagal menyimpan: ' + (err.response?.data?.message || err.message));
    } finally {
      setLoading(false);
    }
  };

  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  };

  const calendarGrid = buildCalendarGrid(year, month);
  const dates = getDatesInMonth(year, month);
  const displayRoster = focusUser ? roster.filter((r) => r.userId === focusUser) : roster;

  return (
    <div className="space-y-4">
      {/* ─── Header navigasi ─── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <button onClick={prevMonth} className="p-1.5 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300">◀</button>
          <span className="px-3 py-1.5 font-medium text-gray-800 dark:text-gray-100 min-w-[140px] text-center">
            {BULAN_NAMES[month - 1]} {year}
          </span>
          <button onClick={nextMonth} className="p-1.5 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300">▶</button>
        </div>

        <select
          value={focusUser ?? ''}
          onChange={(e) => setFocusUser(e.target.value ? Number(e.target.value) : null)}
          className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
        >
          <option value="">Semua Pegawai</option>
          {roster.map((r) => (
            <option key={r.userId} value={r.userId}>{getUserName(r)}</option>
          ))}
        </select>

        {fetching && <span className="text-xs text-gray-500 dark:text-gray-400">Memuat...</span>}

        <div className="ml-auto text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded px-2 py-1">
          ⚠️ 1 hari/pegawai per bulan (hari sama setiap minggu)
        </div>
      </div>

      {roster.length === 0 ? (
        <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg text-sm text-gray-500">
          Belum ada anggota roster.
        </div>
      ) : (
        <>
          {/* ─── MODE: 1 pegawai — kalender + quick-assign ─── */}
          {focusUser ? (
            <div className="space-y-3">
              {/* Info pegawai + kuota + hari terkunci */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                  {getUserName(displayRoster[0])}
                </span>
                {(() => {
                  const cnt = offCount(focusUser);
                  const full = cnt >= MAX_OFF_PER_MONTH;
                  const lockedDow = getLockedDow(offDays, focusUser);
                  return (
                    <>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        full
                          ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'
                          : 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'
                      }`}>
                        {cnt}/{MAX_OFF_PER_MONTH} libur {full ? '(penuh)' : 'bulan ini'}
                      </span>
                      {lockedDow !== null && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                          🔒 Hari tetap: {HARI_FULL[lockedDow]}
                        </span>
                      )}
                    </>
                  );
                })()}
              </div>

              {/* Quick-assign per hari dalam seminggu */}
              <div className="p-3 bg-gray-50 dark:bg-gray-700/40 border border-gray-200 dark:border-gray-600 rounded-lg">
                <p className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-2">
                  Atur cepat — centang hari libur tetap per minggu:
                </p>
                <div className="flex flex-wrap gap-2">
                  {HARI.map((h, dow) => {
                    const isSunday = dow === 0;
                    const active = isDowFullyOn(focusUser, dow);
                    const lockedDow = getLockedDow(offDays, focusUser);
                    const isLockedForUser = lockedDow !== null && lockedDow !== dow;
                    const isDisabled = isSunday || isLockedForUser;
                    const count = dates.filter((d) => new Date(d).getUTCDay() === dow).length;
                    return (
                      <button
                        key={dow}
                        onClick={() => !isSunday && applyDayOfWeek(focusUser, dow, !active)}
                        disabled={isDisabled}
                        className={`
                          flex flex-col items-center px-3 py-2 rounded-lg border text-xs font-medium transition select-none
                          ${isSunday
                            ? 'bg-gray-200 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-400 dark:text-gray-600 cursor-not-allowed opacity-60'
                            : active
                              ? 'bg-red-100 dark:bg-red-900/40 border-red-300 dark:border-red-700 text-red-700 dark:text-red-300'
                              : isLockedForUser
                                ? 'bg-gray-100 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-300 dark:text-gray-600 cursor-not-allowed opacity-50'
                                : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-400'
                          }
                        `}
                        title={
                          isSunday
                            ? 'Minggu — tidak bisa dijadikan hari libur'
                            : isLockedForUser
                              ? `Pegawai ini sudah terkunci di hari ${HARI_FULL[lockedDow]}`
                              : `${active ? 'Hapus' : 'Tandai'} semua ${HARI_FULL[dow]} sebagai libur (${count} tanggal)`
                        }
                      >
                        <span>{h}</span>
                        <span className="text-[10px] opacity-60">×{count}</span>
                        {isSunday && <span className="text-[10px] leading-none">🚫</span>}
                        {!isSunday && active && <span className="text-[10px] leading-none">🏖️</span>}
                        {!isSunday && isLockedForUser && <span className="text-[10px] leading-none">🔒</span>}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1.5">
                  Merah = semua hari ini sudah libur. 🔒 = tidak bisa dipilih (hari berbeda dari hari tetap).
                </p>
              </div>

              {/* Kalender grid */}
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="grid grid-cols-7 border-b border-gray-200 dark:border-gray-700">
                  {HARI.map((h) => (
                    <div key={h} className="text-center text-xs font-medium text-gray-500 dark:text-gray-400 py-2">{h}</div>
                  ))}
                </div>
                {calendarGrid.map((week, wi) => (
                  <div key={wi} className="grid grid-cols-7">
                    {week.map((dateStr, di) => {
                      if (!dateStr) return <div key={di} className="min-h-[44px] bg-gray-50 dark:bg-gray-900/30" />;
                      const off = isOff(focusUser, dateStr);
                      const day = parseInt(dateStr.split('-')[2]);
                      const today = new Date().toISOString().split('T')[0];
                      const isToday = dateStr === today;
                      const thisDow = new Date(dateStr).getUTCDay();
                      const isSundayCell = thisDow === 0;
                      const lockedDow = getLockedDow(offDays, focusUser);
                      const othersOff = whoIsOffOn(offDays, dateStr).filter((id) => id !== focusUser);
                      const blockedByOther = !off && othersOff.length > 0;
                      const blockedByDow = !off && lockedDow !== null && lockedDow !== thisDow;
                      const blocked = isSundayCell || blockedByOther || blockedByDow;
                      return (
                        <button
                          key={di}
                          onClick={() => !isSundayCell && toggleOffDay(focusUser, dateStr)}
                          disabled={blocked}
                          title={
                            isSundayCell
                              ? 'Minggu — tidak bisa libur'
                              : blockedByOther
                                ? `${othersOff.map(getUserNameById).join(', ')} libur di hari ini`
                                : blockedByDow
                                  ? `Hari tetap libur adalah ${HARI_FULL[lockedDow]}, tidak bisa pilih ${HARI_FULL[thisDow]}`
                                  : ''
                          }
                          className={`
                            min-h-[44px] p-1 text-sm font-medium transition flex flex-col items-center justify-center gap-0.5
                            border-t border-l border-gray-100 dark:border-gray-700
                            ${isSundayCell ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-600 cursor-not-allowed' : ''}
                            ${!isSundayCell && off ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 hover:bg-red-200' : ''}
                            ${!isSundayCell && blocked ? 'bg-gray-100 dark:bg-gray-700/50 text-gray-300 dark:text-gray-600 cursor-not-allowed' : ''}
                            ${!off && !blocked ? 'hover:bg-blue-50 dark:hover:bg-blue-900/20 text-gray-700 dark:text-gray-200' : ''}
                            ${isToday ? 'ring-2 ring-inset ring-blue-500' : ''}
                          `}
                        >
                          <span>{day}</span>
                          {isSundayCell && <span className="text-[10px] leading-none">🚫</span>}
                          {!isSundayCell && off && <span className="text-xs leading-none">🏖️</span>}
                          {!isSundayCell && blocked && <span className="text-[10px] leading-none opacity-50">🔒</span>}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400">
                Klik tanggal untuk toggle. 🔒 = tidak tersedia (pegawai lain / hari berbeda dari hari tetap).
              </p>
            </div>
          ) : (
            /* ─── MODE: Semua pegawai — tabel scroll ─── */
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                Pilih pegawai di dropdown untuk tampilan kalender + atur cepat per hari. Atau edit langsung di tabel:
              </p>
              <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                <table className="text-xs min-w-max w-full">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-700/50">
                      <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300 sticky left-0 bg-gray-50 dark:bg-gray-700/50 z-10 min-w-[120px]">Pegawai</th>
                      <th className="px-2 py-2 text-center font-medium text-gray-500 dark:text-gray-400 min-w-[60px]">Hari<br/><span className="text-[9px] font-normal">tetap</span></th>
                      <th className="px-2 py-2 text-center font-medium text-gray-500 dark:text-gray-400 min-w-[50px]">Libur<br/><span className="text-[9px] font-normal">maks {MAX_OFF_PER_MONTH}x</span></th>
                      {dates.map((dateStr) => {
                        const day = parseInt(dateStr.split('-')[2]);
                        const dow = new Date(dateStr).getUTCDay();
                        const isSunday = dow === 0;
                        const isSaturday = dow === 6;
                        const isWeekend = isSunday || isSaturday;
                        const occupiedBy = whoIsOffOn(offDays, dateStr);
                        const occupiedNames = occupiedBy.map(getUserNameById);
                        return (
                          <th
                            key={dateStr}
                            className={`px-1 py-1 text-center min-w-[36px] select-none
                              ${isSunday ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-600' : ''}
                              ${isSaturday && !isSunday ? 'bg-amber-50 dark:bg-amber-900/10 text-amber-700 dark:text-amber-400' : ''}
                              ${!isWeekend ? 'text-gray-500 dark:text-gray-400' : ''}
                              ${occupiedBy.length > 0 && !isSunday ? 'bg-red-50 dark:bg-red-900/10' : ''}
                            `}
                            title={isSunday ? 'Minggu — tidak bisa libur' : occupiedBy.length > 0 ? `Libur: ${occupiedNames.join(', ')}` : dateStr}
                          >
                            <div className="font-medium">{day}</div>
                            <div className="text-[10px]">{HARI[dow]}</div>
                            {isSunday && <div className="text-[9px] opacity-50">🚫</div>}
                            {occupiedBy.length > 0 && !isSunday && (
                              <div className="text-[9px] text-red-500 dark:text-red-400 leading-tight font-medium truncate max-w-[32px]" title={occupiedNames.join(', ')}>
                                {occupiedNames.map(n => n.split(' ')[0]).join(',')}
                              </div>
                            )}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {displayRoster.map((r) => {
                      const lockedDow = getLockedDow(offDays, r.userId);
                      return (
                        <tr key={r.userId} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                          <td
                            className="px-3 py-2 font-medium text-gray-700 dark:text-gray-200 sticky left-0 bg-white dark:bg-gray-800 z-10 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400"
                            onClick={() => setFocusUser(r.userId)}
                            title="Klik untuk tampilan kalender + atur cepat"
                          >
                            {getUserName(r)}
                          </td>
                          <td className="px-2 py-2 text-center text-gray-500 dark:text-gray-400">
                            {lockedDow !== null
                              ? <span className="text-blue-600 dark:text-blue-400 font-medium">{HARI[lockedDow]}</span>
                              : <span className="text-gray-300 dark:text-gray-600">–</span>
                            }
                          </td>
                          <td className={`px-2 py-2 text-center font-medium ${
                            offCount(r.userId) >= MAX_OFF_PER_MONTH
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-gray-500 dark:text-gray-400'
                          }`}>
                            {offCount(r.userId)}{offCount(r.userId) >= MAX_OFF_PER_MONTH ? '🔴' : ''}
                          </td>
                          {dates.map((dateStr) => {
                            const off = isOff(r.userId, dateStr);
                            const dow = new Date(dateStr).getUTCDay();
                            const isSunday = dow === 0;
                            const isSaturday = dow === 6;
                            const othersOff = whoIsOffOn(offDays, dateStr).filter((id) => id !== r.userId);
                            const blockedByOther = !off && othersOff.length > 0;
                            const blockedByDow = !off && lockedDow !== null && lockedDow !== dow;
                            const blocked = isSunday || blockedByOther || blockedByDow;
                            return (
                              <td
                                key={dateStr}
                                className={`px-1 py-2 text-center select-none
                                  ${isSunday ? 'bg-gray-200 dark:bg-gray-700 cursor-not-allowed' : ''}
                                  ${isSaturday && !off && !blocked ? 'bg-amber-50/50 dark:bg-amber-900/5' : ''}
                                  ${off ? 'bg-red-100 dark:bg-red-900/30 cursor-pointer' : ''}
                                  ${!isSunday && blocked ? 'bg-gray-100 dark:bg-gray-700/40 cursor-not-allowed' : ''}
                                  ${!off && !blocked ? 'cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/10' : ''}
                                `}
                                onClick={() => !blocked && toggleOffDay(r.userId, dateStr)}
                                title={
                                  isSunday
                                    ? 'Minggu — tidak bisa libur'
                                    : blockedByOther
                                      ? `${othersOff.map(getUserNameById).join(', ')} sudah libur`
                                      : blockedByDow
                                        ? `Hari tetap libur ${getUserName(r)} adalah ${HARI_FULL[lockedDow]}`
                                        : `${getUserName(r)} - ${dateStr}`
                                }
                              >
                                {isSunday ? (
                                  <span className="text-gray-400 dark:text-gray-600 text-[10px]">🚫</span>
                                ) : off ? (
                                  <span className="text-red-500 dark:text-red-400">✓</span>
                                ) : blocked ? (
                                  <span className="text-gray-300 dark:text-gray-600 text-[10px]">🔒</span>
                                ) : (
                                  <span className="text-gray-200 dark:text-gray-700">·</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                🔒 = tidak tersedia (dipakai pegawai lain / hari berbeda dari hari tetap). Klik nama pegawai untuk atur cepat.
              </p>
            </div>
          )}

          {/* Summary */}
          {offDays.length > 0 && (
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-xs text-blue-700 dark:text-blue-300">
              Total {offDays.length} hari libur untuk {BULAN_NAMES[month - 1]} {year}
              {roster.length > 1 && (
                <span className="ml-2 text-blue-500 dark:text-blue-400">
                  · {roster.map((r) => {
                    const c = offCount(r.userId);
                    const ldow = getLockedDow(offDays, r.userId);
                    return c > 0 ? `${getUserName(r)}: ${c}x ${ldow !== null ? HARI_FULL[ldow] : ''}` : null;
                  }).filter(Boolean).join(', ')}
                </span>
              )}
            </div>
          )}

          {/* Tombol aksi */}
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
            >
              {loading ? 'Menyimpan...' : 'Simpan Hari Libur'}
            </button>
            <button
              onClick={fetchOffDays}
              disabled={fetching}
              className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 text-sm"
            >
              Reset
            </button>
          </div>
        </>
      )}
    </div>
  );
}
