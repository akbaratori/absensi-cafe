import { useState, useEffect } from 'react';
import { Calendar, User, ChefHat, Download } from 'lucide-react';
import html2canvas from 'html2canvas';
import Card from '../../components/shared/Card';
import Button from '../../components/shared/Button';
import Modal from '../../components/shared/Modal';
import { getUsers } from '../../services/adminService';
import { generateSchedule, distributeKitchenShifts, checkConflicts } from '../../services/scheduleService';
import api from '../../services/api';
import { showSuccess, showError } from '../../hooks/useToast';
import ScheduleCalendar from '../../components/admin/ScheduleCalendar';
import StationSummaryPanel from '../../components/admin/StationSummaryPanel';
import BulkSchedulePanel from '../../components/admin/BulkSchedulePanel';
import ClosingTodayWidget from '../../components/admin/ClosingTodayWidget';

const ScheduleManagementPage = () => {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showGenerateModal, setShowGenerateModal] = useState(false);
    const [showKitchenModal, setShowKitchenModal] = useState(false);
    const [formData, setFormData] = useState({
        userId: '',
        startDate: new Date().toISOString().split('T')[0],
        months: 3,
        baseOffDay: '0', // Sunday
        shiftPattern: '1,2', // Default: Shift 1, Shift 2
        rotateOffDay: true
    });
    const [kitchenMonth, setKitchenMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
    const [generateLoading, setGenerateLoading] = useState(false);
    const [conflicts, setConflicts] = useState([]);
    const [showConflictModal, setShowConflictModal] = useState(false);

    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        try {
            const response = await getUsers({ limit: 100 });
            setUsers(response.data.users);
        } catch (error) {
            console.error('Failed to fetch users:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleGenerate = async (e) => {
        e.preventDefault();
        setGenerateLoading(true);

        try {
            // 1. Check for conflicts first
            // 1. Check for conflicts first
            const response = await checkConflicts({
                ...formData,
                userId: parseInt(formData.userId),
                months: parseInt(formData.months),
                baseOffDay: parseInt(formData.baseOffDay)
            });

            const conflictData = response.data || {};

            // If conflicts exist (object with keys), show modal
            if (Object.keys(conflictData).length > 0) {
                setConflicts(conflictData);
                setShowConflictModal(true);
                setGenerateLoading(false);
                return;
            }

            // 2. No conflicts, proceed to generate
            await processGenerateSchedule();
        } catch (error) {
            showError(error.response?.data?.message || 'Gagal mengecek konflik jadwal');
            setGenerateLoading(false);
        }
    };

    const processGenerateSchedule = async () => {
        try {
            setGenerateLoading(true);
            // Parse shift pattern
            const shiftPatternArray = formData.shiftPattern.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));

            await generateSchedule({
                ...formData,
                userId: parseInt(formData.userId),
                shiftPattern: shiftPatternArray
            });

            showSuccess('Jadwal berhasil digenerate!');
            setShowGenerateModal(false);
            setShowConflictModal(false);
        } catch (error) {
            showError(error.response?.data?.message || 'Gagal generate jadwal');
        } finally {
            setGenerateLoading(false);
        }
    };



    const handleRedistribute = async (e) => {
        e.preventDefault();
        setGenerateLoading(true);
        try {
            const { redistributeDate } = formData;
            if (!redistributeDate) return showError('Pilih tanggal dulu');

            await api.post('/schedules/redistribute-stations', { date: redistributeDate });
            showSuccess('Job Desk harian berhasil diacak ulang (Redistribusi)');
            setShowKitchenModal(false);
        } catch (error) {
            showError(error.response?.data?.message || 'Gagal redistribusi station');
        } finally {
            setGenerateLoading(false);
        }
    };

    const handleDistributeKitchen = async (e) => {
        e.preventDefault();
        setGenerateLoading(true);
        try {
            await distributeKitchenShifts(kitchenMonth);
            showSuccess('Shift Kitchen berhasil didistribusikan (2x Shift 2 per orang)');

            setShowKitchenModal(false);
        } catch (error) {
            showError(error.response?.data?.message || 'Gagal distribusi shift');
        } finally {
            setGenerateLoading(false);
        }
    };

    const handleAssignStations = async () => {
        setGenerateLoading(true);
        try {
            // Call new endpoint
            await api.post('/schedules/assign-stations', { month: kitchenMonth });
            showSuccess('Rotasi Role (A-E) berhasil digenerate ulang!');
            setShowKitchenModal(false);
        } catch (error) {
            showError(error.response?.data?.message || 'Gagal generate rotasi role');
        } finally {
            setGenerateLoading(false);
        }
    };

    const handleDownloadImage = async () => {
        // Target the specific inner calendar div
        const element = document.getElementById('print-area-calendar');
        if (!element) {
            showError('Area kalender tidak ditemukan');
            return;
        }

        try {
            showSuccess('Sedang memproses gambar berkualitas tinggi...');
            const canvas = await html2canvas(element, {
                scale: 3, // High resolution (3x)
                backgroundColor: '#ffffff',
                logging: false,
                useCORS: true
            });

            const link = document.createElement('a');
            link.download = `Jadwal-Cafe-${new Date().toISOString().split('T')[0]}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
            showSuccess('Gambar berhasil didownload');
        } catch (error) {
            console.error('Export Error:', error);
            showError('Gagal mendownload gambar');
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Manajemen Jadwal</h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">Atur rolling shift dan libur pegawai</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={handleDownloadImage}>
                        <Download className="w-4 h-4 mr-2" />
                        Download Gambar
                    </Button>
                    <Button variant="outline" onClick={() => setShowKitchenModal(true)}>
                        <ChefHat className="w-4 h-4 mr-2" />
                        Distribusi Kitchen
                    </Button>
                    <Button onClick={() => setShowGenerateModal(true)}>
                        <Calendar className="w-4 h-4 mr-2" />
                        Generate Jadwal
                    </Button>
                </div>
            </div>

            <ClosingTodayWidget />

            <BulkSchedulePanel />

            <StationSummaryPanel />

            <Card>
                <div className="p-4" id="schedule-calendar-container">
                    <ScheduleCalendar />
                </div>
            </Card>

            {/* Modal General Schedule */}
            <Modal
                isOpen={showGenerateModal}
                onClose={() => setShowGenerateModal(false)}
                title="Generate Rolling Schedule"
            >
                <form onSubmit={handleGenerate} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Pegawai
                        </label>
                        <select
                            className="w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 focus:border-primary-500 focus:ring-primary-500"
                            value={formData.userId}
                            onChange={(e) => setFormData({ ...formData, userId: e.target.value })}
                            required
                        >
                            <option value="">Pilih Pegawai</option>
                            {users.map((user) => (
                                <option key={user.id} value={user.id}>{user.fullName}</option>
                            ))}
                        </select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Tanggal Mulai
                            </label>
                            <input
                                type="date"
                                className="w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 focus:border-primary-500 focus:ring-primary-500"
                                value={formData.startDate}
                                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Durasi (Bulan)
                            </label>
                            <input
                                type="number"
                                min="1"
                                max="12"
                                className="w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 focus:border-primary-500 focus:ring-primary-500"
                                value={formData.months}
                                onChange={(e) => setFormData({ ...formData, months: e.target.value })}
                                required
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Pola Shift (ID dipisah koma)
                        </label>
                        <input
                            type="text"
                            placeholder="Contoh: 1,2 (Shift 1 minggu ini, lalu Shift 2 minggu depan)"
                            className="w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 focus:border-primary-500 focus:ring-primary-500"
                            value={formData.shiftPattern}
                            onChange={(e) => setFormData({ ...formData, shiftPattern: e.target.value })}
                            required
                        />
                        <p className="text-xs text-gray-500 mt-1">ID 1 = Pagi, ID 2 = Siang</p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Hari Libur Awal
                        </label>
                        <select
                            className="w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 focus:border-primary-500 focus:ring-primary-500"
                            value={formData.baseOffDay}
                            onChange={(e) => setFormData({ ...formData, baseOffDay: e.target.value })}
                        >
                            <option value="-1">Tidak Ada Libur (Masuk Terus)</option>
                            <option value="-2">Libur Sebulan Penuh (Full OFF)</option>
                            <option value="-99">Hapus Jadwal (Tidak Tampil)</option>
                            <option value="0">Minggu</option>
                            <option value="1">Senin</option>
                            <option value="2">Selasa</option>
                            <option value="3">Rabu</option>
                            <option value="4">Kamis</option>
                            <option value="5">Jumat</option>
                            <option value="6">Sabtu</option>
                        </select>
                    </div>

                    <div className="flex items-center">
                        <input
                            type="checkbox"
                            id="rotateOffDay"
                            className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                            checked={formData.rotateOffDay}
                            onChange={(e) => setFormData({ ...formData, rotateOffDay: e.target.checked })}
                        />
                        <label htmlFor="rotateOffDay" className="ml-2 block text-sm text-gray-900 dark:text-gray-300">
                            Rotasi Libur Bulanan (+1 hari tiap bulan)
                        </label>
                    </div>

                    <div className="pt-4 flex justify-end gap-3">
                        <Button variant="outline" type="button" onClick={() => setShowGenerateModal(false)}>
                            Batal
                        </Button>
                        <Button type="submit" loading={generateLoading}>
                            Generate
                        </Button>
                    </div>
                </form>
            </Modal>

            {/* Modal Kitchen Distribution */}
            <Modal
                isOpen={showKitchenModal}
                onClose={() => setShowKitchenModal(false)}
                title="Distribusi Shift Kitchen"
            >
                <form onSubmit={handleDistributeKitchen} className="space-y-4">
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                        Otomatis mengatur jadwal Shift Department Kitchen dengan sistem <b>Rotasi Harian (Daily Rolling)</b>:
                        <br />- <b>Shift 1 (Pagi)</b>: 2 Orang
                        <br />- <b>Shift 2 (Siang)</b>: 3 Orang
                        <br />- Posisi berputar setiap hari agar pembagian shift lebih adil dan merata dalam sebulan.
                    </p>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Bulan Target
                        </label>
                        <input
                            type="month"
                            className="w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 focus:border-primary-500 focus:ring-primary-500"
                            value={kitchenMonth}
                            onChange={(e) => setKitchenMonth(e.target.value)}
                            required
                        />
                    </div>

                    <div className="pt-4 flex flex-col gap-3">
                        <Button type="submit" loading={generateLoading}>
                            Generate Shift (Pagi/Siang)
                        </Button>

                        <div className="relative flex items-center">
                            <div className="flex-grow border-t border-gray-300 dark:border-gray-600"></div>
                            <span className="flex-shrink-0 mx-4 text-gray-400 text-xs">ATAU HANYA ROTASI ROLE</span>
                            <div className="flex-grow border-t border-gray-300 dark:border-gray-600"></div>
                        </div>

                        <Button
                            type="button"
                            variant="warning"
                            loading={generateLoading}
                            onClick={handleAssignStations}
                        >
                            Generate Rotasi Role (A-E) Saja
                        </Button>
                        <p className="text-xs text-gray-500 text-center">
                            Gunakan ini jika Shift Pagi/Siang sudah benar, tapi ingin mengacak ulang role (Main Cook, dll) sesuai aturan rotasi baru.
                        </p>
                    </div>
                </form>

                <div className="border-t border-gray-200 dark:border-gray-700 my-4 pt-4">
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Darurat / Redistribusi Harian</h3>
                    <p className="text-xs text-gray-500 mb-3">
                        Gunakan ini jika ada pegawai yang sakit mendadak. Sistem akan mengacak ulang Job Desk untuk pegawai yang masuk hari ini.
                    </p>
                    <div className="flex gap-2">
                        <input
                            type="date"
                            className="flex-1 rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 text-sm"
                            onChange={(e) => setFormData(prev => ({ ...prev, redistributeDate: e.target.value }))}
                        />
                        <Button
                            variant="warning"
                            onClick={handleRedistribute}
                            disabled={generateLoading || !formData.redistributeDate}
                        >
                            Acak Ulang Hari Ini
                        </Button>
                    </div>
                </div>


            </Modal>

            {/* Modal Conflict Warning */}
            <Modal
                isOpen={showConflictModal}
                onClose={() => setShowConflictModal(false)}
                title="Peringatan Konflik Jadwal"
            >
                <div className="space-y-4">
                    <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <p className="text-sm text-yellow-800 font-medium">
                            Terdapat bentrok jadwal libur dengan pegawai lain di departemen yang sama.
                        </p>
                    </div>

                    <div className="max-h-60 overflow-y-auto space-y-2">
                        {Object.entries(conflicts).map(([date, names]) => (
                            <div key={date} className="flex justify-between items-center text-sm border-b border-gray-100 pb-2">
                                <span className="font-medium text-gray-700">{new Date(date).toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
                                <span className="text-gray-500 text-right">{names.join(', ')}</span>
                            </div>
                        ))}
                    </div>

                    <p className="text-sm text-gray-600">
                        Apakah Anda ingin tetap memproses jadwal ini?
                    </p>

                    <div className="pt-4 flex justify-end gap-3">
                        <Button variant="outline" onClick={() => setShowConflictModal(false)}>
                            Batal
                        </Button>
                        <Button onClick={processGenerateSchedule} loading={generateLoading}>
                            Ya, Lanjutkan
                        </Button>
                    </div>
                </div>
            </Modal>
        </div >
    );
};

export default ScheduleManagementPage;
