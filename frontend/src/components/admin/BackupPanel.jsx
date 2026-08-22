import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import rotationService from '../../services/rotationService';

/**
 * BackupPanel
 * Panel untuk mengelola backup staff harian.
 *
 * Props:
 * - date: string YYYY-MM-DD
 * - positions: array of {id, name} — posisi yang ada hari itu
 * - onClose: callback menutup panel
 */
export default function BackupPanel({ date, positions = [], onClose }) {
  const [backups, setBackups] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [selectedPositionId, setSelectedPositionId] = useState('');
  const [absentUserOptions, setAbsentUserOptions] = useState([]);
  const [absentUserId, setAbsentUserId] = useState('');
  const [backupUserId, setBackupUserId] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (date) {
      fetchBackups();
      fetchCandidates();
    }
  }, [date]);

  // Ketika posisi dipilih, ambil roster posisi tersebut
  useEffect(() => {
    if (selectedPositionId) {
      fetchAbsentOptions(selectedPositionId);
    } else {
      setAbsentUserOptions([]);
      setAbsentUserId('');
    }
  }, [selectedPositionId]);

  const fetchBackups = async () => {
    setLoading(true);
    try {
      const res = await rotationService.listBackups(date);
      setBackups(res.data.data || []);
    } catch {
      toast.error('Gagal memuat data backup');
    } finally {
      setLoading(false);
    }
  };

  const fetchCandidates = async (posId) => {
    try {
      const res = await rotationService.getBackupCandidates(date, posId || selectedPositionId || undefined);
      setCandidates(res.data.data || []);
    } catch {
      // silent
    }
  };

  const fetchAbsentOptions = async (posId) => {
    try {
      // Ambil kandidat — mereka yang ada di posisi ini (dijadwalkan minggu ini)
      const res = await rotationService.getBackupCandidates(date, posId);
      // user yang BUKAN kandidat (karena mereka yang di posisi ini) = absent options
      // Kita butuh roster posisi ini — gunakan kandidat dari semua posisi lain
      const all = await rotationService.getBackupCandidates(date, undefined);
      const candidateIds = new Set((res.data.data || []).map(c => c.id));
      const allIds = new Set((all.data.data || []).map(c => c.id));
      // Staff yang di posisi ini = allIds - candidateIds
      // Tapi lebih simpel: ambil jadwal posisi ini dari data positions
      // Gunakan approach: absent options = semua user aktif yang tidak ada di kandidat posisi ini
      // Di sini kita pakai candidates dari posId sebagai "yang bukan di posisi"
      // Maka "yang di posisi ini" = all - candidates
      const inPosition = (all.data.data || []).filter(u => !candidateIds.has(u.id));
      setAbsentUserOptions(inPosition);
      // Update candidates juga
      setCandidates(res.data.data || []);
    } catch {
      // silent
    }
  };

  const handleSave = async () => {
    if (!selectedPositionId || !absentUserId || !backupUserId) {
      toast.error('Lengkapi semua field terlebih dahulu');
      return;
    }
    setSaving(true);
    try {
      await rotationService.createBackup({
        date,
        absentUserId: parseInt(absentUserId),
        backupUserId: parseInt(backupUserId),
        absentPositionId: parseInt(selectedPositionId),
        notes: notes || undefined,
      });
      toast.success('Backup berhasil ditambahkan');
      setAbsentUserId('');
      setBackupUserId('');
      setNotes('');
      setSelectedPositionId('');
      fetchBackups();
      fetchCandidates();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Gagal menyimpan backup');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Batalkan backup ini?')) return;
    try {
      await rotationService.deleteBackup(id);
      toast.success('Backup dibatalkan');
      fetchBackups();
    } catch {
      toast.error('Gagal membatalkan backup');
    }
  };

  const dateLabel = new Date(`${date}T00:00:00`).toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  // Pisahkan kandidat berdasarkan department
  const kitchenCandidates = candidates.filter(c => c.isFromKitchen);
  const otherCandidates = candidates.filter(c => !c.isFromKitchen);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">Manajemen Backup Staff</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">{dateLabel}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-2xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="p-5 space-y-6">
          {/* Form tambah backup */}
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 space-y-3">
            <h3 className="font-semibold text-gray-700 dark:text-gray-200 text-sm">Tambah Backup Baru</h3>

            {/* Pilih posisi */}
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Posisi yang kekurangan staff
              </label>
              <select
                value={selectedPositionId}
                onChange={e => setSelectedPositionId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
              >
                <option value="">-- Pilih Posisi --</option>
                {positions.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            {/* Staff yang libur */}
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Staff yang libur / tidak hadir
              </label>
              <select
                value={absentUserId}
                onChange={e => setAbsentUserId(e.target.value)}
                disabled={!selectedPositionId}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 disabled:opacity-50"
              >
                <option value="">-- Pilih Staff --</option>
                {absentUserOptions.map(u => (
                  <option key={u.id} value={u.id}>{u.fullName} ({u.department})</option>
                ))}
              </select>
            </div>

            {/* Pilih backup */}
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Staff pengganti (backup)
              </label>
              <select
                value={backupUserId}
                onChange={e => setBackupUserId(e.target.value)}
                disabled={!selectedPositionId}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 disabled:opacity-50"
              >
                <option value="">-- Pilih Staff Backup --</option>
                {kitchenCandidates.length > 0 && (
                  <optgroup label="🍳 Staff Dapur (jadwal dapur akan disesuaikan)">
                    {kitchenCandidates.map(u => (
                      <option key={u.id} value={u.id}>
                        {u.fullName}{u.currentPosition ? ` — sedang di ${u.currentPosition}` : ''}
                      </option>
                    ))}
                  </optgroup>
                )}
                {otherCandidates.length > 0 && (
                  <optgroup label="🍺 Staff Lainnya (jadwal normal)">
                    {otherCandidates.map(u => (
                      <option key={u.id} value={u.id}>
                        {u.fullName} ({u.department}){u.currentPosition ? ` — sedang di ${u.currentPosition}` : ''}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              {backupUserId && kitchenCandidates.find(c => c.id === parseInt(backupUserId)) && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                  ⚠️ Staff dapur yang dipilih akan dihapus dari jadwal dapur hari ini.
                </p>
              )}
            </div>

            {/* Catatan */}
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Catatan (opsional)
              </label>
              <input
                type="text"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Alasan backup, dll."
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
              />
            </div>

            <button
              onClick={handleSave}
              disabled={saving || !selectedPositionId || !absentUserId || !backupUserId}
              className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Menyimpan...' : 'Tambah Backup'}
            </button>
          </div>

          {/* Daftar backup aktif */}
          <div>
            <h3 className="font-semibold text-gray-700 dark:text-gray-200 text-sm mb-3">
              Backup Aktif Hari Ini
            </h3>
            {loading ? (
              <p className="text-sm text-gray-400 text-center py-4">Memuat...</p>
            ) : backups.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">Belum ada backup yang ditugaskan hari ini.</p>
            ) : (
              <div className="space-y-2">
                {backups.map(b => (
                  <div
                    key={b.id}
                    className="flex items-center justify-between p-3 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg"
                  >
                    <div className="text-sm">
                      <div className="font-medium text-gray-800 dark:text-gray-100">
                        <span className="text-red-500">✗ {b.absentUser?.fullName || `User #${b.absentUserId}`}</span>
                        {' → '}
                        <span className="text-green-600 dark:text-green-400">
                          ✓ {b.backupUser?.fullName || `User #${b.backupUserId}`}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        Posisi: {b.absentPosition?.name || '—'}
                        {b.backupUserOriginalDepartment === 'KITCHEN' && (
                          <span className="ml-2 text-amber-500">⚠️ Staff dapur — jadwal dapur disesuaikan</span>
                        )}
                        {b.notes && <span className="ml-2">· {b.notes}</span>}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDelete(b.id)}
                      className="text-red-400 hover:text-red-600 text-xs ml-3 whitespace-nowrap"
                    >
                      Batalkan
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
