import { useState, useEffect } from 'react';
import Card from '../../components/shared/Card';
import { getAllAttendance } from '../../services/attendanceService';
import { formatDate, formatTime, formatStatus } from '../../utils/formatters';
import { SkeletonTable } from '../../components/shared/Loading';
import Badge from '../../components/shared/Badge';
import { Trash2, Trash } from 'lucide-react';
import Modal from '../../components/shared/Modal';
import Button from '../../components/shared/Button';
import { deleteAttendance, deleteAllAttendance } from '../../services/adminService';
import { showSuccess, showError } from '../../hooks/useToast';

const AttendanceAdminPage = () => {
  const [attendanceData, setAttendanceData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [filters, setFilters] = useState({
    status: '',
    date: '',
  });
  const [deleteModal, setDeleteModal] = useState({
    isOpen: false,
    recordId: null,
    employeeName: '',
  });
  const [deleteAllModal, setDeleteAllModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [photoModal, setPhotoModal] = useState({
    isOpen: false,
    url: '',
    title: ''
  });

  const fetchAttendance = async (page = currentPage, currentFilters = filters) => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        page,
        limit: 20,
        ...Object.fromEntries(
          Object.entries(currentFilters).filter(([_, v]) => v !== '')
        ),
      };
      const response = await getAllAttendance(params);
      setAttendanceData(response.data);
    } catch (error) {
      console.error('Failed to fetch attendance:', error);
      setError('Failed to load attendance data. Please try again later.');
    } finally {
      setLoading(false);
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
    fetchAttendance(1, newFilters);
  };

  const handleDeleteClick = (record) => {
    setDeleteModal({
      isOpen: true,
      recordId: record.id,
      employeeName: record.user?.fullName || 'Unknown User',
    });
  };

  const handleConfirmDelete = async () => {
    if (!deleteModal.recordId) return;

    setActionLoading(true);
    try {
      await deleteAttendance(deleteModal.recordId);
      showSuccess('Attendance record deleted successfully');
      setDeleteModal({ isOpen: false, recordId: null, employeeName: '' });
      fetchAttendance(currentPage);
    } catch (error) {
      console.error('Failed to delete record:', error);
      showError('Failed to delete attendance record');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteAll = async () => {
    setActionLoading(true);
    try {
      const result = await deleteAllAttendance();
      showSuccess(result.message || 'Semua data absensi berhasil dihapus');
      setDeleteAllModal(false);
      fetchAttendance(1);
    } catch (error) {
      console.error('Failed to delete all attendance:', error);
      showError('Gagal menghapus semua data absensi');
    } finally {
      setActionLoading(false);
    }
  };

  useEffect(() => {
    fetchAttendance(1);
  }, []);

  if (loading && !attendanceData) {
    return <SkeletonTable rows={10} />;
  }

  // Helper to ensure full URL
  const getFullImageUrl = (path) => {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    // Remove leading slash if present to avoid double slash if API_URL has trailing slash (though usually API_URL handles api, here we need base)
    // Assuming backend serves uploads at root /uploads, and we are on same domain or proxy.
    // If different domain, we might need env var. For now assuming proxy.
    const cleanPath = path.startsWith('/') ? path.substring(1) : path;
    return `${import.meta.env.VITE_API_URL?.replace('/api/v1', '') || ''}/${cleanPath}`;
  };

  // Actually, VITE_API_URL usually includes /api/v1. Let's strictly use relative path if proxy is set up or just prepend base url.
  // Best way: check if path includes 'uploads'



  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Attendance Management</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">View and manage all employee attendance</p>
        </div>
        <button
          onClick={() => setDeleteAllModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
          title="Hapus semua data absensi (untuk testing)"
        >
          <Trash size={16} />
          Hapus Semua Absen
        </button>
      </div>

      {/* Filters */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-300 px-4 py-3 rounded-md">
          {error}
        </div>
      )}
      <Card>
        <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Status
            </label>
            <select
              value={filters.status}
              onChange={(e) => handleFilterChange('status', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="">All Status</option>
              <option value="PRESENT">Present</option>
              <option value="LATE">Late</option>
              <option value="ABSENT">Absent</option>
              <option value="HALF_DAY">Half Day</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Date
            </label>
            <input
              type="date"
              value={filters.date}
              onChange={(e) => handleFilterChange('date', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>

          <div className="flex items-end">
            <button
              onClick={() => {
                setFilters({ status: '', date: '' });
                setCurrentPage(1);
                fetchAttendance(1, { status: '', date: '' });
              }}
              className="w-full px-4 py-2 bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </Card>

      {/* Attendance Table */}
      <Card>
        <Card.Header>
          <h3 className="text-lg font-semibold text-gray-900">All Attendance Records</h3>
        </Card.Header>
        {/* Desktop View (Table) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 dark:bg-gray-700/50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Employee
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Clock In
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Photo
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Clock Out
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Hours
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {attendanceData?.records?.map((record) => (
                <tr key={record.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                      {record.user?.fullName || '-'}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {record.user?.employeeId || '-'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-200">
                    {formatDate(record.date)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                    {formatTime(record.clockIn)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                    <div className="flex flex-col gap-1">
                      {record.clockInPhoto && (
                        <button
                          onClick={() => setPhotoModal({ isOpen: true, url: record.clockInPhoto, title: `Clock In: ${record.user?.fullName}` })}
                          className="text-xs text-primary-600 hover:text-primary-700 underline"
                        >
                          View In
                        </button>
                      )}
                      {record.clockOutPhoto && (
                        <button
                          onClick={() => setPhotoModal({ isOpen: true, url: record.clockOutPhoto, title: `Clock Out: ${record.user?.fullName}` })}
                          className="text-xs text-primary-600 hover:text-primary-700 underline"
                        >
                          View Out
                        </button>
                      )}
                      {!record.clockInPhoto && !record.clockOutPhoto && '-'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                    {record.clockOut ? (
                      formatTime(record.clockOut)
                    ) : (
                      // Check if date is in the past (before today)
                      new Date(record.date).setHours(0, 0, 0, 0) < new Date().setHours(0, 0, 0, 0) ? (
                        <span className="text-red-500 font-medium text-xs bg-red-50 px-2 py-1 rounded border border-red-200">
                          Missing
                        </span>
                      ) : (
                        '-'
                      )
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Badge status={record.status}>
                      {formatStatus(record.status)}
                    </Badge>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                    {record.totalHours || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                    <button
                      onClick={() => handleDeleteClick(record)}
                      className="text-gray-400 hover:text-red-600 dark:text-gray-500 dark:hover:text-red-400 transition-colors"
                      title="Delete Record"
                    >
                      <Trash2 size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile View (Cards) */}
        <div className="block md:hidden divide-y divide-gray-200 dark:divide-gray-700">
          {attendanceData?.records?.map((record) => (
            <div key={record.id} className="p-4 space-y-3">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white">
                    {record.user?.fullName || '-'}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {record.user?.employeeId || '-'} • {formatDate(record.date)}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge status={record.status}>
                    {formatStatus(record.status)}
                  </Badge>
                  <button
                    onClick={() => handleDeleteClick(record)}
                    className="text-gray-400 hover:text-red-600 dark:text-gray-500 dark:hover:text-red-400 p-1"
                    title="Delete Record"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="bg-gray-50 dark:bg-gray-700/50 p-2 rounded">
                  <p className="text-gray-500 dark:text-gray-400 text-xs mb-1">Masuk</p>
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-gray-900 dark:text-white">{formatTime(record.clockIn)}</span>
                    {record.clockInPhoto && (
                      <button
                        onClick={() => setPhotoModal({ isOpen: true, url: record.clockInPhoto, title: `Clock In: ${record.user?.fullName}` })}
                        className="text-xs text-primary-600 underline"
                      >
                        Foto
                      </button>
                    )}
                  </div>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700/50 p-2 rounded">
                  <p className="text-gray-500 dark:text-gray-400 text-xs mb-1">Pulang</p>
                  <div className="flex justify-between items-center">
                    {record.clockOut ? (
                      <span className="font-medium text-gray-900 dark:text-white">{formatTime(record.clockOut)}</span>
                    ) : (
                      new Date(record.date).setHours(0, 0, 0, 0) < new Date().setHours(0, 0, 0, 0) ? (
                        <span className="text-red-500 font-bold text-xs">Missing</span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )
                    )}
                    {record.clockOutPhoto && (
                      <button
                        onClick={() => setPhotoModal({ isOpen: true, url: record.clockOutPhoto, title: `Clock Out: ${record.user?.fullName}` })}
                        className="text-xs text-primary-600 underline"
                      >
                        Foto
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {attendanceData?.records?.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500">No attendance records found</p>
          </div>
        )}

        {/* Pagination */}
        {attendanceData?.pagination && attendanceData.pagination.totalPages > 1 && (
          <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
            <p className="text-sm text-gray-600">
              Showing {attendanceData.pagination.page} of {attendanceData.pagination.totalPages} pages
              ({attendanceData.pagination.totalRecords} total records)
            </p>
            <div className="flex gap-2">
              <button
                onClick={handlePreviousPage}
                className="px-3 py-1 border border-gray-300 rounded-md text-sm hover:bg-gray-50 disabled:opacity-50"
                disabled={attendanceData.pagination.page === 1 || loading}
              >
                Previous
              </button>
              <button
                onClick={handleNextPage}
                className="px-3 py-1 border border-gray-300 rounded-md text-sm hover:bg-gray-50 disabled:opacity-50"
                disabled={attendanceData.pagination.page === attendanceData.pagination.totalPages || loading}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </Card>

      <Modal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false, recordId: null, employeeName: '' })}
        title="Delete Attendance Record"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-gray-600 dark:text-gray-300">
            Are you sure you want to delete the attendance record for <span className="font-semibold">{deleteModal.employeeName}</span>?
            <br />
            <span className="text-red-500 text-sm">This action cannot be undone.</span>
          </p>
          <div className="flex justify-end gap-3 mt-6">
            <Button
              variant="ghost"
              onClick={() => setDeleteModal({ isOpen: false, recordId: null, employeeName: '' })}
              disabled={actionLoading}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleConfirmDelete}
              loading={actionLoading}
            >
              Delete Record
            </Button>
          </div>
        </div>
      </Modal>


      {/* Photo Modal */}
      <Modal
        isOpen={photoModal.isOpen}
        onClose={() => setPhotoModal({ isOpen: false, url: '', title: '' })}
        title={photoModal.title}
        size="lg"
      >
        <div className="flex justify-center bg-gray-100 dark:bg-gray-800 rounded-lg p-2">
          {photoModal.url ? (
            <img
              src={getFullImageUrl(photoModal.url)}
              alt="Attendance"
              className="max-h-[70vh] rounded-md object-contain"
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = 'https://placehold.co/600x400?text=Image+Not+Found';
              }}
            />
          ) : (
            <p className="text-gray-500">No Image Available</p>
          )}
        </div>
      </Modal>

      {/* Delete ALL Modal */}
      <Modal
        isOpen={deleteAllModal}
        onClose={() => setDeleteAllModal(false)}
        title="Hapus Semua Data Absensi"
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-3 bg-red-50 dark:bg-red-900/30 rounded-lg border border-red-200 dark:border-red-700">
            <Trash size={20} className="text-red-600 flex-shrink-0" />
            <p className="text-red-700 dark:text-red-300 text-sm font-medium">
              Tindakan ini akan menghapus <strong>SEMUA</strong> data absensi secara permanen dan tidak dapat dibatalkan!
            </p>
          </div>
          <p className="text-gray-600 dark:text-gray-300 text-sm">
            Fitur ini khusus untuk keperluan testing. Pastikan Anda benar-benar ingin mereset semua data absensi.
          </p>
          <div className="flex justify-end gap-3 mt-6">
            <Button variant="ghost" onClick={() => setDeleteAllModal(false)} disabled={actionLoading}>
              Batal
            </Button>
            <Button variant="danger" onClick={handleDeleteAll} loading={actionLoading}>
              Ya, Hapus Semua
            </Button>
          </div>
        </div>
      </Modal>
    </div >
  );
};

export default AttendanceAdminPage;
