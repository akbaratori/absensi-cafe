import AttendanceRecapPanel from '../../components/admin/AttendanceRecapPanel';

/**
 * Rekap Absensi (admin) — halaman periode fleksibel.
 *
 * Tampilannya sendiri ada di `AttendanceRecapPanel`, komponen yang sama dipakai
 * halaman lain tanpa menduplikasi logika atau rumus angkanya.
 */
const AttendanceRecapPage = () => (
    <div className="space-y-6">
        <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Rekap Absensi</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
                Rekap kehadiran seluruh pegawai dengan periode bebas — harian, mingguan, bulanan, atau rentang tanggal sendiri.
            </p>
        </div>

        <AttendanceRecapPanel />
    </div>
);

export default AttendanceRecapPage;
