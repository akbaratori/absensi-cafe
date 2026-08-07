import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import Card from '../../components/shared/Card';
import Button from '../../components/shared/Button';
import Badge from '../../components/shared/Badge';
import SwapRequestModal from '../../components/modals/SwapRequestModal';
import SwapInboxModal from '../../components/modals/SwapInboxModal';
import OffDayRequestModal from '../../components/modals/OffDayRequestModal';
import LatePenaltyWidget from '../../components/employee/LatePenaltyWidget';
import MyClosingJobdeskWidget from '../../components/employee/MyClosingJobdeskWidget';
import {
  getTodayAttendance,
  clockIn,
  clockOut,
  getMonthlySummary,
} from '../../services/attendanceService';
import { getUserSchedule } from '../../services/scheduleService';
import { getLeaveQuota } from '../../services/leaveService';
import { formatTime, formatStatus } from '../../utils/formatters';
import { showSuccess, showError } from '../../hooks/useToast';

const DashboardPage = () => {
  const { user } = useAuth();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [todayData, setTodayData] = useState(null);
  const [monthlySummary, setMonthlySummary] = useState(null);
  const [leaveQuota, setLeaveQuota] = useState(null);
  const [upcomingSchedule, setUpcomingSchedule] = useState([]);
  const [showSwapModal, setShowSwapModal] = useState(false);
  const [showInboxModal, setShowInboxModal] = useState(false);
  const [showOffDayModal, setShowOffDayModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // Update current time every second
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchTodayAttendance = async () => {
    try {
      const response = await getTodayAttendance();
      setTodayData(response.data);
    } catch (error) {
      console.error("Failed to fetch today's attendance:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchMonthlySummary = async () => {
    try {
      const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
      const response = await getMonthlySummary(currentMonth);
      setMonthlySummary(response.data);
    } catch (error) {
      console.error('Failed to fetch monthly summary:', error);
    }
  };

  const fetchLeaveQuota = async () => {
    try {
      const response = await getLeaveQuota();
      setLeaveQuota(response.data);
    } catch (error) {
      console.error('Failed to fetch leave quota:', error);
    }
  };

  const fetchUpcomingSchedule = async () => {
    if (!user) return;
    try {
      const today = new Date();
      const startDate = new Date(today);
      startDate.setDate(today.getDate() + 1);
      const endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 2);
      const response = await getUserSchedule(
        user.id,
        startDate.toISOString().split('T')[0],
        endDate.toISOString().split('T')[0]
      );
      setUpcomingSchedule(response.data || []);
    } catch (error) {
      console.error('Failed to fetch upcoming schedule:', error);
    }
  };

  useEffect(() => {
    if (user) {
      fetchTodayAttendance();
      fetchMonthlySummary();
      fetchLeaveQuota();
      fetchUpcomingSchedule();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const getLocation = async () => {
    if (!navigator.geolocation) return null;
    try {
      const position = await new Promise((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        })
      );
      return {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
    } catch {
      return null;
    }
  };

  const handleClockIn = async () => {
    setActionLoading(true);
    try {
      const location = await getLocation();
      await clockIn(location, null, null);
      showSuccess('Berhasil absen masuk!');
      await fetchTodayAttendance();
    } catch (error) {
      const message =
        error.response?.data?.error?.message || error.message || 'Gagal absen masuk';
      showError(message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleClockOut = async () => {
    setActionLoading(true);
    try {
      const location = await getLocation();
      await clockOut(location, null);
      showSuccess('Berhasil absen pulang!');
      await fetchTodayAttendance();
    } catch (error) {
      const message =
        error.response?.data?.error?.message || error.message || 'Gagal absen pulang';
      showError(message);
    } finally {
      setActionLoading(false);
    }
  };

  const formatDateTime = (date) =>
    new Date(date).toLocaleString('id-ID', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Banner Terlambat Hari Ini */}
      {todayData?.status === 'late' && (
        <div className="flex items-center gap-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-5 py-3">
          <span className="text-2xl">⚠️</span>
          <div>
            <p className="font-semibold text-red-700 dark:text-red-300">Anda terlambat hari ini</p>
            <p className="text-sm text-red-600 dark:text-red-400">
              {todayData.lateMinutes ? `${todayData.lateMinutes} menit dari jadwal` : 'Terlambat dari jadwal'}
            </p>
          </div>
        </div>
      )}

      {/* Kartu Absensi */}
      <Card>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">{formatDateTime(currentTime)}</p>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mt-1">
              {currentTime.toLocaleTimeString('id-ID')}
            </h2>
            {todayData?.clockIn && (
              <p className="text-sm text-gray-600 dark:text-gray-300 mt-2">
                Masuk: <span className="font-semibold">{formatTime(todayData.clockIn)}</span>
                {todayData.clockOut && (
                  <>
                    {' '}• Pulang: <span className="font-semibold">{formatTime(todayData.clockOut)}</span>
                  </>
                )}
              </p>
            )}
          </div>
          {todayData?.status && (
            <Badge status={todayData.status}>{formatStatus(todayData.status)}</Badge>
          )}
        </div>

        <div className="mt-6">
          {todayData?.isOffDay ? (
            <div className="p-6 bg-orange-50 dark:bg-orange-900/20 rounded-xl border border-orange-200 dark:border-orange-800 text-center">
              <div className="mb-3 text-4xl">🏖️</div>
              <h3 className="text-lg font-bold text-orange-800 dark:text-orange-200 mb-1">
                Selamat Berlibur!
              </h3>
              <p className="text-gray-600 dark:text-gray-300 mb-4">
                Hari ini adalah jadwal libur Anda. Nikmati waktu istirahat Anda!
              </p>
              <Button
                variant="outline"
                onClick={() => setShowOffDayModal(true)}
                className="border-orange-300 text-orange-700 hover:bg-orange-100"
              >
                📅 Ajukan Tukar Libur
              </Button>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button
                variant="primary"
                size="lg"
                onClick={handleClockIn}
                disabled={!todayData?.canClockIn || actionLoading}
                loading={actionLoading}
                className="min-w-[160px]"
              >
                ⏰ Masuk
              </Button>
              <Button
                variant={todayData?.clockOut ? 'secondary' : 'primary'}
                size="lg"
                onClick={handleClockOut}
                disabled={!todayData?.canClockOut || actionLoading}
                loading={actionLoading}
                className="min-w-[160px]"
              >
                🏁 Pulang
              </Button>
            </div>
          )}
        </div>
      </Card>

      {/* Jobdesk Closing (jika ada) */}
      <MyClosingJobdeskWidget />

      {/* Jadwal 3 Hari Ke Depan */}
      {upcomingSchedule.length > 0 && (
        <Card className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border-blue-100 dark:border-blue-800">
          <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-3 flex items-center gap-2">
            <span className="bg-blue-100 dark:bg-blue-800 text-blue-600 dark:text-blue-200 p-1 rounded">📅</span>
            Jadwal 3 Hari Ke Depan
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {upcomingSchedule.map((schedule) => (
              <div
                key={schedule.date}
                className="bg-white dark:bg-gray-800 p-3 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col items-center text-center"
              >
                <span className="text-xs uppercase font-bold text-gray-500 dark:text-gray-400 mb-1">
                  {new Date(schedule.date).toLocaleDateString('id-ID', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'short',
                  })}
                </span>
                {schedule.isOffDay ? (
                  <span className="text-red-600 dark:text-red-400 font-bold text-sm bg-red-50 dark:bg-red-900/20 px-2 py-1 rounded-full">
                    LIBUR
                  </span>
                ) : schedule.shift ? (
                  <>
                    <span
                      className={`text-sm font-bold mb-1 ${
                        schedule.shift.id === 1 ? 'text-blue-600' : 'text-orange-600'
                      }`}
                    >
                      {schedule.shift.name}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded">
                      {schedule.shift.startTime.slice(0, 5)} - {schedule.shift.endTime.slice(0, 5)}
                    </span>
                  </>
                ) : (
                  <span className="text-gray-400 italic text-xs">-</span>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Statistik Bulanan */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="p-6">
          <div className="text-center">
            <p className="text-3xl font-bold text-primary-600">
              {monthlySummary?.summary?.totalWorkingDays ?? '-'}
            </p>
            <p className="text-gray-600 dark:text-gray-400 mt-1">Hari Kerja Bulan Ini</p>
          </div>
        </Card>

        <Card className="p-6">
          <div className="text-center">
            {(() => {
              const hadir =
                (monthlySummary?.summary?.presentDays || 0) +
                (monthlySummary?.summary?.lateDays || 0) +
                (monthlySummary?.summary?.halfDays || 0);
              const total = monthlySummary?.summary?.totalWorkingDays || 0;
              const pct = total > 0 ? Math.round((hadir / total) * 100) : null;
              return (
                <>
                  <p className="text-3xl font-bold text-green-600 dark:text-green-400">{hadir}</p>
                  <p className="text-gray-600 dark:text-gray-400 mt-1">Total Hadir</p>
                  {pct !== null && (
                    <div className="mt-2">
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                        <div
                          className={`h-1.5 rounded-full transition-all ${
                            pct >= 90 ? 'bg-green-500' : pct >= 75 ? 'bg-amber-500' : 'bg-red-500'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <p
                        className={`text-xs font-semibold mt-1 ${
                          pct >= 90
                            ? 'text-green-600'
                            : pct >= 75
                            ? 'text-amber-600'
                            : 'text-red-600'
                        }`}
                      >
                        {pct}% kehadiran
                      </p>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </Card>

        <Card className="p-6">
          <div className="text-center">
            <p className="text-3xl font-bold text-amber-600 dark:text-amber-400">
              {monthlySummary?.summary?.lateDays ?? '0'}
            </p>
            <p className="text-gray-600 dark:text-gray-400 mt-1">Total Terlambat</p>
          </div>
        </Card>

        {/* Potongan Keterlambatan */}
        <div className="md:col-span-3 lg:col-span-1">
          <LatePenaltyWidget compact />
        </div>

        {/* Sisa Jatah Libur */}
        <Card className="p-6 border-l-4 border-indigo-500 md:col-span-3 lg:col-span-1">
          <div className="text-center">
            {leaveQuota ? (
              <>
                <p className="text-3xl font-bold text-indigo-600 dark:text-indigo-400">
                  {leaveQuota?.remaining ?? 0} / {leaveQuota?.quota ?? 4}
                </p>
                <p className="text-gray-600 dark:text-gray-400 mt-1">Sisa Jatah Libur</p>
              </>
            ) : (
              <div className="animate-pulse flex flex-col items-center">
                <div className="h-8 w-16 bg-gray-200 rounded mb-2"></div>
                <div className="h-4 w-24 bg-gray-200 rounded"></div>
              </div>
            )}
          </div>
        </Card>
      </div>

      {showSwapModal && (
        <SwapRequestModal
          onClose={() => setShowSwapModal(false)}
          onSuccess={() => showSuccess('Permintaan terkirim. Cek status di inbox.')}
        />
      )}
      {showInboxModal && <SwapInboxModal onClose={() => setShowInboxModal(false)} />}
      {showOffDayModal && (
        <OffDayRequestModal
          onClose={() => setShowOffDayModal(false)}
          onSuccess={() => setShowOffDayModal(false)}
        />
      )}
    </div>
  );
};

export default DashboardPage;