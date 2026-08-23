import { useState, useEffect, useMemo } from 'react';
import rotationService from '../../services/rotationService';
import BackupPanel from '../../components/admin/BackupPanel';

function LoadingSpinner() {
  return (
    <div className="flex justify-center items-center py-16">
      <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

/** Hitung Monday (UTC) dari tanggal mana saja */
function getMondayISO(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const day = d.getUTCDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().split('T')[0];
}

/** Format Date ke YYYY-MM-DD */
function toISO(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Untuk satu posisi + weekStart, kembalikan daftar staff per shift DENGAN info off-day per tanggal.
 * offDaySet: Set<"userId_YYYY-MM-DD"> — user yang libur pada tanggal tersebut.
 *
 * Returns: { working: [{name, userId}], offDay: [{name, userId}] }
 */
function getUsersOnDayWithOffDay(schedule, dateISO, shiftNum, offDaySet) {
  if (!schedule || !schedule.schedules?.length) return { working: [], offDay: [] };

  const all = schedule.schedules
    .filter(s => s.shiftNumber === shiftNum)
    .map(s => ({ name: s.user?.fullName || `User #${s.userId}`, userId: s.userId }));

  const working = all.filter(u => !offDaySet.has(`${u.userId}_${dateISO}`));
  const offDay = all.filter(u => offDaySet.has(`${u.userId}_${dateISO}`));

  return { working, offDay };
}

export default function FullSchedulePage() {
  const [weekStart, setWeekStart] = useState(() => {
    const today = new Date().toISOString().split('T')[0];
    return getMondayISO(today);
  });
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Manual off-days: Set<"userId_YYYY-MM-DD">
  const [offDaySet, setOffDaySet] = useState(new Set());

  // Backup panel state
  const [backupDate, setBackupDate] = useState(null);
  const [showBackupPanel, setShowBackupPanel] = useState(false);

  // Bulan dari weekStart (untuk fetch off-days)
  const monthStr = useMemo(() => {
    const d = new Date(`${weekStart}T00:00:00Z`);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  }, [weekStart]);

  useEffect(() => {
    fetchAll();
  }, [weekStart]);

  useEffect(() => {
    fetchOffDays();
  }, [monthStr]);

  const fetchAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await rotationService.getAllSchedules(weekStart);
      setData(res.data.data || []);
    } catch (err) {
      setError(err?.response?.data?.message || 'Gagal memuat jadwal');
    } finally {
      setLoading(false);
    }
  };

  const fetchOffDays = async () => {
    try {
      const res = await rotationService.getManualOffDaysMonth(monthStr);
      const raw = res.data?.data || [];
      const set = new Set();
      raw.forEach(item => {
        const dateISO = new Date(item.date).toISOString().split('T')[0];
        set.add(`${item.userId}_${dateISO}`);
      });
      setOffDaySet(set);
    } catch {
      // Non-critical — tampilkan jadwal meski off-day gagal dimuat
      setOffDaySet(new Set());
    }
  };

  const prevWeek = () => {
    const d = new Date(`${weekStart}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 7);
    setWeekStart(toISO(d));
  };

  const nextWeek = () => {
    const d = new Date(`${weekStart}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 7);
    setWeekStart(toISO(d));
  };

  // Buat 7 tanggal dalam minggu ini
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(`${weekStart}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    return toISO(d);
  });

  const dateLabels = weekDates.map(dateISO => {
    const d = new Date(`${dateISO}T00:00:00Z`);
    return {
      date: dateISO,
      label: d.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }),
      isToday: dateISO === new Date().toISOString().split('T')[0],
    };
  });

  // Ambil semua posisi dari data untuk BackupPanel
  const allPositions = data.map(d => d.position).filter(Boolean);

  const openBackupPanel = (dateISO) => {
    setBackupDate(dateISO);
    setShowBackupPanel(true);
  };

  return (
    <div className="p-4 md:p-6 max-w-full">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">
          Jadwal Lengkap Semua Posisi
        </h1>
        <div className="flex items-center gap-2">
          <button
            onClick={prevWeek}
            className="px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 text-sm"
          >
            ← Minggu Lalu
          </button>
          <input
            type="date"
            value={weekStart}
            onChange={(e) => setWeekStart(getMondayISO(e.target.value))}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
          />
          <button
            onClick={nextWeek}
            className="px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 text-sm"
          >
            Minggu Depan →
          </button>
        </div>
      </div>

      {/* Info baris tanggal dengan tombol backup */}
      {!loading && data.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-3 mb-5 overflow-x-auto">
          <div className="flex gap-2 min-w-max">
            <div className="w-28 flex-shrink-0 text-xs font-semibold text-gray-500 dark:text-gray-400 flex items-center">
              Kelola Backup
            </div>
            {dateLabels.map(dl => (
              <button
                key={dl.date}
                onClick={() => openBackupPanel(dl.date)}
                className={`flex-1 min-w-[90px] text-xs px-2 py-1.5 rounded-lg border transition-colors ${
                  dl.isToday
                    ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-semibold'
                    : 'border-gray-200 dark:border-gray-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-gray-600 dark:text-gray-300'
                }`}
              >
                <div>{dl.label}</div>
                <div className="text-blue-500 mt-0.5">+ Backup</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-300 rounded-lg p-4 mb-4 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <LoadingSpinner />
      ) : data.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <p className="text-lg mb-2">Belum ada posisi yang dibuat</p>
          <p className="text-sm">Buat posisi di halaman Posisi & Rotasi terlebih dahulu.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {data.map(({ position, schedule }) => (
            <div key={position.id} className="bg-white dark:bg-gray-800 rounded-xl shadow overflow-hidden">
              {/* Position header */}
              <div className="px-4 py-3 bg-blue-600 text-white flex items-center justify-between">
                <h2 className="font-semibold text-base">{position.name}</h2>
                <span className="text-xs opacity-80">
                  Shift 1: {position.shift1Capacity} orang · Shift 2: {position.shift2Capacity} orang
                </span>
              </div>

              {!schedule || !schedule.schedules?.length ? (
                <div className="px-4 py-6 text-center text-gray-400 text-sm">
                  Jadwal belum di-generate untuk minggu ini.{' '}
                  <a href="/admin/rotation" className="text-blue-500 hover:underline">
                    Generate di Posisi & Rotasi
                  </a>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[700px]">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                        <th className="px-3 py-2 text-left w-24">Shift</th>
                        {dateLabels.map((dl) => (
                          <th
                            key={dl.date}
                            className={`px-3 py-2 text-left whitespace-nowrap ${
                              dl.isToday ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' : ''
                            }`}
                          >
                            {dl.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {/* Shift 1 row */}
                      <tr className="border-t border-gray-100 dark:border-gray-700">
                        <td className="px-3 py-2 font-medium text-gray-700 dark:text-gray-200 bg-blue-50 dark:bg-blue-900/20 whitespace-nowrap">
                          Shift 1
                        </td>
                        {dateLabels.map((dl) => {
                          const { working, offDay } = getUsersOnDayWithOffDay(schedule, dl.date, 1, offDaySet);
                          return (
                            <td
                              key={dl.date}
                              className={`px-3 py-2 align-top ${
                                dl.isToday ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''
                              }`}
                            >
                              {working.length > 0 && (
                                <ul className="space-y-0.5 mb-1">
                                  {working.map((u, i) => (
                                    <li key={i} className="whitespace-nowrap text-gray-600 dark:text-gray-300">{u.name}</li>
                                  ))}
                                </ul>
                              )}
                              {offDay.length > 0 && (
                                <ul className="space-y-0.5">
                                  {offDay.map((u, i) => (
                                    <li key={i} className="whitespace-nowrap text-orange-500 dark:text-orange-400 text-xs line-through">
                                      🏖️ {u.name}
                                    </li>
                                  ))}
                                </ul>
                              )}
                              {working.length === 0 && offDay.length === 0 && (
                                <span className="text-gray-400 text-xs">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                      {/* Shift 2 row */}
                      <tr className="border-t border-gray-100 dark:border-gray-700">
                        <td className="px-3 py-2 font-medium text-gray-700 dark:text-gray-200 bg-indigo-50 dark:bg-indigo-900/20 whitespace-nowrap">
                          Shift 2
                        </td>
                        {dateLabels.map((dl) => {
                          const { working, offDay } = getUsersOnDayWithOffDay(schedule, dl.date, 2, offDaySet);
                          return (
                            <td
                              key={dl.date}
                              className={`px-3 py-2 align-top ${
                                dl.isToday ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''
                              }`}
                            >
                              {working.length > 0 && (
                                <ul className="space-y-0.5 mb-1">
                                  {working.map((u, i) => (
                                    <li key={i} className="whitespace-nowrap text-gray-600 dark:text-gray-300">{u.name}</li>
                                  ))}
                                </ul>
                              )}
                              {offDay.length > 0 && (
                                <ul className="space-y-0.5">
                                  {offDay.map((u, i) => (
                                    <li key={i} className="whitespace-nowrap text-orange-500 dark:text-orange-400 text-xs line-through">
                                      🏖️ {u.name}
                                    </li>
                                  ))}
                                </ul>
                              )}
                              {working.length === 0 && offDay.length === 0 && (
                                <span className="text-gray-400 text-xs">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>

                      {/* Row: Libur hari ini (lintas shift) */}
                      {weekDates.some(dateISO => {
                        const allUsers = (schedule.schedules || []).map(s => s.userId);
                        return allUsers.some(uid => offDaySet.has(`${uid}_${dateISO}`));
                      }) && (
                        <tr className="border-t border-orange-100 dark:border-orange-900/30 bg-orange-50/30 dark:bg-orange-900/10">
                          <td className="px-3 py-2 font-medium text-orange-600 dark:text-orange-400 whitespace-nowrap text-xs">
                            🏖️ Libur
                          </td>
                          {dateLabels.map((dl) => {
                            const offUsers = (schedule.schedules || [])
                              .filter(s => offDaySet.has(`${s.userId}_${dl.date}`))
                              .map(s => s.user?.fullName || `User #${s.userId}`);
                            return (
                              <td key={dl.date} className={`px-3 py-2 text-xs ${dl.isToday ? 'bg-blue-50/30 dark:bg-blue-900/5' : ''}`}>
                                {offUsers.length > 0 ? (
                                  <ul className="space-y-0.5">
                                    {offUsers.map((n, i) => (
                                      <li key={i} className="text-orange-600 dark:text-orange-400 whitespace-nowrap">{n}</li>
                                    ))}
                                  </ul>
                                ) : (
                                  <span className="text-gray-300 dark:text-gray-700">—</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Backup Panel Modal */}
      {showBackupPanel && backupDate && (
        <BackupPanel
          date={backupDate}
          positions={allPositions}
          onClose={() => {
            setShowBackupPanel(false);
            setBackupDate(null);
          }}
        />
      )}
    </div>
  );
}
