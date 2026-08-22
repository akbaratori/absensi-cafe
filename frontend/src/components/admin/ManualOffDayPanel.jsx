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
  const offCount = (userId) => offDays.filter((o) => o.userId === userId).length;

  /**
   * Toggle satu tanggal untuk satu pegawai.
   * Aturan: max 1 pegawai libur per hari.
   */
  const toggleOffDay = (userId, dateStr) => {
    if (isOff(userId, dateStr)) {
      // Hapus libur
      setOffDays((prev) => prev.filter((o) => !(o.userId === userId && o.date === dateStr)));
      return;
    }
    // Cek apakah sudah ada pegawai lain libur di hari ini
    const othersOff = whoIsOffOn(offDays, dateStr).filter((id) => id !== userId);
    if (othersOff.length > 0) {
      const names = othersOff.map(getUserNameById).join(', ');
      toast.error(`${names} sudah libur di tanggal ini. Hanya 1 pegawai boleh libur per hari.`);
      return;
    }
    setOffDays((prev) => [...prev, { userId, date: dateStr }]);
  };

  /**
   * Bulk assign: set semua tanggal hari-dalam-minggu tertentu (dow 0-6) libur untuk userId.
   * Cek konflik di setiap tanggal — skip tanggal yang sudah diisi pegawai lain.
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

    // Tambah libur, tapi skip tanggal yang sudah dipakai orang lain
    const conflicts = [];
    const toAdd = [];
    targetDates.forEach((dateStr) => {
      if (isOff(userId, dateStr)) return; // sudah libur, skip
      const others = whoIsOffOn(offDays, dateStr).filter((id) => id !== userId);
      if (others.length > 0) {
        conflicts.push({ dateStr, names: others.map(getUserNameById).join(', ') });
      } else {
        toAdd.push({ userId, date: dateStr });
      }
    });

    if (toAdd.length > 0) {
      setOffDays((prev) => [...prev, ...toAdd]);
    }
    if (conflicts.length > 0) {
      const conflictDates = conflicts.map((c) => `${c.dateStr} (${c.names})`).join(', ');
      toast(`⚠️ ${toAdd.length} hari ditambahkan. Dilewati ${conflicts.length} tanggal karena konflik: ${conflictDates}`, {
        duration: 5000,
        icon: '⚠️',
      });
    } else if (toAdd.length > 0) {
      toast.success(`${toAdd.length} hari ${HARI_FULL[dow]} ditambahkan sebagai hari libur`);
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
          ⚠️ Maks. 1 pegawai libur per hari
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
              {/* Info pegawai */}
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                  {getUserName(displayRoster[0])}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {offCount(focusUser)} hari libur
                </span>
              </div>

              {/* Quick-assign per hari dalam seminggu */}
              <div className="p-3 bg-gray-50 dark:bg-gray-700/40 border border-gray-200 dark:border-gray-600 rounded-lg">
                <p className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-2">
                  Atur cepat — centang hari untuk libur setiap minggu:
                </p>
                <div className="flex flex-wrap gap-2">
                  {HARI.map((h, dow) => {
                    const active = isDowFullyOn(focusUser, dow);
                    // Hitung berapa tanggal hari itu ada di bulan ini
                    const count = dates.filter((d) => new Date(d).getUTCDay() === dow).length;
                    return (
                      <button
                        key={dow}
                        onClick={() => applyDayOfWeek(focusUser, dow, !active)}
                        className={`
                          flex flex-col items-center px-3 py-2 rounded-lg border text-xs font-medium transition select-none
                          ${active
                            ? 'bg-red-100 dark:bg-red-900/40 border-red-300 dark:border-red-700 text-red-700 dark:text-red-300'
                            : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-400'
                          }
                        `}
                        title={`${active ? 'Hapus' : 'Tandai'} semua ${HARI_FULL[dow]} sebagai libur (${count} tanggal)`}
                      >
                        <span>{h}</span>
                        <span className="text-[10px] opacity-60">×{count}</span>
                        {active && <span className="text-[10px] leading-none">🏖️</span>}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1.5">
                  Merah = semua {'{hari}'} di bulan ini sudah libur. Klik untuk toggle.
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
                      // Siapa pegawai lain yang libur di hari ini?
                      const othersOff = whoIsOffOn(offDays, dateStr).filter((id) => id !== focusUser);
                      const blocked = !off && othersOff.length > 0;
                      return (
                        <button
                          key={di}
                          onClick={() => toggleOffDay(focusUser, dateStr)}
                          disabled={blocked}
                          title={blocked ? `${othersOff.map(getUserNameById).join(', ')} libur di hari ini` : ''}
                          className={`
                            min-h-[44px] p-1 text-sm font-medium transition flex flex-col items-center justify-center gap-0.5
                            border-t border-l border-gray-100 dark:border-gray-700
                            ${off ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 hover:bg-red-200' : ''}
                            ${blocked ? 'bg-gray-100 dark:bg-gray-700/50 text-gray-300 dark:text-gray-600 cursor-not-allowed' : ''}
                            ${!off && !blocked ? 'hover:bg-blue-50 dark:hover:bg-blue-900/20 text-gray-700 dark:text-gray-200' : ''}
                            ${isToday ? 'ring-2 ring-inset ring-blue-500' : ''}
                          `}
                        >
                          <span>{day}</span>
                          {off && <span className="text-xs leading-none">🏖️</span>}
                          {blocked && <span className="text-[10px] leading-none opacity-50">🔒</span>}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400">
                Klik tanggal untuk toggle. 🔒 = sudah dipakai pegawai lain.
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
                      <th className="px-2 py-2 text-center font-medium text-gray-500 dark:text-gray-400 min-w-[40px]">Jml</th>
                      {dates.map((dateStr) => {
                        const day = parseInt(dateStr.split('-')[2]);
                        const dow = new Date(dateStr).getUTCDay();
                        const isWeekend = dow === 0 || dow === 6;
                        const occupiedBy = whoIsOffOn(offDays, dateStr);
                        return (
                          <th
                            key={dateStr}
                            className={`px-1 py-1 text-center min-w-[30px] select-none
                              ${isWeekend ? 'bg-amber-50 dark:bg-amber-900/10 text-amber-700 dark:text-amber-400' : 'text-gray-500 dark:text-gray-400'}
                              ${occupiedBy.length > 0 ? 'bg-red-50 dark:bg-red-900/10' : ''}
                            `}
                            title={occupiedBy.length > 0 ? `Libur: ${occupiedBy.map(getUserNameById).join(', ')}` : `${dateStr}`}
                          >
                            <div className="font-medium">{day}</div>
                            <div className="text-[10px]">{HARI[dow]}</div>
                            {occupiedBy.length > 0 && <div className="text-[9px] text-red-400">●</div>}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {displayRoster.map((r) => (
                      <tr key={r.userId} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                        <td
                          className="px-3 py-2 font-medium text-gray-700 dark:text-gray-200 sticky left-0 bg-white dark:bg-gray-800 z-10 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400"
                          onClick={() => setFocusUser(r.userId)}
                          title="Klik untuk tampilan kalender + atur cepat"
                        >
                          {getUserName(r)}
                        </td>
                        <td className="px-2 py-2 text-center text-gray-500 dark:text-gray-400 font-medium">
                          {offCount(r.userId)}
                        </td>
                        {dates.map((dateStr) => {
                          const off = isOff(r.userId, dateStr);
                          const dow = new Date(dateStr).getUTCDay();
                          const isWeekend = dow === 0 || dow === 6;
                          const othersOff = whoIsOffOn(offDays, dateStr).filter((id) => id !== r.userId);
                          const blocked = !off && othersOff.length > 0;
                          return (
                            <td
                              key={dateStr}
                              className={`px-1 py-2 text-center select-none
                                ${isWeekend && !off && !blocked ? 'bg-amber-50/50 dark:bg-amber-900/5' : ''}
                                ${off ? 'bg-red-100 dark:bg-red-900/30 cursor-pointer' : ''}
                                ${blocked ? 'bg-gray-100 dark:bg-gray-700/40 cursor-not-allowed' : ''}
                                ${!off && !blocked ? 'cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/10' : ''}
                              `}
                              onClick={() => !blocked && toggleOffDay(r.userId, dateStr)}
                              title={blocked ? `${othersOff.map(getUserNameById).join(', ')} sudah libur` : `${getUserName(r)} - ${dateStr}`}
                            >
                              {off ? (
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
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                🔒 = tanggal sudah dipakai pegawai lain. Klik nama pegawai untuk atur cepat per hari.
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
                    return c > 0 ? `${getUserName(r)}: ${c}` : null;
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
