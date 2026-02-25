import { useState, useEffect } from 'react';
import Card from '../../components/shared/Card';
import { getAttendanceHistory } from '../../services/attendanceService';
import { formatDate, formatTime, formatStatus, getStatusBadgeClass } from '../../utils/formatters';
import { SkeletonTable } from '../../components/shared/Loading';
import Badge from '../../components/shared/Badge';

const AttendancePage = () => {
  const [attendanceData, setAttendanceData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);

  const fetchAttendance = async (page = currentPage) => {
    setLoading(true);
    try {
      const response = await getAttendanceHistory({ page, limit: 20 });
      setAttendanceData(response.data);
    } catch (error) {
      console.error('Failed to fetch attendance:', error);
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

  useEffect(() => {
    fetchAttendance(1);
  }, []);

  if (loading) {
    return <SkeletonTable rows={10} />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Riwayat Absensi</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">Lihat riwayat kehadiran Anda</p>
      </div>

      {/* Summary Cards */}
      {attendanceData?.summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{attendanceData.summary.totalDays}</p>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Total Hari</p>
            </div>
          </Card>

          <Card className="p-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">{attendanceData.summary.presentDays}</p>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Hadir</p>
            </div>
          </Card>

          <Card className="p-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{attendanceData.summary.lateDays}</p>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Terlambat</p>
            </div>
          </Card>

          <Card className="p-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-red-600 dark:text-red-400">{attendanceData.summary.absentDays}</p>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Absen</p>
            </div>
          </Card>
        </div>
      )}

      {/* Attendance Table */}
      <Card>
        <Card.Header>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Riwayat Kehadiran</h3>
        </Card.Header>
        {/* Desktop View (Table) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700/50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Tanggal
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Jam Masuk
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Jam Pulang
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Durasi
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {attendanceData?.records?.map((record) => (
                <tr key={record.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-200">
                    {formatDate(record.date)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                    {formatTime(record.clockIn)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                    {record.clockOut ? formatTime(record.clockOut) : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Badge status={record.status}>
                      {formatStatus(record.status)}
                    </Badge>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                    {record.totalHours || '-'}
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
                    {formatDate(record.date)}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Durasi: {record.totalHours || '-'}
                  </p>
                </div>
                <Badge status={record.status}>
                  {formatStatus(record.status)}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="bg-gray-50 dark:bg-gray-700/50 p-2 rounded">
                  <p className="text-gray-500 dark:text-gray-400 text-xs mb-1">Masuk</p>
                  <p className="font-medium text-gray-900 dark:text-white">{formatTime(record.clockIn)}</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700/50 p-2 rounded">
                  <p className="text-gray-500 dark:text-gray-400 text-xs mb-1">Pulang</p>
                  <p className="font-medium text-gray-900 dark:text-white">{record.clockOut ? formatTime(record.clockOut) : '-'}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {attendanceData?.records?.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500 dark:text-gray-400">Tidak ada data absensi</p>
          </div>
        )}

        {/* Pagination */}
        {attendanceData?.pagination && attendanceData.pagination.totalPages > 1 && (
          <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Menampilkan {attendanceData.pagination.page} dari {attendanceData.pagination.totalPages} halaman
            </p>
            <div className="flex gap-2">
              <button
                onClick={handlePreviousPage}
                className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md text-sm hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-50"
                disabled={attendanceData.pagination.page === 1 || loading}
              >
                Sebelumnya
              </button>
              <button
                onClick={handleNextPage}
                className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md text-sm hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-50"
                disabled={attendanceData.pagination.page === attendanceData.pagination.totalPages || loading}
              >
                Selanjutnya
              </button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};

export default AttendancePage;
