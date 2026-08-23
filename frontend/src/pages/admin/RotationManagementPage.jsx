import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import rotationService from '../../services/rotationService';
import { getUsers } from '../../services/adminService';
import { LoadingSpinner } from '../../components/shared/Loading';
import ManualOffDayPanel from '../../components/admin/ManualOffDayPanel';

// ─── Helper ───────────────────────────────────────────────────────────────────
const getUserName = (u) => u?.name || u?.fullName || u?.username || `User ${u?.id || '?'}`;

function getDaysInMonth(year, month) {
  // month: 1-based
  const result = [];
  const days = new Date(year, month, 0).getDate();
  for (let d = 1; d <= days; d++) {
    const str = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    result.push(str);
  }
  return result;
}

// ─── Step Indicator ───────────────────────────────────────────────────────────
const STEPS = [
  { no: 1, icon: '🏗️', label: 'Buat Posisi' },
  { no: 2, icon: '👥', label: 'Atur Roster' },
  { no: 3, icon: '🏖️', label: 'Atur Libur' },
  { no: 4, icon: '📅', label: 'Generate Jadwal' },
  { no: 5, icon: '🔴', label: 'Tangani Kekurangan' },
];

function StepIndicator({ currentStep }) {
  return (
    <div className="flex items-center gap-0 mb-6 overflow-x-auto pb-1">
      {STEPS.map((s, i) => (
        <div key={s.no} className="flex items-center min-w-0">
          <div className={`flex flex-col items-center px-3 py-2 rounded-xl border-2 transition-all min-w-[80px] ${
            s.no === currentStep
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
              : s.no < currentStep
              ? 'border-green-400 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
              : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-400 dark:text-gray-500'
          }`}>
            <span className="text-lg">{s.no < currentStep ? '✅' : s.icon}</span>
            <span className="text-xs font-medium text-center leading-tight mt-0.5 whitespace-nowrap">{s.label}</span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={`h-0.5 w-6 flex-shrink-0 ${s.no < currentStep ? 'bg-green-400' : 'bg-gray-200 dark:bg-gray-700'}`} />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Monthly Calendar with understaffed highlights ────────────────────────────
function MonthCalendar({ month, understaffed, roster, users, positionId, onAssignBackup }) {
  if (!month) return null;
  const [y, m] = month.split('-').map(Number);
  const days = getDaysInMonth(y, m);
  const firstDow = new Date(y, m - 1, 1).getDay(); // 0=Sun
  const understaffedMap = {};
  for (const u of (understaffed || [])) {
    if (!understaffedMap[u.date]) understaffedMap[u.date] = [];
    understaffedMap[u.date].push(u);
  }

  // Build calendar grid (Mon-first)
  // Shift so Monday=0
  const offset = (firstDow + 6) % 7;
  const cells = Array(offset).fill(null).concat(days);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const today = new Date().toISOString().split('T')[0];

  const nameMap = {};
  for (const r of (roster || [])) {
    if (r.user) nameMap[r.userId] = getUserName(r.user);
  }
  for (const u of (users || [])) nameMap[u.id] = getUserName(u);
  const resolveName = (id) => nameMap[id] || `#${id}`;

  return (
    <div>
      <div className="grid grid-cols-7 mb-1">
        {['Sen','Sel','Rab','Kam','Jum','Sab','Min'].map((h) => (
          <div key={h} className="text-center text-xs font-medium text-gray-500 dark:text-gray-400 py-1">{h}</div>
        ))}
      </div>
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 border-b border-gray-100 dark:border-gray-800 last:border-0">
            {week.map((dateStr, di) => {
              if (!dateStr) return <div key={di} className="min-h-[60px] bg-gray-50 dark:bg-gray-900/20" />;
              const day = parseInt(dateStr.split('-')[2]);
              const dow = new Date(dateStr).getDay();
              const isWeekend = dow === 0 || dow === 6;
              const isToday = dateStr === today;
              const issues = understaffedMap[dateStr] || [];
              const hasIssue = issues.length > 0;

              return (
                <div
                  key={di}
                  className={`min-h-[60px] p-1.5 border-r border-gray-100 dark:border-gray-800 last:border-0 flex flex-col gap-0.5
                    ${isToday ? 'ring-2 ring-inset ring-blue-500' : ''}
                    ${hasIssue ? 'bg-red-50 dark:bg-red-900/20' : isWeekend ? 'bg-amber-50/50 dark:bg-amber-900/5' : 'bg-white dark:bg-gray-800'}
                  `}
                >
                  <span className={`text-xs font-semibold ${
                    isToday ? 'text-blue-600 dark:text-blue-400'
                    : hasIssue ? 'text-red-600 dark:text-red-400'
                    : isWeekend ? 'text-amber-600 dark:text-amber-400'
                    : 'text-gray-700 dark:text-gray-300'
                  }`}>{day}</span>
                  {issues.map((issue, ii) => (
                    <div key={ii} className="text-[9px] leading-tight text-red-600 dark:text-red-400 font-medium">
                      S{issue.shiftNumber} -{issue.missing}
                    </div>
                  ))}
                  {hasIssue && (
                    <button
                      onClick={() => onAssignBackup(dateStr, issues)}
                      className="mt-auto text-[9px] bg-red-100 dark:bg-red-900/40 hover:bg-red-200 dark:hover:bg-red-900/60 text-red-700 dark:text-red-300 rounded px-1 py-0.5 font-medium w-full text-center"
                    >
                      + Backup
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-4 mt-2 text-xs text-gray-500 dark:text-gray-400">
        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-red-100 dark:bg-red-900/40 rounded border border-red-200 dark:border-red-800 inline-block" /> Kekurangan staff</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-amber-50 dark:bg-amber-900/20 rounded border border-amber-200 dark:border-amber-800 inline-block" /> Akhir pekan</span>
        <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400">S1 = Shift 1, S2 = Shift 2, angka = kurang berapa orang</span>
      </div>
    </div>
  );
}

// ─── Backup Assign Modal ───────────────────────────────────────────────────────
function BackupModal({ date, issues, roster, users, positionId, onClose, onSaved }) {
  const [assignments, setAssignments] = useState({});
  const [saving, setSaving] = useState(false);

  const rosterIds = new Set((roster || []).map((r) => r.userId));
  const nameMap = {};
  for (const r of (roster || [])) {
    if (r.user) nameMap[r.userId] = getUserName(r.user);
  }
  for (const u of (users || [])) nameMap[u.id] = getUserName(u);
  const resolveName = (id) => nameMap[id] || `#${id}`;

  // Off users on this date (from issues)
  const offIds = new Set(issues.flatMap((i) => i.offUsers || []));

  // Candidates: all non-admin users not off on this date
  const candidates = (users || []).filter(
    (u) => u.role !== 'ADMIN' && !offIds.has(u.id)
  );

  const handleSave = async () => {
    const entries = Object.entries(assignments).filter(([, uid]) => uid);
    if (!entries.length) return toast.error('Pilih pegawai backup terlebih dahulu');
    setSaving(true);
    try {
      for (const [key, userId] of entries) {
        const shiftNumber = parseInt(key.replace('shift', ''));
        await rotationService.createBackup({
          date,
          userId: parseInt(userId),
          positionId,
          shiftNumber,
        });
      }
      toast.success('Backup berhasil disimpan');
      onSaved();
      onClose();
    } catch (err) {
      toast.error('Gagal simpan backup: ' + (err.response?.data?.message || err.message));
    } finally {
      setSaving(false);
    }
  };

  const fmt = (iso) => new Date(iso).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="font-semibold text-gray-800 dark:text-gray-100">Tugaskan Backup</h2>
            <p className="text-xs text-gray-500 mt-0.5">{fmt(date)}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl">✕</button>
        </div>
        <div className="px-5 py-4 space-y-4">
          {issues.map((issue) => (
            <div key={issue.shiftNumber} className="p-3 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-red-700 dark:text-red-300">
                  Shift {issue.shiftNumber} — Kurang {issue.missing} orang
                </span>
                {issue.offUsers?.length > 0 && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    Libur: {issue.offUsers.map(resolveName).join(', ')}
                  </span>
                )}
              </div>
              <select
                value={assignments[`shift${issue.shiftNumber}`] || ''}
                onChange={(e) => setAssignments({ ...assignments, [`shift${issue.shiftNumber}`]: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
              >
                <option value="">-- Pilih pegawai backup --</option>
                {candidates.map((u) => (
                  <option key={u.id} value={u.id}>
                    {getUserName(u)}{rosterIds.has(u.id) ? ' (roster)' : ' (luar posisi)'}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200 dark:border-gray-700">
          <button onClick={onClose} className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg text-sm hover:bg-gray-200 dark:hover:bg-gray-600">
            Batal
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 font-medium"
          >
            {saving ? 'Menyimpan...' : 'Simpan Backup'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function RotationManagementPage() {
  const [positions, setPositions] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPosition, setSelectedPosition] = useState(null);
  const [roster, setRoster] = useState([]);
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [understaffed, setUnderstaffed] = useState([]);
  const [generating, setGenerating] = useState(false);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newPosition, setNewPosition] = useState({ name: '', shift1Capacity: 2, shift2Capacity: 3 });
  const [rosterModal, setRosterModal] = useState(false);
  const [editModal, setEditModal] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', shift1Capacity: 2, shift2Capacity: 3 });
  const [backupModal, setBackupModal] = useState(null); // { date, issues }

  // Current step detection
  const currentStep = !positions.length ? 1
    : !selectedPosition ? 1
    : !roster.length ? 2
    : selectedPosition && roster.length ? (understaffed.length ? 5 : 4)
    : 3;

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
      const res = await getUsers({ limit: 200 });
      setUsers(res.data?.data?.users || res.data?.users || []);
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

  const openPosition = useCallback(async (pos) => {
    setSelectedPosition(pos);
    setUnderstaffed([]);
    setRoster(
      (pos.rosters || []).map((r, i) => ({
        ...r,
        shift: r.shiftNumber || (i < pos.shift1Capacity ? 1 : 2),
      }))
    );
    try {
      const res = await rotationService.getPosition(pos.id);
      setSelectedPosition(res.data.data);
      setRoster(
        (res.data.data.rosters || []).map((r, i) => ({
          ...r,
          shift: r.shiftNumber || (i < res.data.data.shift1Capacity ? 1 : 2),
        }))
      );
    } catch {
      toast.error('Gagal memuat detail posisi');
    }
  }, []);

  const handleCreatePosition = async (e) => {
    e.preventDefault();
    try {
      const res = await rotationService.createPosition({
        name: newPosition.name,
        shift1Capacity: Number(newPosition.shift1Capacity),
        shift2Capacity: Number(newPosition.shift2Capacity),
      });
      toast.success('Posisi berhasil dibuat');
      setShowCreateModal(false);
      setNewPosition({ name: '', shift1Capacity: 2, shift2Capacity: 3 });
      await fetchPositions();
      // Auto-select new position
      if (res.data?.data) openPosition(res.data.data);
    } catch (err) {
      toast.error('Gagal membuat posisi: ' + (err.response?.data?.message || err.message));
    }
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
      toast.error('Gagal memperbarui: ' + (err.response?.data?.message || err.message));
    }
  };

  const handleDeletePosition = async (pos) => {
    if (!window.confirm(`Hapus posisi "${pos.name}"?`)) return;
    try {
      await rotationService.deletePosition(pos.id);
      toast.success('Posisi dihapus');
      if (selectedPosition?.id === pos.id) { setSelectedPosition(null); setRoster([]); setUnderstaffed([]); }
      fetchPositions();
    } catch (err) {
      toast.error('Gagal hapus: ' + (err.response?.data?.message || err.message));
    }
  };

  const handleSaveRoster = async () => {
    try {
      const sorted = [...roster].sort((a, b) => (a.shift || 1) - (b.shift || 1));
      await rotationService.setRoster(selectedPosition.id, sorted.map((r) => ({ userId: r.userId, shiftNumber: r.shift || 1 })));
      toast.success('Roster berhasil disimpan');
      setRosterModal(false);
      openPosition(selectedPosition);
    } catch (err) {
      toast.error('Gagal simpan roster: ' + (err.response?.data?.message || err.message));
    }
  };

  const handleGenerateMonth = async () => {
    if (!month) return toast.error('Pilih bulan');
    if (!selectedPosition) return toast.error('Pilih posisi');
    setGenerating(true);
    try {
      const res = await rotationService.generateMonth(selectedPosition.id, month);
      const data = res.data.data || {};
      const us = data.understaffed || [];
      setUnderstaffed(us);
      if (us.length) {
        toast(`⚠️ Jadwal dibuat, tapi ada ${us.length} shift kekurangan staff`, { icon: '⚠️', duration: 5000 });
      } else {
        toast.success('Jadwal bulan berhasil dibuat, tidak ada kekurangan!');
      }
    } catch (err) {
      toast.error('Gagal generate: ' + (err.response?.data?.error?.message || err.response?.data?.message || err.message));
    } finally {
      setGenerating(false);
    }
  };

  const addToRoster = (user) => {
    if (roster.find((r) => r.userId === user.id)) return toast.error('User sudah ada di roster');
    const shift = roster.filter((r) => r.shift === 1).length < (selectedPosition?.shift1Capacity || 2) ? 1 : 2;
    setRoster([...roster, { userId: user.id, user, shift }]);
  };
  const removeFromRoster = (userId) => setRoster(roster.filter((r) => r.userId !== userId));
  const setShift = (userId, shift) => setRoster(roster.map((r) => r.userId === userId ? { ...r, shift } : r));
  const moveRoster = (idx, dir) => {
    const next = [...roster];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setRoster(next);
  };

  if (loading) return <LoadingSpinner />;

  const shift1Roster = roster.filter((r) => (r.shift || 1) === 1);
  const shift2Roster = roster.filter((r) => (r.shift || 1) === 2);

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      {/* ─── Header ─── */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">Manajemen Posisi & Rotasi</h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
        >
          + Buat Posisi
        </button>
      </div>

      {/* ─── Step Indicator ─── */}
      <StepIndicator currentStep={currentStep} />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* ─── Left: Daftar Posisi ─── */}
        <div className="lg:col-span-1">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-4 sticky top-4">
            <h2 className="font-semibold text-gray-700 dark:text-gray-200 mb-3 text-sm flex items-center gap-2">
              <span className="w-5 h-5 bg-blue-600 text-white text-xs rounded-full flex items-center justify-center font-bold">1</span>
              Pilih Posisi
            </h2>
            {positions.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-gray-400 text-sm mb-3">Belum ada posisi</p>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
                >
                  + Buat Posisi
                </button>
              </div>
            ) : (
              <ul className="space-y-1.5">
                {positions.map((pos) => (
                  <li key={pos.id}>
                    <button
                      onClick={() => openPosition(pos)}
                      className={`w-full text-left px-3 py-2.5 rounded-xl border-2 transition-all ${
                        selectedPosition?.id === pos.id
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                          : 'border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm text-gray-800 dark:text-gray-100">{pos.name}</span>
                        <div className="flex gap-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); setEditForm({ name: pos.name, shift1Capacity: pos.shift1Capacity, shift2Capacity: pos.shift2Capacity }); setEditModal(pos); }}
                            className="p-1 text-gray-400 hover:text-blue-500 rounded"
                          >✏️</button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeletePosition(pos); }}
                            className="p-1 text-gray-400 hover:text-red-500 rounded"
                          >🗑️</button>
                        </div>
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        S1: {pos.shift1Capacity} org · S2: {pos.shift2Capacity} org
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* ─── Right: Detail ─── */}
        <div className="lg:col-span-3 space-y-4">
          {!selectedPosition ? (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-10 text-center">
              <div className="text-5xl mb-3">🏗️</div>
              <p className="text-gray-500 dark:text-gray-400">Pilih atau buat posisi di kiri untuk memulai</p>
            </div>
          ) : (
            <>
              {/* ─── STEP 2: Roster ─── */}
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-semibold text-gray-700 dark:text-gray-200 text-sm flex items-center gap-2">
                    <span className="w-5 h-5 bg-green-600 text-white text-xs rounded-full flex items-center justify-center font-bold">2</span>
                    Roster — {selectedPosition.name}
                    <span className="text-xs font-normal text-gray-500">({roster.length} anggota)</span>
                  </h2>
                  <button
                    onClick={() => setRosterModal(true)}
                    className="px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 text-xs font-medium"
                  >
                    ✏️ Atur Roster
                  </button>
                </div>

                {roster.length === 0 ? (
                  <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-700 text-center">
                    <p className="text-amber-700 dark:text-amber-300 text-sm">Belum ada anggota roster. Klik "Atur Roster" untuk menambahkan pegawai.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700">
                      <div className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-2">
                        Shift 1 ({shift1Roster.length}/{selectedPosition.shift1Capacity} slot)
                      </div>
                      {shift1Roster.length === 0 ? (
                        <p className="text-xs text-gray-400">Kosong</p>
                      ) : shift1Roster.map((r, i) => (
                        <div key={r.userId} className="text-sm text-gray-700 dark:text-gray-200 py-0.5">
                          {i + 1}. {getUserName(r.user) || `User ${r.userId}`}
                        </div>
                      ))}
                    </div>
                    <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-700">
                      <div className="text-xs font-semibold text-purple-700 dark:text-purple-300 mb-2">
                        Shift 2 ({shift2Roster.length}/{selectedPosition.shift2Capacity} slot)
                      </div>
                      {shift2Roster.length === 0 ? (
                        <p className="text-xs text-gray-400">Kosong</p>
                      ) : shift2Roster.map((r, i) => (
                        <div key={r.userId} className="text-sm text-gray-700 dark:text-gray-200 py-0.5">
                          {i + 1}. {getUserName(r.user) || `User ${r.userId}`}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* ─── STEP 3: Libur Manual ─── */}
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-4">
                <h2 className="font-semibold text-gray-700 dark:text-gray-200 text-sm flex items-center gap-2 mb-1">
                  <span className="w-5 h-5 bg-orange-500 text-white text-xs rounded-full flex items-center justify-center font-bold">3</span>
                  Atur Hari Libur
                  <span className="text-xs font-normal text-gray-400">(maks. 4x/bulan per pegawai)</span>
                </h2>
                {roster.length === 0 ? (
                  <p className="text-xs text-gray-400 py-2">Isi roster terlebih dahulu (langkah 2)</p>
                ) : (
                  <ManualOffDayPanel roster={roster} />
                )}
              </div>

              {/* ─── STEP 4 & 5: Generate + Kalender ─── */}
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-semibold text-gray-700 dark:text-gray-200 text-sm flex items-center gap-2">
                    <span className="w-5 h-5 bg-indigo-600 text-white text-xs rounded-full flex items-center justify-center font-bold">4</span>
                    Generate Jadwal Bulanan
                  </h2>
                </div>

                <div className="flex flex-wrap items-end gap-3 mb-4">
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Bulan</label>
                    <input
                      type="month"
                      value={month}
                      onChange={(e) => setMonth(e.target.value)}
                      className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
                    />
                  </div>
                  <button
                    onClick={handleGenerateMonth}
                    disabled={generating || !roster.length}
                    className="px-5 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium disabled:opacity-50 flex items-center gap-2"
                  >
                    {generating ? <><span className="animate-spin">⟳</span> Memproses...</> : '📅 Generate Jadwal'}
                  </button>
                  {!roster.length && (
                    <span className="text-xs text-amber-600 dark:text-amber-400">⚠️ Isi roster dulu</span>
                  )}
                </div>

                {/* Calendar */}
                <MonthCalendar
                  month={month}
                  understaffed={understaffed}
                  roster={roster}
                  users={users}
                  positionId={selectedPosition.id}
                  onAssignBackup={(date, issues) => setBackupModal({ date, issues })}
                />

                {/* Understaffed summary */}
                {understaffed.length > 0 && (
                  <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-red-500 text-lg">⚠️</span>
                      <div>
                        <p className="text-sm font-semibold text-red-700 dark:text-red-300">
                          {understaffed.length} shift kekurangan staff
                        </p>
                        <p className="text-xs text-red-500 dark:text-red-400">
                          Klik tombol "+ Backup" pada tanggal merah di kalender untuk menugaskan pengganti
                        </p>
                      </div>
                    </div>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {understaffed.map((u, i) => {
                        const nameMap = {};
                        for (const r of roster) { if (r.user) nameMap[r.userId] = getUserName(r.user); }
                        for (const us of users) nameMap[us.id] = getUserName(us);
                        return (
                          <div key={i} className="flex items-center justify-between text-xs bg-white dark:bg-gray-800 rounded-lg px-3 py-1.5">
                            <span className="text-gray-700 dark:text-gray-300">
                              📅 {new Date(u.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} — Shift {u.shiftNumber}
                            </span>
                            <span className="text-red-600 dark:text-red-400 font-medium">-{u.missing} orang</span>
                            <button
                              onClick={() => setBackupModal({ date: u.date, issues: understaffed.filter((x) => x.date === u.date) })}
                              className="px-2 py-0.5 bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 rounded font-medium hover:bg-red-200 dark:hover:bg-red-900/60"
                            >
                              + Backup
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {understaffed.length === 0 && month && (
                  <div className="mt-3 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-700 text-sm text-green-700 dark:text-green-300">
                    ✅ Tidak ada kekurangan staff {understaffed !== null ? 'bulan ini.' : '— klik Generate untuk memeriksa.'}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ─── Modal Buat Posisi ─── */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-4 text-gray-800 dark:text-gray-100">Buat Posisi Baru</h2>
            <form onSubmit={handleCreatePosition} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">Nama Posisi</label>
                <input
                  type="text" required value={newPosition.name}
                  onChange={(e) => setNewPosition({ ...newPosition, name: e.target.value })}
                  placeholder="Contoh: Bar, Kitchen, Kasir"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">Kapasitas Shift 1</label>
                  <input type="number" min="1" required value={newPosition.shift1Capacity}
                    onChange={(e) => setNewPosition({ ...newPosition, shift1Capacity: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">Kapasitas Shift 2</label>
                  <input type="number" min="1" required value={newPosition.shift2Capacity}
                    onChange={(e) => setNewPosition({ ...newPosition, shift2Capacity: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100" />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowCreateModal(false)} className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg text-sm">Batal</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 font-medium">Buat Posisi</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Modal Edit Posisi ─── */}
      {editModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-4 text-gray-800 dark:text-gray-100">Edit Posisi: {editModal.name}</h2>
            <form onSubmit={handleEditPosition} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">Nama Posisi</label>
                <input type="text" required value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">Kapasitas Shift 1</label>
                  <input type="number" min="1" required value={editForm.shift1Capacity}
                    onChange={(e) => setEditForm({ ...editForm, shift1Capacity: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">Kapasitas Shift 2</label>
                  <input type="number" min="1" required value={editForm.shift2Capacity}
                    onChange={(e) => setEditForm({ ...editForm, shift2Capacity: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100" />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setEditModal(false)} className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg text-sm">Batal</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 font-medium">Simpan</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Modal Atur Roster ─── */}
      {rosterModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Atur Roster — {selectedPosition?.name}</h2>
              <button onClick={() => setRosterModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>

            {/* Tambah user */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">Tambah Pegawai</label>
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
                <option value="" disabled>Pilih pegawai untuk ditambahkan...</option>
                {users.filter((u) => u.role !== 'ADMIN').map((u) => {
                  const inRoster = roster.some((r) => r.userId === u.id);
                  return (
                    <option key={u.id} value={u.id} disabled={inRoster}>
                      {getUserName(u)}{inRoster ? ' ✓ Sudah di roster' : ''}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Daftar roster */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-600 dark:text-gray-300">Anggota ({roster.length})</span>
                {roster.length > 0 && (
                  <button onClick={() => setRoster([])} className="text-xs text-red-500 hover:text-red-700">Hapus Semua</button>
                )}
              </div>
              {roster.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-4">Belum ada anggota</p>
              ) : (
                <ul className="space-y-1.5">
                  {roster.map((r, idx) => (
                    <li key={r.userId} className="flex items-center justify-between bg-gray-50 dark:bg-gray-700 rounded-lg px-3 py-2">
                      <span className="text-sm text-gray-700 dark:text-gray-200 flex items-center gap-2">
                        <span className="w-5 h-5 bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-full text-xs flex items-center justify-center">{idx + 1}</span>
                        {getUserName(r.user) || `User ${r.userId}`}
                      </span>
                      <div className="flex items-center gap-1">
                        <select
                          value={r.shift || 1}
                          onChange={(e) => setShift(r.userId, Number(e.target.value))}
                          className="text-xs border border-gray-300 dark:border-gray-600 rounded px-1.5 py-1 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200"
                        >
                          <option value={1}>Shift 1</option>
                          <option value={2}>Shift 2</option>
                        </select>
                        <button onClick={() => moveRoster(idx, -1)} disabled={idx === 0} className="px-1.5 py-1 text-gray-500 disabled:opacity-30">↑</button>
                        <button onClick={() => moveRoster(idx, 1)} disabled={idx === roster.length - 1} className="px-1.5 py-1 text-gray-500 disabled:opacity-30">↓</button>
                        <button onClick={() => removeFromRoster(r.userId)} className="px-1.5 py-1 text-red-500 hover:text-red-700">✕</button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-gray-200 dark:border-gray-700 pt-4">
              <button onClick={() => setRosterModal(false)} className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg text-sm">Batal</button>
              <button onClick={handleSaveRoster} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 font-medium">Simpan Roster</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal Backup ─── */}
      {backupModal && (
        <BackupModal
          date={backupModal.date}
          issues={backupModal.issues}
          roster={roster}
          users={users}
          positionId={selectedPosition?.id}
          onClose={() => setBackupModal(null)}
          onSaved={() => {
            // Remove solved understaffed
            setUnderstaffed((prev) => prev.filter((u) => u.date !== backupModal.date));
          }}
        />
      )}
    </div>
  );
}
