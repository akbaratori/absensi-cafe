import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { LoadingSpinner } from '../../components/shared/Loading';

const DAY_NAMES = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];

// Return the Monday of the current week
function getMondayOfCurrentWeek() {
  const today = new Date();
  const day = today.getDay(); // 0=Sun, 1=Mon...
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(today);
  monday.setDate(today.getDate() + diff);
  return monday.toISOString().split('T')[0];
}

// Build array of 7 date labels from weekStart
function buildDateLabels(weekStart) {
  const start = new Date(weekStart);
  return DAY_NAMES.map((name, i) => {
    const d = new Date(start.getTime() + i * 86400000);
    return {
      name,
      label: d.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' }),
      date: d.toISOString().split('T')[0],
    };
  });
}

export default function FullSchedulePage() {
  const [weekStart, setWeekStart] = useState(getMondayOfCurrentWeek);
  const [data, setData] = useState([]); // [{position, schedule}]
  const [loading, setLoading] = useState(false);
  const [dateLabels, setDateLabels] = useState([]);

  const fetchSchedule = useCallback(async (ws) => {
    setLoading(true);
    try {
      const res = await api.get('/rotation/all-schedules', { params: { weekStart: ws } });
      setData(res.data.data || []);
      setDateLabels(buildDateLabels(ws));
    } catch (err) {
      toast.error('Gagal memuat jadwal: ' + (err.response?.data?.message || err.message));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSchedule(weekStart);
  }, [fetchSchedule, weekStart]);

  const prevWeek = () => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() - 7);
    setWeekStart(d.toISOString().split('T')[0]);
  };

  const nextWeek = () => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 7);
    setWeekStart(d.toISOString().split('T')[0]);
  };

  // Get users assigned on a specific date + shift for a position's schedule
  const getUsersOnDay = (schedule, dayDate, shiftNumber) => {
    if (!schedule?.schedules) return [];
    return schedule.schedules
      .filter((s) => {
        const sd = new Date(s.date || s.scheduleDate);
        const dd = new Date(dayDate);
        return (
          sd.toISOString().split('T')[0] === dayDate &&
          s.shiftNumber === shiftNumber
        );
      })
      .map((s) => s.user?.name || s.user?.fullName || `User ${s.userId}`);
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
            onChange={(e) => setWeekStart(e.target.value)}
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
                        <th className="px-3 py-2 text-left w-32">Shift</th>
                        {dateLabels.map((dl) => (
                          <th key={dl.date} className="px-3 py-2 text-left whitespace-nowrap">
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
                          const names = getUsersOnDay(schedule, dl.date, 1);
                          return (
                            <td key={dl.date} className="px-3 py-2 text-gray-600 dark:text-gray-300">
                              {names.length > 0 ? (
                                <ul className="space-y-0.5">
                                  {names.map((n, i) => (
                                    <li key={i} className="whitespace-nowrap">{n}</li>
                                  ))}
                                </ul>
                              ) : (
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
                          const names = getUsersOnDay(schedule, dl.date, 2);
                          return (
                            <td key={dl.date} className="px-3 py-2 text-gray-600 dark:text-gray-300">
                              {names.length > 0 ? (
                                <ul className="space-y-0.5">
                                  {names.map((n, i) => (
                                    <li key={i} className="whitespace-nowrap">{n}</li>
                                  ))}
                                </ul>
                              ) : (
                                <span className="text-gray-400 text-xs">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
