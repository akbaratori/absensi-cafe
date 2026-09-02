import { useState, useEffect } from 'react';
import Card from '../../components/shared/Card';
import { getAllAttendance, getAttendancePhotoData } from '../../services/attendanceService';
import { formatDate, formatTime, formatStatus } from '../../utils/formatters';
import { SkeletonTable } from '../../components/shared/Loading';
import Badge from '../../components/shared/Badge';
import { Trash2, Trash, Pencil, Plus } from 'lucide-react';
import Modal from '../../components/shared/Modal';
import Button from '../../components/shared/Button';
import { deleteAttendance, deleteAllAttendance, updateAttendance, createAttendance, getUsers } from '../../services/adminService';
import { showSuccess, showError } from '../../hooks/useToast';

const STATUS_OPTIONS = [
  { value: 'PRESENT', label: 'Hadir' },
  { value: 'LATE', label: 'Terlambat' },
  { value: 'ABSENT', label: 'Tidak Hadir' },
  { value: 'HALF_DAY', label: 'Setengah Hari' },
];

// ISO datetime → input datetime-local dalam WITA (UTC+8)
const toWITAInputValue = (isoString) => {
  if (!isoString) return '';
  const d = new Date(new Date(isoString).getTime() + 8 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 16);
};

// Input datetime-local WITA → ISO UTC string
const witaInputToISO = (localValue) => {
  if (!localValue) return null;
  return new Date(`${localValue}:00+08:00`).toISOString();
};


const AttendanceAdminPage = () => {
  const [attendanceData, setAttendanceData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [filters, setFilters] = useState({ status: '', date: '' });
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, recordId: null, employeeName: '' });
  const [deleteAllModal, setDeleteAllModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [photoModal, setPhotoModal] = useState({ isOpen: false, title: '' });
  const [photoSrc, setPhotoSrc] = useState(null);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [editModal, setEditModal] = useState({ isOpen: false, record: null });
  const [addModal, setAddModal] = useState(false);
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [editForm, setEditForm] = useState({ clockIn: '', clockOut: '', status: '', notes: '' });
  const [addForm, setAddForm] = useState({ userId: '', date: '', clockIn: '', clockOut: '', status: 'PRESENT', notes: '' });

  const fetchAttendance = async (page = currentPage, currentFilters = filters) => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        page,
        limit: 20,
        ...Object.fromEntries(Object.entries(currentFilters).filter(([_, v]) => v !== '')),
      };
      const response = await getAllAttendance(params);
      setAttendanceData(response.data);
    } catch (err) {
      console.error('Failed to fetch attendance:', err);
      setError('Gagal memuat data absensi. Coba lagi nanti.');
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    setUsersLoading(true);
    try {
      const response = await getUsers({ limit: 500, status: 'active' });
      setUsers(response.data?.users || response.data || []);
    } catch (err) {
      console.error('Failed to fetch users:', err);
    } finally {
      setUsersLoading(false);
    }
  };

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      const newPage = currentPage - 1;
      setCurrentPage(newPage);
      fetchAttendance(newPage);
    }
  };

  const handleNextPage = () => {
    if (attendanceData?.pagination && currentPage < attendanceData.pagination.totalPages) {
      const newPage = currentPage + 1;
      setCurrentPage(newPage);
      fetchAttendance(newPage);
    }
  };

  const handleFilterChange = (key, value) => {
    const newFilters = { ...filters, [key]: value };
    setFilters(newFilters);
    setCurrentPage(1);
    fetchAttendance(1, newFilters);
  };

  const handleDeleteClick = (record) => {
    setDeleteModal({ isOpen: true, recordId: record.id, employeeName: record.user?.fullName || 'Unknown' });
  };

  const handleConfirmDelete = async () => {
    if (!deleteModal.recordId) return;
    setActionLoading(true);
    try {
      await deleteAttendance(deleteModal.recordId);
      showSuccess('Data absensi berhasil dihapus');
      setDeleteModal({ isOpen: false, recordId: null, employeeName: '' });
      fetchAttendance(currentPage);
    } catch (err) {
      showError('Gagal menghapus data absensi');
    } finally { setActionLoading(false); }
  };

  const handleDeleteAll = async () => {
    setActionLoading(true);
    try {
      await deleteAllAttendance();
      showSuccess('Semua data absensi berhasil dihapus');
      setDeleteAllModal(false);
      fetchAttendance(1);
    } catch (err) {
      showError('Gagal menghapus semua data absensi');
    } finally { setActionLoading(false); }
  };

  const handleEditClick = (record) => {
    setEditForm({
      clockIn: toWITAInputValue(record.clockIn),
      clockOut: toWITAInputValue(record.clockOut),
      status: record.status?.toUpperCase() || 'PRESENT',
      notes: record.notes || '',
    });
    setEditModal({ isOpen: true, record });
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editModal.record) return;
    setActionLoading(true);
    try {
      const payload = {};
      if (editForm.clockIn) payload.clockIn = witaInputToISO(editForm.clockIn);
      if (editForm.clockOut) payload.clockOut = witaInputToISO(editForm.clockOut);
      if (editForm.status) payload.status = editForm.status;
      payload.notes = editForm.notes;
      await updateAttendance(editModal.record.id, payload);
      showSuccess('Data absensi berhasil diperbarui');
      setEditModal({ isOpen: false, record: null });
      fetchAttendance(currentPage);
    } catch (err) {
      showError(err?.response?.data?.error?.message || 'Gagal memperbarui data absensi');
    } finally { setActionLoading(false); }
  };

  const handleAddClick = () => {
    const yesterday = new Date(Date.now() + 8 * 60 * 60 * 1000 - 86400000);
    setAddForm({ userId: '', date: yesterday.toISOString().slice(0, 10), clockIn: '08:00', clockOut: '17:00', status: 'PRESENT', notes: '' });
    if (users.length === 0) fetchUsers();
    setAddModal(true);
  };

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    if (!addForm.userId || !addForm.date || !addForm.clockIn) {
      showError('Karyawan, tanggal, dan jam masuk wajib diisi');
      return;
    }
    setActionLoading(true);
    try {
      await createAttendance({
        userId: parseInt(addForm.userId),
        date: addForm.date,
        clockIn: addForm.clockIn,
        clockOut: addForm.clockOut || null,
        status: addForm.status,
        notes: addForm.notes || null,
      });
      showSuccess('Absensi berhasil ditambahkan');
      setAddModal(false);
      fetchAttendance(currentPage);
    } catch (err) {
      showError(err?.response?.data?.error?.message || 'Gagal menambah data absensi');
    } finally { setActionLoading(false); }
  };

  const openPhotoModal = async (photoUrl, title) => {
    setPhotoModal({ isOpen: true, title });
    setPhotoSrc(null);
    setPhotoLoading(true);
    const base64 = await getAttendancePhotoData(photoUrl);
    if (base64) {
      let mime = 'image/jpeg';
      if (base64.startsWith('iVBOR')) mime = 'image/png';
      else if (base64.startsWith('R0lGOD')) mime = 'image/gif';
      else if (base64.startsWith('UklGR')) mime = 'image/webp';
      setPhotoSrc(`data:${mime};base64,${base64}`);
    } else {
      setPhotoSrc('not-found');
    }
    setPhotoLoading(false);
  };

  useEffect(() => {
    fetchAttendance(1);
  }, []);

  if (loading && !attendanceData) {
    return <SkeletonTable rows={10} />;
  }

  const getStatusBadgeVariant = (status) => {
    const s = status?.toLowerCase();
    if (s === 'present' || s === 'hadir') return 'success';
    if (s === 'late' || s === 'terlambat') return 'warning';
    if (s === 'absent' || s === 'tidak hadir') return 'danger';
    if (s === 'half_day' || s === 'setengah hari') return 'info';
    return 'default';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Data Absensi</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Kelola dan koreksi rekap absensi karyawan</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleAddClick}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
          >
            <Plus size={16} />
            Tambah Absensi
          </button>
          <button
            onClick={() => setDeleteAllModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
          >
            <Trash size={16} />
            Hapus Semua
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-300 px-4 py-3 rounded-md">
          {error}
        </div>
      )}

      {/* Filters */}
      <Card>
        <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label>
            <select
              value={filters.status}
              onChange={(e) => handleFilterChange('status', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="">Semua Status</option>
              {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tanggal</label>
            <input
              type="date"
              value={filters.date}
              onChange={(e) => handleFilterChange('date', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={() => { const f = { status: '', date: '' }; setFilters(f); setCurrentPage(1); fetchAttendance(1, f); }}
              className="w-full px-4 py-2 bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              Reset Filter
            </button>
          </div>
        </div>
      </Card>

      {/* Attendance Table */}
      <Card>
        <div className="overflow-x-auto">
          {loading ? (
            <SkeletonTable rows={8} cols={7} />
          ) : (
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-700/50">
                <tr>
                  {['Karyawan','Tanggal','Jam Masuk','Jam Keluar','Status','Catatan','Aksi'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {!attendanceData?.records?.length ? (
                  <tr><td colSpan={7} className="text-center py-10 text-gray-500">Tidak ada data absensi</td></tr>
                ) : attendanceData.records.map((record) => (
                  <tr key={record.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">{record.user?.fullName || '-'}</div>
                      <div className="text-xs text-gray-400">{record.user?.employeeId || ''}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">{formatDate(record.date)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                      <span>{record.clockIn ? formatTime(record.clockIn) : '-'}</span>
                      {record.clockInPhoto && (
                        <button onClick={() => openPhotoModal(record.clockInPhoto, `Masuk — ${record.user?.fullName}`)} className="ml-1 text-xs text-blue-500 hover:underline">📷</button>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                      <span>{record.clockOut ? formatTime(record.clockOut) : '-'}</span>
                      {record.clockOutPhoto && (
                        <button onClick={() => openPhotoModal(record.clockOutPhoto, `Pulang — ${record.user?.fullName}`)} className="ml-1 text-xs text-blue-500 hover:underline">📷</button>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Badge variant={getStatusBadgeVariant(record.status)}>{formatStatus ? formatStatus(record.status) : record.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 max-w-[140px] truncate" title={record.notes}>{record.notes || '-'}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <button onClick={() => handleEditClick(record)}
                          className="p-1.5 rounded text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30"
                          title="Edit" aria-label={`Edit ${record.user?.fullName}`}>
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => handleDeleteClick(record)}
                          className="p-1.5 rounded text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30"
                          title="Hapus" aria-label={`Hapus ${record.user?.fullName}`}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {attendanceData?.pagination && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700">
            <p className="text-sm text-gray-500">{attendanceData.records?.length || 0} dari {attendanceData.pagination.total} data</p>
            <div className="flex gap-2">
              <button onClick={handlePreviousPage} disabled={currentPage === 1 || loading}
                className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-700">Sebelumnya</button>
              <span className="px-3 py-1 text-sm text-gray-600 dark:text-gray-300">{currentPage} / {attendanceData.pagination.totalPages}</span>
              <button onClick={handleNextPage} disabled={currentPage >= attendanceData.pagination.totalPages || loading}
                className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-700">Berikutnya</button>
            </div>
          </div>
        )}
      </Card>

      {/* Modal Edit */}
      <Modal isOpen={editModal.isOpen} onClose={() => setEditModal({ isOpen: false, record: null })}
        title={`Edit Absensi — ${editModal.record?.user?.fullName || ''}`} size="md">
        <form onSubmit={handleEditSubmit} className="space-y-4">
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 text-sm text-gray-600 dark:text-gray-300">
            <span className="font-medium">Tanggal:</span> {editModal.record?.date ? formatDate(editModal.record.date) : '-'}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Jam Masuk (WITA)</label>
              <input type="datetime-local" value={editForm.clockIn}
                onChange={(e) => setEditForm({ ...editForm, clockIn: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Jam Keluar (WITA)</label>
              <input type="datetime-local" value={editForm.clockOut}
                onChange={(e) => setEditForm({ ...editForm, clockOut: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label>
            <select value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
              {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Catatan</label>
            <textarea value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
              rows={2} placeholder="Catatan (opsional)"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={() => setEditModal({ isOpen: false, record: null })} disabled={actionLoading}>Batal</Button>
            <Button type="submit" variant="primary" loading={actionLoading}>Simpan Perubahan</Button>
          </div>
        </form>
      </Modal>

      {/* Modal Tambah */}
      <Modal isOpen={addModal} onClose={() => setAddModal(false)} title="Tambah Absensi Manual" size="md">
        <form onSubmit={handleAddSubmit} className="space-y-4">
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-3 text-sm text-amber-800 dark:text-amber-300">
            Gunakan untuk mengisi absensi yang terlewat. Akan dicatat sebagai entri manual oleh admin.
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Karyawan <span className="text-red-500">*</span></label>
            <select value={addForm.userId} onChange={(e) => setAddForm({ ...addForm, userId: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white" required>
              <option value="">-- Pilih Karyawan --</option>
              {usersLoading ? <option disabled>Memuat...</option> : users.map((u) => (
                <option key={u.id} value={u.id}>{u.fullName}{u.employeeId ? ` (${u.employeeId})` : ''}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tanggal <span className="text-red-500">*</span></label>
            <input type="date" value={addForm.date} onChange={(e) => setAddForm({ ...addForm, date: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white" required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Jam Masuk <span className="text-red-500">*</span></label>
              <input type="time" value={addForm.clockIn} onChange={(e) => setAddForm({ ...addForm, clockIn: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Jam Keluar</label>
              <input type="time" value={addForm.clockOut} onChange={(e) => setAddForm({ ...addForm, clockOut: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
              <p className="text-xs text-gray-400 mt-0.5">Kosongkan jika belum pulang</p>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label>
            <select value={addForm.status} onChange={(e) => setAddForm({ ...addForm, status: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
              {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Catatan</label>
            <textarea value={addForm.notes} onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })}
              rows={2} placeholder="Alasan penambahan manual (opsional)"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={() => setAddModal(false)} disabled={actionLoading}>Batal</Button>
            <Button type="submit" variant="primary" loading={actionLoading}>Tambah Absensi</Button>
          </div>
        </form>
      </Modal>

      {/* Modal Hapus */}
      <Modal isOpen={deleteModal.isOpen} onClose={() => setDeleteModal({ isOpen: false, recordId: null, employeeName: '' })}
        title="Hapus Data Absensi" size="sm">
        <div className="space-y-4">
          <p className="text-gray-600 dark:text-gray-300">
            Hapus absensi untuk <span className="font-semibold">{deleteModal.employeeName}</span>?
            <br /><span className="text-red-500 text-sm">Tidak dapat dibatalkan.</span>
          </p>
          <div className="flex justify-end gap-3 mt-6">
            <Button variant="ghost" onClick={() => setDeleteModal({ isOpen: false, recordId: null, employeeName: '' })} disabled={actionLoading}>Batal</Button>
            <Button variant="danger" onClick={handleConfirmDelete} loading={actionLoading}>Hapus</Button>
          </div>
        </div>
      </Modal>

      {/* Modal Foto */}
      <Modal isOpen={photoModal.isOpen} onClose={() => { setPhotoModal({ isOpen: false, title: '' }); setPhotoSrc(null); }}
        title={photoModal.title} size="lg">
        <div className="flex justify-center bg-gray-100 dark:bg-gray-800 rounded-lg p-2 min-h-[200px]">
          {photoLoading ? <p className="text-gray-500 self-center">Memuat foto...</p>
            : photoSrc === 'not-found' ? <p className="text-gray-500 self-center">Foto tidak ditemukan</p>
            : photoSrc ? <img src={photoSrc} alt="Foto absensi" className="max-h-[70vh] rounded-md object-contain" />
            : <p className="text-gray-500 self-center">Tidak ada gambar</p>}
        </div>
      </Modal>

      {/* Modal Hapus Semua */}
      <Modal isOpen={deleteAllModal} onClose={() => setDeleteAllModal(false)} title="Hapus Semua Data Absensi" size="sm">
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-3 bg-red-50 dark:bg-red-900/30 rounded-lg border border-red-200 dark:border-red-700">
            <Trash size={20} className="text-red-600 flex-shrink-0" />
            <p className="text-red-700 dark:text-red-300 text-sm font-medium">
              Tindakan ini akan menghapus <strong>SEMUA</strong> data absensi secara permanen!
            </p>
          </div>
          <p className="text-gray-600 dark:text-gray-300 text-sm">Khusus untuk keperluan testing/reset. Tidak dapat dibatalkan.</p>
          <div className="flex justify-end gap-3 mt-6">
            <Button variant="ghost" onClick={() => setDeleteAllModal(false)} disabled={actionLoading}>Batal</Button>
            <Button variant="danger" onClick={handleDeleteAll} loading={actionLoading}>Ya, Hapus Semua</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default AttendanceAdminPage;

