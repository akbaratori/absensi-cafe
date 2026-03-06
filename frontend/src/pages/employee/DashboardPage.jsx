import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Clock, Camera, RefreshCw } from 'lucide-react';
import Webcam from 'react-webcam';
import Card from '../../components/shared/Card';
import Button from '../../components/shared/Button';
import SwapRequestModal from '../../components/modals/SwapRequestModal';
import SwapInboxModal from '../../components/modals/SwapInboxModal';
import OffDayRequestModal from '../../components/modals/OffDayRequestModal';
import LatePenaltyWidget from '../../components/employee/LatePenaltyWidget';
import { getTodayAttendance, clockIn, clockOut, getMonthlySummary } from '../../services/attendanceService';
import { getUserSchedule } from '../../services/scheduleService';
import { getLeaveQuota } from '../../services/leaveService';
import { formatTime, formatStatus, getStatusBadgeClass, formatDate } from '../../utils/formatters';
import { showSuccess, showError } from '../../hooks/useToast';
import Badge from '../../components/shared/Badge';

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
  const webcamRef = useRef(null);

  const capturePhoto = useCallback(() => {
    const imageSrc = webcamRef.current?.getScreenshot();
    return imageSrc;
  }, [webcamRef]);

  // Update current time every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Fetch today's attendance
  const fetchTodayAttendance = async () => {
    try {
      const response = await getTodayAttendance();
      setTodayData(response.data);
    } catch (error) {
      console.error('Failed to fetch today\'s attendance:', error);
    } finally {
      setLoading(false);
    }
  };

  // Fetch monthly summary
  const fetchMonthlySummary = async () => {
    try {
      const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM format
      const response = await getMonthlySummary(currentMonth);
      setMonthlySummary(response.data);
    } catch (error) {
      console.error('Failed to fetch monthly summary:', error);
    }
  };

  // Fetch leave quota
  const fetchLeaveQuota = async () => {
    try {
      const response = await getLeaveQuota();
      setLeaveQuota(response.data);
    } catch (error) {
      console.error('Failed to fetch leave quota:', error);
    }
  };

  // Fetch upcoming 3 days schedule
  const fetchUpcomingSchedule = async () => {
    if (!user) return;
    try {
      const today = new Date();
      // Start from tomorrow
      const startDate = new Date(today);
      startDate.setDate(today.getDate() + 1);

      // End 3 days from tomorrow
      const endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 2);

      const response = await getUserSchedule(
        user.id,
        startDate.toISOString().split('T')[0],
        endDate.toISOString().split('T')[0]
      );
      setUpcomingSchedule(response.data);
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
  }, [user]);

  // Face Detection Logic
  const [model, setModel] = useState(null);
  const [faceDetected, setFaceDetected] = useState(false);

  useEffect(() => {
    const loadModel = async () => {
      try {
        await import('@tensorflow/tfjs'); // Load tfjs dynamically or ensure it's imported
        const blazeface = await import('@tensorflow-models/blazeface');
        const loadedModel = await blazeface.load();
        setModel(loadedModel);
      } catch (err) {
        console.error('Failed to load face detection model', err);
        showError("Gagal memuat sistem deteksi wajah. Silakan refresh halaman.");
        setFaceDetected(false); // Fail closed check
      }
    };
    loadModel();
  }, []);

  const detectFace = useCallback(async () => {
    if (
      typeof webcamRef.current !== "undefined" &&
      webcamRef.current !== null &&
      webcamRef.current.video.readyState === 4 &&
      model
    ) {
      const video = webcamRef.current.video;
      const predictions = await model.estimateFaces(video, false);

      if (predictions.length > 0) {
        // Check confidence score (probability)
        // BlazeFace returns probability as an array, e.g., [0.998]
        const confidence = predictions[0].probability ? predictions[0].probability[0] : 0;

        // Threshold: 0.85 (85%) confidence required
        if (confidence > 0.85) {
          setFaceDetected(true);
        } else {
          setFaceDetected(false);
        }
      } else {
        setFaceDetected(false);
      }
    }
  }, [model]);

  useEffect(() => {
    let interval;
    if (model) {
      interval = setInterval(() => {
        detectFace();
      }, 500); // Check every 500ms
    }
    return () => clearInterval(interval);
  }, [model, detectFace]);

  const handleClockIn = async () => {
    setActionLoading(true);

    try {
      // Capture photo
      const photo = capturePhoto();
      if (!photo) {
        throw new Error('Gagal mengambil foto. Pastikan kamera aktif.');
      }

      // Get user location
      let location = null;
      if (navigator.geolocation) {
        try {
          const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 10000,
              maximumAge: 0,
            });
          });
          location = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          };
        } catch (geoError) {
          console.warn('Geolocation failed:', geoError);
          // Continue without location
        }
      }

      await clockIn(location, null, photo);
      showSuccess('Berhasil absen masuk!');
      await fetchTodayAttendance();
    } catch (error) {
      const message = error.response?.data?.error?.message || error.message || 'Gagal absen masuk';
      showError(message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleClockOut = async () => {
    setActionLoading(true);

    try {
      // Capture photo
      const photo = capturePhoto();
      if (!photo) {
        throw new Error('Gagal mengambil foto. Pastikan kamera aktif.');
      }

      // Get user location
      let location = null;
      if (navigator.geolocation) {
        try {
          const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 10000,
              maximumAge: 0,
            });
          });
          location = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          };
        } catch (geoError) {
          console.warn('Geolocation failed:', geoError);
          // Continue without location
        }
      }

      await clockOut(location, photo);
      showSuccess('Berhasil absen pulang!');
      await fetchTodayAttendance();
    } catch (error) {
      const message = error.response?.data?.error?.message || error.message || 'Gagal absen pulang';
      showError(message);
    } finally {
      setActionLoading(false);
    }
  };

  const formatDateTime = (date) => {
    return new Date(date).toLocaleString('id-ID', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Selamat datang kembali! {formatDateTime(currentTime)}
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">Berikut ringkasan absensi Anda hari ini</p>
        <div className="mt-2 flex flex-col items-start gap-2">
          <div className="inline-flex items-center gap-2">
            <span className="px-3 py-1 rounded-full text-sm font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">
              {todayData?.schedule ?
                `Shift: ${todayData.schedule.name} (${todayData.schedule.startTime} - ${todayData.schedule.endTime})`
                : (user?.shift ? (user.shift === 'SHIFT_1' ? 'Shift: Pagi (08:15 - 20:00)' : 'Shift: Siang (11:15 - 23:00)') : 'Shift: -')
              }
            </span>
            <Button size="sm" variant="secondary" onClick={() => setShowSwapModal(true)}>
              🔄 Tukar Shift
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowInboxModal(true)}>
              📩 Inbox
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setShowOffDayModal(true)} className="ml-2 bg-orange-100 text-orange-800 hover:bg-orange-200">
              📅 Tukar Libur
            </Button>
          </div>

          {todayData?.nextWeekChange && (
            <div className="w-full bg-blue-50 border-l-4 border-blue-500 p-4 rounded-r shadow-sm animate-fade-in-up">
              <div className="flex">
                <div className="flex-shrink-0">
                  <span className="text-xl">ℹ️</span>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-blue-700">
                    <span className="font-bold">Info Perubahan Shift:</span> Mulai minggu depan ({new Date(todayData.nextWeekChange.dateOfChange).toLocaleDateString()}),
                    Anda akan masuk <strong>Shift {todayData.nextWeekChange.nextShift}</strong>.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Clock In/Out Section */}
      <Card className="p-8">
        <div className="text-center">
          <div className="mb-6">
            <p className="text-4xl font-bold text-gray-900 dark:text-white mb-2 font-mono">
              {currentTime.toLocaleTimeString('id-ID', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })}
            </p>
            <p className="text-gray-600 dark:text-gray-400">Waktu Saat Ini</p>
          </div>

          {/* Off Day Message - Replaces Camera/Buttons if it is an off day */}
          {todayData?.isOffDay ? (
            <div className="p-6 bg-orange-50 dark:bg-orange-900/20 rounded-xl border border-orange-200 dark:border-orange-800 text-center">
              <div className="mb-4">
                <span className="text-4xl">🏖️</span>
              </div>
              <h3 className="text-xl font-bold text-orange-800 dark:text-orange-200 mb-2">
                Selamat Berlibur!
              </h3>
              <p className="text-gray-600 dark:text-gray-300 mb-6">
                Hari ini adalah jadwal libur Anda. Nikmati waktu istirahat Anda!
              </p>
              <div className="flex justify-center gap-4">
                <Button
                  variant="outline"
                  onClick={() => setShowOffDayModal(true)}
                  className="border-orange-300 text-orange-700 hover:bg-orange-100"
                >
                  📅 Ajukan Tukar Libur
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* Camera Section */}
              <div className="mb-6 flex flex-col items-center">
                {!todayData?.clockOut && (todayData?.canClockIn || todayData?.canClockOut) ? (
                  <div className="relative w-full max-w-sm aspect-video bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden border-2 border-dashed border-gray-300 dark:border-gray-600 mb-4">
                    <Webcam
                      audio={false}
                      ref={webcamRef}
                      screenshotFormat="image/jpeg"
                      className="w-full h-full object-cover"
                      videoConstraints={{ facingMode: "user" }}
                    />
                    <div className="absolute bottom-2 left-0 right-0 text-center">
                      <span className="text-xs text-white bg-black/50 px-2 py-1 rounded-full">
                        Pastikan wajah terlihat jelas
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="flex items-center justify-center gap-4">
                <Button
                  variant="primary"
                  size="lg"
                  onClick={handleClockIn}
                  disabled={!todayData?.canClockIn || actionLoading || !faceDetected}
                  loading={actionLoading}
                  className="min-w-[160px]"
                >
                  <Camera className="w-5 h-5 mr-2" />
                  Masuk (Selfie)
                </Button>

                <Button
                  variant={todayData?.clockOut ? 'secondary' : 'primary'}
                  size="lg"
                  onClick={handleClockOut}
                  disabled={!todayData?.canClockOut || actionLoading || !faceDetected}
                  loading={actionLoading}
                  className="min-w-[160px]"
                >
                  <Camera className="w-5 h-5 mr-2" />
                  Pulang (Selfie)
                </Button>
              </div>

              {!faceDetected && (todayData?.canClockIn || todayData?.canClockOut) && !loading && (
                <div className="mt-2 text-center text-red-500 text-sm font-medium animate-pulse bg-red-50 dark:bg-red-900/20 p-2 rounded-lg border border-red-100 dark:border-red-800">
                  ⚠️ Wajah tidak terdeteksi dengan jelas. <br />
                  Pastikan wajah terlihat penuh, pencahayaan cukup, dan tidak tertutup tangan/masker.
                </div>
              )}

              {todayData?.clockIn && (
                <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-100 dark:border-gray-600">
                  <p className="text-gray-700 dark:text-gray-300">
                    Anda absen masuk pada <span className="font-semibold text-gray-900 dark:text-white">{formatTime(todayData.clockIn)}</span>
                    {todayData.clockOut && (
                      <>
                        {' '}dan absen pulang pada <span className="font-semibold text-gray-900 dark:text-white">{formatTime(todayData.clockOut)}</span>
                      </>
                    )}
                  </p>
                  {todayData.status && (
                    <div className="mt-2">
                      <Badge status={todayData.status}>
                        {formatStatus(todayData.status)}
                      </Badge>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </Card>

      {/* Upcoming Schedule Widget */}
      {upcomingSchedule.length > 0 && (
        <Card className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border-blue-100 dark:border-blue-800">
          <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-3 flex items-center gap-2">
            <span className="bg-blue-100 dark:bg-blue-800 text-blue-600 dark:text-blue-200 p-1 rounded">📅</span>
            Jadwal 3 Hari Ke Depan
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {upcomingSchedule.map((schedule) => (
              <div key={schedule.date} className="bg-white dark:bg-gray-800 p-3 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col items-center text-center">
                <span className="text-xs uppercase font-bold text-gray-500 dark:text-gray-400 mb-1">
                  {new Date(schedule.date).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short' })}
                </span>

                {schedule.isOffDay ? (
                  <span className="text-red-600 dark:text-red-400 font-bold text-sm bg-red-50 dark:bg-red-900/20 px-2 py-1 rounded-full">
                    LIBUR
                  </span>
                ) : schedule.shift ? (
                  <>
                    <span className={`text-sm font-bold mb-1 ${schedule.shift.id === 1 ? 'text-blue-600' : 'text-orange-600'}`}>
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

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:col-span-3 md:grid-cols-3 gap-6">
        <Card className="p-6">
          <div className="text-center">
            <p className="text-3xl font-bold text-primary-600">
              {monthlySummary?.summary?.totalWorkingDays || '-'}
            </p>
            <p className="text-gray-600 dark:text-gray-400 mt-1">Hari Kerja Bulan Ini</p>
          </div>
        </Card>

        <Card className="p-6">
          <div className="text-center">
            <p className="text-3xl font-bold text-green-600 dark:text-green-400">
              {(monthlySummary?.summary?.presentDays || 0) +
                (monthlySummary?.summary?.lateDays || 0) +
                (monthlySummary?.summary?.halfDays || 0)}
            </p>
            <p className="text-gray-600 dark:text-gray-400 mt-1">Total Hadir</p>
          </div>
        </Card>

        <Card className="p-6">
          <div className="text-center">
            <p className="text-3xl font-bold text-amber-600 dark:text-amber-400">
              {monthlySummary?.summary?.lateDays || '-'}
            </p>
            <p className="text-gray-600 dark:text-gray-400 mt-1">Total Terlambat</p>
          </div>
        </Card>

        {/* Potongan Keterlambatan — menggantikan estimasi gaji */}
        <div className="md:col-span-3 lg:col-span-1">
          <LatePenaltyWidget compact />
        </div>

        {/* Leave Quota Card */}
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
          onSuccess={() => {
            showSuccess('Permintaan terkirim. Cek status di inbox.');
          }}
        />
      )}

      {showInboxModal && (
        <SwapInboxModal
          onClose={() => setShowInboxModal(false)}
        />
      )}

      {showOffDayModal && (
        <OffDayRequestModal
          onClose={() => setShowOffDayModal(false)}
          onSuccess={() => {
            setShowOffDayModal(false);
          }}
        />
      )}
    </div>
  );
};

export default DashboardPage;
