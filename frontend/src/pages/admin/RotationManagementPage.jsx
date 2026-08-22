import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import rotationService from '../../services/rotationService';
import { getUsers } from '../../services/adminService';
import { LoadingSpinner } from '../../components/shared/Loading';
import ManualOffDayPanel from '../../components/admin/ManualOffDayPanel';

// ─── Jobdesk Kitchen Panel ────────────────────────────────────────────────────
const KITCHEN_JOBS = [
  { id: 'A', label: 'Pos A — Dapur Dalam', tasks: ['Lap-lap meja', 'Cuci lap'], icon: '🧹', color: 'bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700' },
  { id: 'B', label: 'Pos B — Dapur Dalam', tasks: ['Sapu lantai dapur', 'Pel lantai dapur', 'Cuci piring'], icon: '🫧', color: 'bg-emerald-100 dark:bg-emerald-900/30 border-emerald-300 dark:border-emerald-700' },
  { id: 'C', label: 'Pos C — Dapur Luar', tasks: ['Angkat & rapikan bangku', 'Sapu area luar', 'Pel area luar', 'Bersihkan WC'], icon: '🪑', color: 'bg-purple-100 dark:bg-purple-900/30 border-purple-300 dark:border-purple-700' },
];

const DAY_NAMES_SHORT = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

function JobdeskKitchenPanel({ roster, weekStart, setWeekStart }) {
  const names = roster.map((r) => r.user?.name || r.user?.fullName || `User ${r.userId}`).filter(Boolean);

  const weekDates = weekStart
    ? Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart);
        d.setDate(d.getDate() + i);
        return d;
      })
    : [];

  const buildRotation = () => {
    if (!names.length || !weekDates.length) return [];
    return weekDates.map((date, dayIdx) => {
      const rotated = names.map((_, i) => names[(i + dayIdx) % names.length]);
      return {
        date,
        label: `${DAY_NAMES_SHORT[dayIdx]}, ${date.getDate()}/${date.getMonth() + 1}`,
        assignments: KITCHEN_JOBS.map((job, jobIdx) => ({
          job,
          person: rotated[jobIdx] ?? '—',
        })),
        freeWorkers: rotated.slice(KITCHEN_JOBS.length),
      };
    });
  };

  const rotation = buildRotation();
  const today = new Date().toDateString();

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <label className="text-sm text-gray-600 dark:text-gray-300">Minggu:</label>
        <input
          type="date"
          value={weekStart}
          onChange={(e) => setWeekStart(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
        />
        {!weekStart && (
          <span className="text-xs text-yellow-600 dark:text-yellow-400">
            Pilih tanggal minggu untuk melihat rotasi.
          </span>
        )}
      </div>

      {names.length === 0 ? (
        <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg text-sm text-gray-500">
          Belum ada anggota roster.
        </div>
      ) : !weekStart ? null : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
            {KITCHEN_JOBS.map((job) => (
              <div key={job.id} className={`p-3 rounded-lg border ${job.color}`}>
                <div className="font-medium text-sm mb-1">{job.icon} {job.label}</div>
                <ul className="text-xs text-gray-600 dark:text-gray-300 space-y-0.5">
                  {job.tasks.map((t, i) => <li key={i}>• {t}</li>)}
                </ul>
              </div>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[480px]">
              <thead>
                <tr className="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-200">
                  <th className="px-3 py-2 text-left">Hari</th>
                  {KITCHEN_JOBS.map((j) => (
                    <th key={j.id} className="px-3 py-2 text-left">{j.icon} {j.id}</th>
                  ))}
                  {names.length > KITCHEN_JOBS.length && (
                    <th className="px-3 py-2 text-left text-green-600 dark:text-green-400">Bebas</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {rotation.map((day, i) => {
                  const isToday = day.date.toDateString() === today;
                  return (
                    <tr key={i} className={`border-t border-gray-100 dark:border-gray-700 ${isToday ? 'bg-yellow-50 dark:bg-yellow-900/20 font-medium' : ''}`}>
                      <td className="px-3 py-2 text-gray-700 dark:text-gray-200 whitespace-nowrap">
                        {day.label}{isToday ? ' ← Hari ini' : ''}
                      </td>
                      {day.assignments.map(({ job, person }) => (
                        <td key={job.id} className="px-3 py-2 text-gray-700 dark:text-gray-200">{person}</td>
                      ))}
                      {names.length > KITCHEN_JOBS.length && (
                        <td className="px-3 py-2 text-green-700 dark:text-green-400">
                          {day.freeWorkers.join(', ') || '—'}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-gray-400">
            Rotasi otomatis berdasarkan urutan roster. Urutan dapat diubah di "Atur Roster".
          </p>
        </>
      )}
    </div>
  );
}
// ─────────────────────────────────────────────────────────────────────────────

export default function RotationManagementPage() {
  const [positions, setPositions] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPosition, setSelectedPosition] = useState(null);
  const [roster, setRoster] = useState([]);
  const [schedule, setSchedule] = useState(null);
  const [weekStart, setWeekStart] = useState('');
  const [month, setMonth] = useState('');
  const [understaffed, setUnderstaffed] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newPosition, setNewPosition] = useState({ name: '', shift1Capacity: 2, shift2Capacity: 3 });
  const [rosterModal, setRosterModal] = useState(false);
  const [editModal, setEditModal] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', shift1Capacity: 2, shift2Capacity: 3 });
  const [detailTab, setDetailTab] = useState('schedule'); // 'schedule' | 'offday' | 'jobdesk'

  const fetchPositions = useCallback(async () => {
    try {
      const res = await rotationService.listPositions();
      setPositions(res.data?.data || res.data || []);
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.response?.data?.message || err.message;
      toast.error('Gagal memuat posisi: ' + msg);
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await getUsers({ limit: 200, status: 'active' });
      setUsers(res.data?.users || res.users || []);
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.response?.data?.message || err.message;
      toast.error('Gagal memuat user: ' + msg);
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([fetchPositions(), fetchUsers()]);
      setLoading(false);
    })();
  }, [fetchPositions, fetchUsers]);

  const openPosition = async (pos) => {
    setSelectedPosition(pos);
    setRoster(
      (pos.rosters || []).map((r, i) => ({
        ...r,
        shift: r.shiftNumber || (i < pos.shift1Capacity ? 1 : 2),
      }))
    );
    setSchedule(null);
    try {
      const res = await rotationService.getPosition(pos.id);
      setSelectedPosition(res.data.data);
      setRoster(
        (res.data.data.rosters || []).map((r, i) => ({
          ...r,
          shift: r.shiftNumber || (i < res.data.data.shift1Capacity ? 1 : 2),
        }))
      );
    } catch (err) {
      toast.error('Gagal memuat detail posisi');
    }
  };

  const handleDeletePosition = async (pos) => {
    if (!window.confirm(`Hapus posisi "${pos.name}"? Tindakan ini tidak dapat dibatalkan.`)) return;
    try {
      await rotationService.deletePosition(pos.id);
      toast.success(`Posisi "${pos.name}" berhasil dihapus`);
      if (selectedPosition?.id === pos.id) {
        setSelectedPosition(null);
        setRoster([]);
        setSchedule(null);
      }
      fetchPositions();
    } catch (err) {
      toast.error('Gagal menghapus posisi: ' + (err.response?.data?.message || err.message));
    }
  };

  const openEditModal = (pos) => {
    setEditForm({
      name: pos.name,
      shift1Capacity: pos.shift1Capacity,
      shift2Capacity: pos.shift2Capacity,
    });
    setEditModal(pos);
  };

  const handleEditPosition = async (e) => {
    e.preventDefault();
    try {
      await rotationService.updatePosition(editModal.id, {
        name: editForm.name,
        shift1Capacity: Number(editForm.shift1Capacity),
        shift2Capacity: Number(editForm.shift2Capacity),
      });
      toast.success('Posisi berhasil diperbarui');
      setEditModal(false);
      fetchPositions();
      if (selectedPosition?.id === editModal.id) {
        openPosition({ ...editModal, ...editForm, shift1Capacity: Number(editForm.shift1Capacity), shift2Capacity: Number(editForm.shift2Capacity) });
      }
    } catch (err) {
      toast.error('Gagal memperbarui posisi: ' + (err.response?.data?.message || err.message));
    }
  };

  const handleCreatePosition = async (e) => {
    e.preventDefault();
    try {
      await rotationService.createPosition({
        name: newPosition.name,
        shift1Capacity: Number(newPosition.shift1Capacity),
        shift2Capacity: Number(newPosition.shift2Capacity),
      });
      toast.success('Posisi berhasil dibuat');
      setShowCreateModal(false);
      setNewPosition({ name: '', shift1Capacity: 2, shift2Capacity: 3 });
      fetchPositions();
    } catch (err) {
      toast.error('Gagal membuat posisi: ' + (err.response?.data?.message || err.message));
    }
  };

  const buildDays = (data) => {
    const list = data?.schedules || [];
    const shift1 = list.filter((s) => s.shiftNumber === 1).map((s) => s.user).filter(Boolean);
    const shift2 = list.filter((s) => s.shiftNumber === 2).map((s) => s.user).filter(Boolean);
    const names = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
    const start = data?.weekStart ? new Date(data.weekStart) : null;
    return names.map((name, i) => {
      const d = start ? new Date(start.getTime() + i * 86400000) : null;
      const dateLabel = d
        ? d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short' })
        : name;
      return { date: dateLabel, shift1, shift2 };
    });
  };

  const handleGenerateWeek = async () => {
    if (!weekStart) return toast.error('Pilih minggu terlebih dahulu');
    try {
      const res = await rotationService.generateWeek(selectedPosition.id, weekStart);
      toast.success(res.data.message || 'Jadwal minggu berhasil dibuat');
      const schedRes = await rotationService.getSchedule(selectedPosition.id, weekStart);
      setSchedule(buildDays(schedRes.data.data));
    } catch (err) {
      toast.error('Gagal generate jadwal: ' + (err.response?.data?.error?.message || err.response?.data?.message || err.message));
    }
  };

  const handleGenerateMonth = async () => {
    if (!month) return toast.error('Pilih bulan terlebih dahulu');
    if (!selectedPosition) return toast.error('Pilih posisi terlebih dahulu');
    try {
      const res = await rotationService.generateMonth(selectedPosition.id, month);
      const data = res.data.data || {};
      setUnderstaffed(data.understaffed || []);
      toast.success(
        data.understaffed?.length
          ? `Jadwal bulan dibuat, tapi ada ${data.understaffed.length} kekurangan staff`
          : 'Jadwal bulan berhasil dibuat'
      );
      if (weekStart) {
        const schedRes = await rotationService.getSchedule(selectedPosition.id, weekStart);
        setSchedule(buildDays(schedRes.data.data));
      }
    } catch (err) {
      toast.error('Gagal generate bulan: ' + (err.response?.data?.error?.message || err.response?.data?.message || err.message));
    }
  };

  const handleLoadSchedule = async () => {
    if (!weekStart) return toast.error('Pilih minggu terlebih dahulu');
    try {
      const res = await rotationService.getSchedule(selectedPosition.id, weekStart);
      setSchedule(buildDays(res.data.data));
    } catch (err) {
      toast.error('Gagal memuat jadwal: ' + (err.response?.data?.message || err.message));
    }
  };

  const handleSaveRoster = async () => {
    try {
      const sorted = [...roster].sort((a, b) => (a.shift || 1) - (b.shift || 1));
      const payload = sorted.map((r) => ({ userId: r.userId, shiftNumber: r.shift || 1 }));
      await rotationService.setRoster(selectedPosition.id, payload);
      toast.success('Roster berhasil disimpan');
      setRosterModal(false);
      openPosition(selectedPosition);
    } catch (err) {
      toast.error('Gagal menyimpan roster: ' + (err.response?.data?.message || err.message));
    }
  };

  const addToRoster = (user) => {
    if (roster.find((r) => r.userId === user.id)) return toast.error('User sudah ada di roster');
    const shift = roster.filter((r) => r.shift === 1).length < selectedPosition.shift1Capacity ? 1 : 2;
    setRoster([...roster, { userId: user.id, user, shift }]);
  };

  const removeFromRoster = (userId) => {
    setRoster(roster.filter((r) => r.userId !== userId));
  };

  const clearRoster = () => {
    setRoster([]);
  };

  const setShift = (userId, shift) => {
    setRoster(roster.map((r) => (r.userId === userId ? { ...r, shift } : r)));
  };

  const moveRoster = (idx, dir) => {
    const next = [...roster];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setRoster(next);
  };

if (loading) return <LoadingSpinner />;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">
          Manajemen Posisi & Rotasi
        </h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
        >
          + Buat Posisi
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Daftar Posisi */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-4">
          <h2 className="font-semibold text-gray-700 dark:text-gray-200 mb-3">Daftar Posisi</h2>
          {positions.length === 0 ? (
            <p className="text-gray-500 text-sm">Belum ada posisi. Buat posisi baru.</p>
          ) : (
            <ul className="space-y-2">
              {positions.map((pos) => (
                <li key={pos.id} className="flex items-stretch gap-1">
                  <button
                    onClick={() => openPosition(pos)}
                    className={`flex-1 text-left px-3 py-2 rounded-lg border transition ${
                      selectedPosition?.id === pos.id
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                        : 'border-gray-200 dark:border-gray-700 hover:border-blue-300'
                    }`}
                  >
                    <div className="font-medium text-gray-800 dark:text-gray-100">{pos.name}</div>
                    <div className="text-xs text-gray-500">
                      Shift 1: {pos.shift1Capacity} · Shift 2: {pos.shift2Capacity}
                    </div>
                  </button>
                  <button
                    onClick={() => openEditModal(pos)}
                    title="Edit posisi"
                    className="px-2 py-1 text-blue-500 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg border border-gray-200 dark:border-gray-700 text-sm"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => handleDeletePosition(pos)}
                    title="Hapus posisi"
                    className="px-2 py-1 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg border border-gray-200 dark:border-gray-700 text-sm"
                  >
                    🗑️
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Detail Posisi */}
        <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-xl shadow p-4">
          {!selectedPosition ? (
            <p className="text-gray-500 text-sm">Pilih posisi untuk melihat detail.</p>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
                  {selectedPosition.name}
                </h2>
                <button
                  onClick={() => setRosterModal(true)}
                  className="px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
                >
                  Atur Roster
                </button>
              </div>

              {/* Tab Navigation */}
              <div className="flex gap-1 mb-4 border-b border-gray-200 dark:border-gray-700">
                {[
                  { key: 'schedule', label: '📅 Jadwal' },
                  { key: 'offday', label: '🏖️ Libur Manual' },
                  { key: 'jobdesk', label: '🍳 Jobdesk Kitchen' },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setDetailTab(tab.key)}
                    className={`px-3 py-2 text-sm font-medium border-b-2 transition -mb-px ${
                      detailTab === tab.key
                        ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                        : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Roster */}
              <div className="mb-4">
                <h3 className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-2">
                  Anggota Roster ({roster.length})
                </h3>
                {roster.length === 0 ? (
                  <p className="text-gray-400 text-sm">Belum ada anggota.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {roster.map((r, idx) => (
                      <span
                        key={r.userId}
                        className="inline-flex items-center gap-1 px-3 py-1 bg-gray-100 dark:bg-gray-700 rounded-full text-sm"
                      >
                        {idx + 1}. {r.user?.name || r.user?.fullName || `User ${r.userId}`}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* ─── TAB: Libur Manual ─── */}
              {detailTab === 'offday' && (
                <div>
                  {!weekStart ? (
                    <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg text-sm text-yellow-700 dark:text-yellow-300">
                      Pilih tanggal minggu di tab Jadwal terlebih dahulu untuk menggunakan fitur ini.
                    </div>
                  ) : roster.length === 0 ? (
                    <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg text-sm text-gray-500">
                      Belum ada anggota roster. Atur roster terlebih dahulu.
                    </div>
                  ) : (
                    <ManualOffDayPanel weekStart={weekStart} roster={roster} />
                  )}
                </div>
              )}

              {/* ─── TAB: Jobdesk Kitchen ─── */}
              {detailTab === 'jobdesk' && (
                <JobdeskKitchenPanel
                  roster={roster}
                  weekStart={weekStart}
                  setWeekStart={setWeekStart}
                />
              )}

              {/* ─── TAB: Jadwal ─── */}
              {detailTab === 'schedule' && (
              <>
              {/* Generate Jadwal */}
              <div className="border-t pt-4">
                <h3 className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-2">
                  Generate Jadwal Mingguan
                </h3>
                <div className="flex flex-wrap gap-2 items-center">
                  <input
                    type="date"
                    value={weekStart}
                    onChange={(e) => setWeekStart(e.target.value)}
                    className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
                  />
                  <button
                    onClick={handleGenerateWeek}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                  >
                    Generate
                  </button>
                  <button
                    onClick={handleLoadSchedule}
                    className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 text-sm"
                  >
                    Lihat Jadwal
                  </button>
                </div>
              </div>

              {/* Generate Bulanan */}
              <div className="border-t pt-4 mt-4">
                <h3 className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-2">
                  Generate Jadwal Bulanan
                </h3>
                <div className="flex flex-wrap gap-2 items-center">
                  <input
                    type="month"
                    value={month}
                    onChange={(e) => setMonth(e.target.value)}
                    className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
                  />
                  <button
                    onClick={handleGenerateMonth}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm"
                  >
                    Generate Bulan
                  </button>
                </div>
                {understaffed.length > 0 && (
                  <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <p className="text-sm font-medium text-red-700 dark:text-red-300 mb-2">
                      Peringatan kekurangan staff ({understaffed.length} shift):
                    </p>
                    <ul className="text-xs text-red-600 dark:text-red-400 space-y-1">
                      {understaffed.map((u, i) => (
                        <li key={i}>
                          {u.date} - Shift {u.shiftNumber}: kurang {u.missing} orang
                          {u.offUsers?.length > 0 && (
                            <span className="text-gray-500"> (libur: {u.offUsers.map((id) => id).join(', ')})</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Jadwal */}
              {schedule && (
                <div className="border-t mt-4 pt-4 overflow-x-auto">
                  <h3 className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-2">
                    Jadwal Minggu {weekStart}
                  </h3>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-200">
                        <th className="px-3 py-2 text-left">Hari</th>
                        <th className="px-3 py-2 text-left">Shift 1</th>
                        <th className="px-3 py-2 text-left">Shift 2</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.isArray(schedule) ? (
                        schedule.map((day, i) => (
                          <tr key={i} className="border-t border-gray-100 dark:border-gray-700">
                            <td className="px-3 py-2 text-gray-700 dark:text-gray-200">
                              {day.date || day.day || `Hari ${i + 1}`}
                            </td>
                            <td className="px-3 py-2 text-gray-600 dark:text-gray-300">
                              {day.shift1?.map((u) => u.name || u.fullName || u).join(', ') || '-'}
                            </td>
                            <td className="px-3 py-2 text-gray-600 dark:text-gray-300">
                              {day.shift2?.map((u) => u.name || u.fullName || u).join(', ') || '-'}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={3} className="px-3 py-2 text-gray-500">
                            {JSON.stringify(schedule).slice(0, 200)}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
              </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Modal Buat Posisi */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-4 text-gray-800 dark:text-gray-100">
              Buat Posisi Baru
            </h2>
            <form onSubmit={handleCreatePosition} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">
                  Nama Posisi
                </label>
                <input
                  type="text"
                  required
                  value={newPosition.name}
                  onChange={(e) => setNewPosition({ ...newPosition, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
                  placeholder="Contoh: Kasir"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">
                    Kapasitas Shift 1
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={newPosition.shift1Capacity}
                    onChange={(e) =>
                      setNewPosition({ ...newPosition, shift1Capacity: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">
                    Kapasitas Shift 2
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={newPosition.shift2Capacity}
                    onChange={(e) =>
                      setNewPosition({ ...newPosition, shift2Capacity: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg text-sm"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
                >
                  Simpan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Edit Posisi */}
      {editModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-4 text-gray-800 dark:text-gray-100">
              Edit Posisi: {editModal.name}
            </h2>
            <form onSubmit={handleEditPosition} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">
                  Nama Posisi
                </label>
                <input
                  type="text"
                  required
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">
                    Kapasitas Shift 1
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={editForm.shift1Capacity}
                    onChange={(e) => setEditForm({ ...editForm, shift1Capacity: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">
                    Kapasitas Shift 2
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={editForm.shift2Capacity}
                    onChange={(e) => setEditForm({ ...editForm, shift2Capacity: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditModal(false)}
                  className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg text-sm"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
                >
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Atur Roster */}
      {rosterModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-4 text-gray-800 dark:text-gray-100">
              Atur Roster - {selectedPosition?.name}
            </h2>
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-gray-600 dark:text-gray-300">
                  Anggota saat ini
                </h3>
                {roster.length > 0 && (
                  <button
                    onClick={clearRoster}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    Hapus Semua
                  </button>
                )}
              </div>
              {roster.length === 0 ? (
                <p className="text-gray-400 text-sm">Kosong</p>
              ) : (
                <ul className="space-y-1">
                  {roster.map((r, idx) => (
                    <li
                      key={r.userId}
                      className="flex items-center justify-between bg-gray-50 dark:bg-gray-700 rounded px-3 py-2"
                    >
                      <span className="text-sm text-gray-700 dark:text-gray-200">
                        {idx + 1}. {r.user?.name || r.user?.fullName || `User ${r.userId}`}
                      </span>
                      <div className="flex items-center gap-1">
                        <select
                          value={r.shift || 1}
                          onChange={(e) => setShift(r.userId, Number(e.target.value))}
                          title="Pilih shift"
                          className="text-xs border border-gray-300 dark:border-gray-600 rounded px-1 py-0.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200"
                        >
                          <option value={1}>Shift 1</option>
                          <option value={2}>Shift 2</option>
                        </select>
                        <button
                          onClick={() => moveRoster(idx, -1)}
                          disabled={idx === 0}
                          title="Naikkan urutan"
                          className="px-2 py-1 text-gray-500 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          ↑
                        </button>
                        <button
                          onClick={() => moveRoster(idx, 1)}
                          disabled={idx === roster.length - 1}
                          title="Turunkan urutan"
                          className="px-2 py-1 text-gray-500 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          ↓
                        </button>
                        <button
                          onClick={() => removeFromRoster(r.userId)}
                          className="text-red-500 hover:text-red-700 text-sm ml-2"
                        >
                          Hapus
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-2">
                Tambah user
              </h3>
              <select
                defaultValue=""
                onChange={(e) => {
                  const uid = Number(e.target.value);
                  const user = users.find((u) => u.id === uid);
                  if (user) addToRoster(user);
                  e.target.value = '';
                }}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
              >
                <option value="" disabled>
                  Pilih user...
                </option>
                {users
                  .filter((u) => u.role !== 'ADMIN')
                  .map((u) => {
                    const inRoster = roster.some((r) => r.userId === u.id);
                    return (
                      <option key={u.id} value={u.id} disabled={inRoster}>
                        {u.name || u.fullName || u.email} ({u.role}){inRoster ? ' ✓ Sudah di roster' : ''}
                      </option>
                    );
                  })}
              </select>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setRosterModal(false)}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg text-sm"
              >
                Batal
              </button>
              <button
                onClick={handleSaveRoster}
                className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700"
              >
                Simpan Roster
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}