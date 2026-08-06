import { useState, useEffect } from 'react';
import Card from '../../components/shared/Card';
import Button from '../../components/shared/Button';
import { getTodayAttendance, clockIn, clockOut } from '../../services/attendanceService';
import { formatTime } from '../../utils/formatters';
import { toast } from 'react-hot-toast';

const DashboardPage = () => {
  const [todayData, setTodayData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchData = async () => {
    try {
      const data = await getTodayAttendance();
      setTodayData(data);
    } catch (err) {
      toast.error('Gagal memuat data absensi');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleClockIn = async () => {
    setActionLoading(true);
    try {
      await clockIn({ location: 'Office' });
      toast.success('Berhasil Clock In');
      fetchData();
    } catch (err) {
      toast.error(err.message || 'Gagal Clock In');
    } finally {
      setActionLoading(false);
    }
  };

  const handleClockOut = async () => {
    setActionLoading(true);
    try {
      await clockOut({ location: 'Office' });
      toast.success('Berhasil Clock Out');
      fetchData();
    } catch (err) {
      toast.error(err.message || 'Gagal Clock Out');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
      <Card>
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-semibold">Absensi Hari Ini</h2>
          <div className="space-x-4">
            {todayData?.canClockIn && (
              <Button onClick={handleClockIn} loading={actionLoading}>Clock In</Button>
            )}
            {todayData?.canClockOut && (
              <Button onClick={handleClockOut} loading={actionLoading} variant="secondary">Clock Out</Button>
            )}
          </div>
        
        {todayData && (
          <div className="mt-4">
            <p>Clock In: {todayData.clockIn ? formatTime(todayData.clockIn) : '-'}</p>
            <p>Clock Out: {todayData.clockOut ? formatTime(todayData.clockOut) : '-'}</p>
          </div>
        )}
      </Card>
    </div>
  );
};

export default DashboardPage;