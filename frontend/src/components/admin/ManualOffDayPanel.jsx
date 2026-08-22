import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import rotationService from '../../services/rotationService';

const HARI = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const BULAN_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

/** Kembalikan semua tanggal dalam satu bulan sebagai array string YYYY-MM-DD */
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

/** Bangun grid kalender: array 6 minggu x 7 hari, null untuk hari di luar bulan */
function buildCalendarGrid(year, month) {
  // month: 1-based
  const firstDay = new Date(Date.UTC(year, month - 1, 1)).getUTCDay(); // 0=Sun
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const grid = [];
  let week = [];

  // Padding awal
  for (let i = 0; i < firstDay; i++) week.push(null);

  for (let d = 1; d <= daysInMonth; d++) {
    const mm = String(month).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    week.push(`${year}-${mm}-${dd}`);
    if (week.length === 7) {
      grid.push(week);
      week = [];
    }
  }

  // Padding akhir
  if (week.length > 0) {
    while (week.length < 7) week.push(null);
    grid.push(week);
  }

  return grid;
}

export default function ManualOffDayPanel({ roster }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-based
  const [offDays, setOffDays] = useState([]); // [{ userId, date: "YYYY-MM-DD" }]
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  // Per-user view: null = tampilkan semua, userId = fokus satu user
  const [focusUser, setFocusUser] = useState(null);

  const monthStr = `${year}-${String(month).padStart(2, '0')}`;

  useEffect(() => {
    fetchOffDays();
  }, [year, month]);

  const fetchOffDays = async () => {
    setFetching(true);
    try {
      const res = await rotationService.getManualOffDaysMonth(monthStr);
      const raw = res.data?.data || [];
      // Normalize date to YYYY-MM-DD string
      setOffDays(
        raw.map((item) => ({
          userId: item.userId,
          date: new Date(item.date).toISOString().split('T')[0],
        }))
      );
    } catch (err) {
      toast.error('Gagal memuat data libur: ' + (err.response?.data?.message || err.message));
    } finally {
      setFetching(false);
    }
  };

  const isOff = (userId, dateStr) =>
    offDays.some((o) => o.userId === userId && o.date === dateStr);

  const toggleOffDay = (userId, dateStr) => {
    if (isOff(userId, dateStr)) {
      setOffDays((prev) => prev.filter((o) => !(o.userId === userId && o.date === dateStr)));
    } else {
      setOffDays((prev) => [...prev, { userId, date: dateStr }]);
    }
  };

  // Toggle semua tanggal dalam satu kolom (tanggal) untuk semua user
  const toggleDateAllUsers = (dateStr) => {
    const visibleRoster = focusUser ? roster.filter((r) => r.userId === focusUser) : roster;
    const allOff = visibleRoster.every((r) => isOff(r.userId, dateStr));
    if (allOff) {
      setOffDays((prev) =>
        prev.filter((o) => !(visibleRoster.some((r) => r.userId === o.userId) && o.date === dateStr))
      );
    } else {
      const toAdd = visibleRoster
        .filter((r) => !isOff(r.userId, dateStr))
        .map((r) => ({ userId: r.userId, date: dateStr }));
      setOffDays((prev) => [...prev, ...toAdd]);
    }
  };

  // Toggle semua tanggal dalam bulan untuk satu user
  const toggleUserAllDates = (userId) => {
    const dates = getDatesInMonth(year, month);
    const allOff = dates.every((d) => isOff(userId, d));
    if (allOff) {
      setOffDays((prev) => prev.filter((o) => !(o.userId === userId)));
    } else {
      const existing = new Set(offDays.filter((o) => o.userId === userId).map((o) => o.date));
      const toAdd = dates.filter((d) => !existing.has(d)).map((d) => ({ userId, date: d }));
      setOffDays((prev) => [...prev, ...toAdd]);
    }
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

  const getUserName = (r) =>
    r.user?.fullName || r.user?.name || r.fullName || `User ${r.userId}`;

  const offCount = (userId) => offDays.filter((o) => o.userId === userId).length;

  return (
    <div className="space-y-4">
      {/* Header: navigasi bulan + pilih pegawai */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <button
            onClick={prevMonth}
            className="p-1.5 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
          >
            ◀
          </button>
          <span className="px-3 py-1.5 font-medium text-gray-800 dark:text-gray-100 min-w-[140px] text-center">
            {BULAN_NAMES[month - 1]} {year}
          </span>
          <button
            onClick={nextMonth}
            className="p-1.5 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
          >
            ▶
          </button>
        </div>

        <select
          value={focusUser ?? ''}
          onChange={(e) => setFocusUser(e.target.value ? Number(e.target.value) : null)}
          className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
        >
          <option value="">Semua Pegawai</option>
          {roster.map((r) => (
            <option key={r.userId} value={r.userId}>
              {getUserName(r)}
            </option>
          ))}
        </select>

        {fetching && (
          <span className="text-xs text-gray-500 dark:text-gray-400">Memuat...</span>
        )}
      </div>

      {roster.length === 0 ? (
        <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg text-sm text-gray-500">
          Belum ada anggota roster.
        </div>
      ) : (
        <>
          {/* MODE: Satu pegawai — tampilkan kalender visual */}
          {focusUser ? (
            <div>
              <div className="mb-2 flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                  {getUserName(displayRoster[0])}
                </span>
                <span className="text-xs text-gray-500">
                  {offCount(focusUser)} hari libur dipilih
                </span>
                <button
                  onClick={() => toggleUserAllDates(focusUser)}
                  className="text-xs px-2 py-1 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 ml-auto"
                >
                  Toggle Semua
                </button>
              </div>
              {/* Kalender grid */}
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="grid grid-cols-7 border-b border-gray-200 dark:border-gray-700">
                  {HARI.map((h) => (
                    <div key={h} className="text-center text-xs font-medium text-gray-500 dark:text-gray-400 py-2">
                      {h}
                    </div>
                  ))}
                </div>
                {calendarGrid.map((week, wi) => (
                  <div key={wi} className="grid grid-cols-7">
                    {week.map((dateStr, di) => {
                      if (!dateStr) {
                        return <div key={di} className="p-2 min-h-[44px] bg-gray-50 dark:bg-gray-900/30" />;
                      }
                      const off = isOff(focusUser, dateStr);
                      const day = parseInt(dateStr.split('-')[2]);
                      const today = new Date().toISOString().split('T')[0];
                      const isToday = dateStr === today;
                      return (
                        <button
                          key={di}
                          onClick={() => toggleOffDay(focusUser, dateStr)}
                          className={`
                            min-h-[44px] p-1 text-sm font-medium transition flex flex-col items-center justify-center gap-0.5
                            border-t border-l border-gray-100 dark:border-gray-700
                            ${off
                              ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/60'
                              : 'hover:bg-blue-50 dark:hover:bg-blue-900/20 text-gray-700 dark:text-gray-200'
                            }
                            ${isToday ? 'ring-2 ring-inset ring-blue-500' : ''}
                          `}
                        >
                          <span>{day}</span>
                          {off && <span className="text-xs leading-none">🏖️</span>}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Klik tanggal untuk toggle libur. Merah = hari libur.
              </p>
            </div>
          ) : (
            /* MODE: Semua pegawai — tabel scroll horizontal */
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                Pilih pegawai spesifik di dropdown untuk tampilan kalender, atau gunakan tabel di bawah untuk edit cepat semua pegawai sekaligus.
              </p>
              <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                <table className="text-xs min-w-max w-full">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-700/50">
                      <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300 sticky left-0 bg-gray-50 dark:bg-gray-700/50 z-10 min-w-[120px]">
                        Pegawai
                      </th>
                      <th className="px-2 py-2 text-center font-medium text-gray-500 dark:text-gray-400 min-w-[40px]">
                        Jml
                      </th>
                      {dates.map((dateStr) => {
                        const day = parseInt(dateStr.split('-')[2]);
                        const dow = new Date(dateStr).getUTCDay();
                        const isWeekend = dow === 0 || dow === 6;
                        return (
                          <th
                            key={dateStr}
                            className={`px-1 py-1 text-center min-w-[30px] cursor-pointer select-none
                              ${isWeekend ? 'bg-amber-50 dark:bg-amber-900/10 text-amber-700 dark:text-amber-400' : 'text-gray-500 dark:text-gray-400'}
                            `}
                            onClick={() => toggleDateAllUsers(dateStr)}
                            title={`Toggle libur ${dateStr} untuk semua`}
                          >
                            <div className="font-medium">{day}</div>
                            <div className="text-gray-400 dark:text-gray-500 text-[10px]">{HARI[dow]}</div>
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
                          title="Klik untuk lihat kalender pegawai ini"
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
                          return (
                            <td
                              key={dateStr}
                              className={`px-1 py-2 text-center cursor-pointer select-none
                                ${isWeekend ? 'bg-amber-50/50 dark:bg-amber-900/5' : ''}
                                ${off ? 'bg-red-100 dark:bg-red-900/30' : 'hover:bg-blue-50 dark:hover:bg-blue-900/10'}
                              `}
                              onClick={() => toggleOffDay(r.userId, dateStr)}
                              title={`${getUserName(r)} - ${dateStr}`}
                            >
                              {off ? (
                                <span className="text-red-500 dark:text-red-400">✓</span>
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
                Klik sel untuk toggle libur. Klik header tanggal untuk toggle semua pegawai. Klik nama pegawai untuk tampilan kalender.
              </p>
            </div>
          )}

          {/* Summary */}
          {offDays.length > 0 && (
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-xs text-blue-700 dark:text-blue-300">
              Total {offDays.length} hari libur dipilih untuk bulan {BULAN_NAMES[month - 1]} {year}
            </div>
          )}

          {/* Tombol Simpan */}
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
