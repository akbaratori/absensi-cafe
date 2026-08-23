import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import rotationService from '../../services/rotationService';

/**
 * BackupPanel - backup chain 2 langkah
 *
 * Step 1: Pilih posisi absen, siapa absen, siapa backup (misal Gio dari Bar)
 * Step 2: Karena Gio diambil dari Bar, tanya siapa pengganti Gio di Bar
 *
 * Jika backup user tidak punya posisi asal, langsung selesai (1 langkah).
 */
export default function BackupPanel({ date, positions = [], onClose }) {
  const [backups, setBackups]   = useState([]);
  const [loading, setLoading]   = useState(false);
  const [saving, setSaving]     = useState(false);

  // Step: 'step1' | 'step2'
  const [step, setStep] = useState('step1');

  // Step 1 state
  const [selectedPositionId, setSelectedPositionId] = useState('');
  const [absentUserOptions, setAbsentUserOptions]   = useState([]);
  const [absentUserId, setAbsentUserId]             = useState('');
  const [backupUserId, setBackupUserId]             = useState('');
  const [candidates, setCandidates]                 = useState([]);
  const [notes, setNotes]                           = useState('');

  // Step 2 (backup chain) state
  // chainInfo: { backupUserName, originPositionId, originPositionName, originAbsentUserId }
  const [chainInfo, setChainInfo]                 = useState(null);
  const [chainCandidates, setChainCandidates]     = useState([]);
  const [chainBackupUserId, setChainBackupUserId] = useState('');
  const [chainNotes, setChainNotes]               = useState('');

  useEffect(() => {
    if (date) { fetchBackups(); fetchCandidates(); }
  }, [date]);

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
    } catch { toast.error('Gagal memuat data backup'); }
    finally { setLoading(false); }
  };

  const fetchCandidates = async () => {
    try {
      const res = await rotationService.getBackupCandidates(date, undefined);
      setCandidates(res.data.data || []);
    } catch { /* silent */ }
  };

  const fetchAbsentOptions = async (posId) => {
    try {
      const [resCandidates, resAll] = await Promise.all([
        rotationService.getBackupCandidates(date, posId),
        rotationService.getBackupCandidates(date, undefined),
      ]);
      const candidateIds = new Set((resCandidates.data.data || []).map(c => c.id));
      const inPosition = (resAll.data.data || []).filter(u => !candidateIds.has(u.id));
      setAbsentUserOptions(inPosition);
      setCandidates(resCandidates.data.data || []);
    } catch { /* silent */ }
  };

  const resetStep1 = () => {
    setSelectedPositionId('');
    setAbsentUserId('');
    setBackupUserId('');
    setNotes('');
    setAbsentUserOptions([]);
  };

  const resetChain = () => {
    setStep('step1');
    setChainInfo(null);
    setChainBackupUserId('');
    setChainCandidates([]);
    setChainNotes('');
  };

  /**
   * Step 1: Simpan backup utama.
   * Setelah berhasil, cek apakah backup user punya posisi asal berbeda
   * dari posisi yang baru diisi. Jika ya, masuk step 2 (backup chain).
   */
  const handleSave = async () => {
    if (!selectedPositionId || !absentUserId || !backupUserId) {
      toast.error('Lengkapi semua field terlebih dahulu');
      return;
    }
    setSaving(true);
    try {
      await rotationService.createBackup({
        date,
        absentUserId:     parseInt(absentUserId),
        backupUserId:     parseInt(backupUserId),
        absentPositionId: parseInt(selectedPositionId),
        notes,
      });
      toast.success('Backup berhasil ditambahkan');
      await fetchBackups();

      // Cek apakah perlu backup chain
      const chosen = candidates.find(c => c.id === parseInt(backupUserId));
      const origin = positions.find(p => p.name === chosen?.currentPosition);

      if (chosen?.currentPosition && origin && origin.id !== parseInt(selectedPositionId)) {
        // Backup user punya posisi asal berbeda - masuk step 2
        const res = await rotationService.getBackupCandidates(date, origin.id);
        setChainInfo({
          backupUserName:     chosen.fullName,
          originPositionId:   origin.id,
          originPositionName: origin.name,
          originAbsentUserId: parseInt(backupUserId),
        });
        setChainCandidates(res.data.data || []);
        setStep('step2');
      } else {
        resetStep1();
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Gagal menyimpan backup');
    } finally {
      setSaving(false);
    }
  };

  /**
   * Step 2: Simpan backup chain untuk posisi asal backup user.
   */
  const handleChainSave = async () => {
    if (!chainBackupUserId) {
      toast.error('Pilih pengganti terlebih dahulu');
      return;
    }
    setSaving(true);
    try {
      await rotationService.createBackup({
        date,
        absentUserId:     chainInfo.originAbsentUserId,
        backupUserId:     parseInt(chainBackupUserId),
        absentPositionId: chainInfo.originPositionId,
        notes: chainNotes || ('Backup chain - ' + chainInfo.backupUserName + ' dipindahkan ke posisi lain'),
      });
      toast.success('Backup chain untuk ' + chainInfo.originPositionName + ' berhasil disimpan');
      await fetchBackups();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Gagal menyimpan backup chain');
    } finally {
      setSaving(false);
      resetStep1();
      resetChain();
    }
  };

  const handleSkipChain = () => {
    toast('Slot ' + chainInfo.originPositionName + ' dibiarkan kosong.', { icon: 'u26A0uFE0F' });
    resetStep1();
    resetChain();
  };

  const handleDelete = async (id) => {
    try {
      await rotationService.deleteBackup(id);
      toast.success('Backup dibatalkan');
      fetchBackups();
    } catch { toast.error('Gagal membatalkan backup'); }
  };

  // Derived
  const kitchenCandidates = candidates.filter(c => c.department === 'KITCHEN');
  const otherCandidates   = candidates.filter(c => c.department !== 'KITCHEN');
  const chainKitchen      = chainCandidates.filter(c => c.department === 'KITCHEN');
  const chainOther        = chainCandidates.filter(c => c.department !== 'KITCHEN');

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 w-full max-w-md h-full bg-gray-50 dark:bg-gray-800 shadow-2xl flex flex-col overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
          <div>
            <h2 className="font-semibold text-gray-800 dark:text-gray-100">
              {step === 'step1' ? 'Kelola Backup' : 'Backup Chain - Langkah 2'}
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{date}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none" aria-label="Tutup">x</button>
        </div>

        <div className="flex-1 p-5 space-y-6">

          {/* Step indicator */}
          {step === 'step2' && (
            <div className="flex items-center gap-2 text-xs">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-green-500 text-white font-bold">1</span>
              <span className="text-green-600 dark:text-green-400 font-medium">Backup utama tersimpan</span>
              <span className="text-gray-300 dark:text-gray-600 mx-1">-</span>
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-600 text-white font-bold">2</span>
              <span className="text-blue-600 dark:text-blue-400 font-medium">Isi slot kosong</span>
            </div>
          )}

          {/* STEP 1 */}
          {step === 'step1' && (
            <div className="space-y-4">
              <h3 className="font-semibold text-gray-700 dark:text-gray-200 text-sm">Tambah Backup Baru</h3>

              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Posisi yang butuh backup</label>
                <select value={selectedPositionId} onChange={e => setSelectedPositionId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100">
                  <option value="">Pilih posisi</option>
                  {positions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Staff yang absen</label>
                <select value={absentUserId} onChange={e => setAbsentUserId(e.target.value)} disabled={!selectedPositionId}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 disabled:opacity-50">
                  <option value="">Pilih staff absen</option>
                  {absentUserOptions.map(u => <option key={u.id} value={u.id}>{u.fullName}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Staff pengganti (backup)</label>
                <select value={backupUserId} onChange={e => setBackupUserId(e.target.value)} disabled={!selectedPositionId}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 disabled:opacity-50">
                  <option value="">Pilih pengganti</option>
                  {kitchenCandidates.length > 0 && (
                    <optgroup label="Staff Dapur">
                      {kitchenCandidates.map(u => <option key={u.id} value={u.id}>{u.fullName}{u.currentPosition ? ' - dari ' + u.currentPosition : ''}</option>)}
                    </optgroup>
                  )}
                  {otherCandidates.length > 0 && (
                    <optgroup label="Lainnya">
                      {otherCandidates.map(u => <option key={u.id} value={u.id}>{u.fullName}{u.currentPosition ? ' - dari ' + u.currentPosition : ''}</option>)}
                    </optgroup>
                  )}
                </select>

                {/* Warning dapur */}
                {backupUserId && kitchenCandidates.find(c => c.id === parseInt(backupUserId)) && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">Staff dapur akan dihapus dari jadwal dapur hari ini.</p>
                )}

                {/* Info backup chain yang akan terjadi */}
                {(() => {
                  const chosen = candidates.find(c => c.id === parseInt(backupUserId));
                  const origin = positions.find(p => p.name === chosen?.currentPosition);
                  if (chosen?.currentPosition && origin && origin.id !== parseInt(selectedPositionId)) {
                    return (
                      <p className="text-xs text-blue-600 dark:text-blue-400 mt-1 bg-blue-50 dark:bg-blue-900/30 px-2 py-1.5 rounded">
                        {chosen.fullName} berasal dari {chosen.currentPosition}. Setelah disimpan, kamu akan diminta mengisi slot kosong di sana.
                      </p>
                    );
                  }
                  return null;
                })()}
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Catatan (opsional)</label>
                <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Alasan backup..."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100" />
              </div>

              <button onClick={handleSave} disabled={saving || !selectedPositionId || !absentUserId || !backupUserId}
                className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                {saving ? 'Menyimpan...' : 'Simpan Backup'}
              </button>
            </div>
          )}

          {/* STEP 2: Backup chain */}
          {step === 'step2' && chainInfo && (
            <div className="space-y-4">
              <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg p-4">
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-1">Slot kosong terdeteksi</p>
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  <strong>{chainInfo.backupUserName}</strong> dipindahkan dari <strong>{chainInfo.originPositionName}</strong> ke posisi lain.
                  Slot mereka di <strong>{chainInfo.originPositionName}</strong> sekarang kosong.
                </p>
                <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">Siapa yang mengisi slot tersebut?</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Pengganti untuk <strong>{chainInfo.originPositionName}</strong></label>
                <select value={chainBackupUserId} onChange={e => setChainBackupUserId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100">
                  <option value="">Pilih pengganti</option>
                  {chainKitchen.length > 0 && (
                    <optgroup label="Staff Dapur">
                      {chainKitchen.map(u => <option key={u.id} value={u.id}>{u.fullName}{u.currentPosition ? ' - dari ' + u.currentPosition : ''}</option>)}
                    </optgroup>
                  )}
                  {chainOther.length > 0 && (
                    <optgroup label="Lainnya">
                      {chainOther.map(u => <option key={u.id} value={u.id}>{u.fullName}{u.currentPosition ? ' - dari ' + u.currentPosition : ''}</option>)}
                    </optgroup>
                  )}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Catatan (opsional)</label>
                <input type="text" value={chainNotes} onChange={e => setChainNotes(e.target.value)} placeholder="Catatan backup chain..."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100" />
              </div>

              <div className="flex gap-3">
                <button onClick={handleChainSave} disabled={saving || !chainBackupUserId}
                  className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                  {saving ? 'Menyimpan...' : 'Simpan Backup Chain'}
                </button>
                <button onClick={handleSkipChain} disabled={saving}
                  className="px-4 py-2 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg text-sm font-medium hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors">
                  Lewati
                </button>
              </div>
            </div>
          )}

          {/* Daftar backup aktif */}
          <div>
            <h3 className="font-semibold text-gray-700 dark:text-gray-200 text-sm mb-3">Backup Aktif Hari Ini</h3>
            {loading ? (
              <p className="text-sm text-gray-400 text-center py-4">Memuat...</p>
            ) : backups.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">Belum ada backup yang ditugaskan hari ini.</p>
            ) : (
              <div className="space-y-2">
                {backups.map(b => (
                  <div key={b.id} className="flex items-center justify-between p-3 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg">
                    <div className="text-sm">
                      <div className="font-medium text-gray-800 dark:text-gray-100">
                        <span className="text-red-500">{b.absentUser?.fullName || 'User #' + b.absentUserId}</span>
                        {' -> '}
                        <span className="text-green-600 dark:text-green-400">{b.backupUser?.fullName || 'User #' + b.backupUserId}</span>
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        Posisi: {b.absentPosition?.name || '-'}
                        {b.backupUserOriginalDepartment === 'KITCHEN' && (
                          <span className="ml-2 text-amber-500">Staff dapur - jadwal dapur disesuaikan</span>
                        )}
                        {b.notes && <span className="ml-2">. {b.notes}</span>}
                      </div>
                    </div>
                    <button onClick={() => handleDelete(b.id)} className="text-red-400 hover:text-red-600 text-xs ml-3 whitespace-nowrap">Batalkan</button>
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
