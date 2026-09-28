import { useState } from 'react';
import { ChefHat, Download } from 'lucide-react';
import html2canvas from 'html2canvas';
import Card from '../../components/shared/Card';
import Button from '../../components/shared/Button';
import Modal from '../../components/shared/Modal';
import api from '../../services/api';
import { showSuccess, showError } from '../../hooks/useToast';
import ScheduleCalendar from '../../components/admin/ScheduleCalendar';
import BulkSchedulePanel from '../../components/admin/BulkSchedulePanel';
import ClosingSetupPanel from '../../components/admin/ClosingSetupPanel';

const ScheduleManagementPage = () => {
    // Satu-satunya aksi di halaman ini: acak ulang jobdesk untuk hari yang sudah
    // berjalan (mis. ada staff sakit). Generate jadwal dipindah ke Posisi & Rotasi.
    const [showRedistributeModal, setShowRedistributeModal] = useState(false);
    const [redistributeDate, setRedistributeDate] = useState('');
    const [redistributeLoading, setRedistributeLoading] = useState(false);

    const handleRedistribute = async (e) => {
        e.preventDefault();
        if (!redistributeDate) return showError('Pilih tanggal dulu');
        setRedistributeLoading(true);
        try {
            await api.post('/schedules/redistribute-stations', { date: redistributeDate });
            showSuccess('Job Desk harian berhasil diacak ulang (Redistribusi)');
            setShowRedistributeModal(false);
            setRedistributeDate('');
        } catch (error) {
            showError(error.response?.data?.message || 'Gagal redistribusi station');
        } finally {
            setRedistributeLoading(false);
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
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-sm font-semibold text-amber-800">
                    Halaman ini sekarang hanya untuk melihat jadwal
                </p>
                <p className="text-xs text-amber-700 mt-1">
                    Tombol <b>Distribusi Kitchen</b>, <b>Generate Jadwal</b> (per pegawai), dan
                    <b> Rotasi Role</b> sudah dihapus karena hasilnya sama dengan menu
                    {' '}<b>Posisi &amp; Rotasi</b> dan saling menimpa. Pakai menu itu untuk
                    me-generate jadwal. Yang masih tersedia di sini: kalender, setup closing,
                    dan Generate Jadwal Massal.
                </p>
            </div>
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Manajemen Jadwal</h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">Lihat jadwal, atur closing, dan libur pegawai</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="warning" onClick={() => setShowRedistributeModal(true)}>
                        <ChefHat className="w-4 h-4 mr-2" />
                        Redistribusi Jobdesk
                    </Button>
                    <Button variant="outline" onClick={handleDownloadImage}>
                        <Download className="w-4 h-4 mr-2" />
                        Download Gambar
                    </Button>
                </div>
            </div>

            <ClosingSetupPanel />

            <BulkSchedulePanel />

            <Card>
                <div className="p-4" id="schedule-calendar-container">
                    <ScheduleCalendar />
                </div>
            </Card>

            {/* Modal Redistribusi Jobdesk (aplikasi closing, bukan generate jadwal) */}
            <Modal
                isOpen={showRedistributeModal}
                onClose={() => setShowRedistributeModal(false)}
                title="Redistribusi Jobdesk Closing"
            >
                <form onSubmit={handleRedistribute} className="space-y-4">
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                        Untuk keadaan darurat, mis. ada pegawai sakit mendadak. Sistem mengacak ulang
                        jobdesk closing untuk pegawai yang masuk pada tanggal itu saja — tidak
                        mengubah shift pagi/siang.
                    </p>
                    <div className="flex gap-2">
                        <input
                            type="date"
                            required
                            className="flex-1 rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                            value={redistributeDate}
                            onChange={(e) => setRedistributeDate(e.target.value)}
                        />
                        <Button type="submit" variant="warning" loading={redistributeLoading}>
                            Acak Ulang
                        </Button>
                    </div>
                </form>
            </Modal>
        </div >
    );
};

export default ScheduleManagementPage;
