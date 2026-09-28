import { useEffect, useMemo, useState } from 'react';
import { CalendarRange, UserCog, X } from 'lucide-react';
import Modal from '../shared/Modal';
import Button from '../shared/Button';
import { getUsers } from '../../services/adminService';
import { updateUserShiftRange } from '../../services/scheduleService';
import { showSuccess, showError } from '../../hooks/useToast';

/**
 * Panel "Ubah Shift Pegawai" — jalur cepat untuk memindahkan SATU pegawai ke
 * shift tertentu pada satu tanggal atau satu rentang tanggal.
 *
 * Kenapa dipisah dari klik-sel di tabel jadwal:
 *  - tabel jadwal hanya menampilkan pegawai yang sudah punya baris jadwal, jadi
 *    menambah orang di tanggal yang belum ter-generate butuh cara lain;
 *  - mengubah shift untuk sepekan/rentang lewat sel berarti klik satu-satu, dan
 *    mudah ada hari yang terlewat.
 *
 * Perhitungan tanggal memakai UTC agar sama dengan cara kalender di halaman ini
 * menghitung hari, sehingga "1 s/d 7" tidak bergeser sehari.
 *
 * @param {Object}   props
 * @param {Array}    props.shifts     - hasil `getAllShifts()` (id, name, startTime, endTime)
 * @param {string}   props.rangeStart - "YYYY-MM-DD" default, ikut tampilan aktif
 * @param {string}   props.rangeEnd   - "YYYY-MM-DD" default
 * @param {Function} props.onSaved    - dipanggil setelah berhasil agar halaman memuat ulang
 */
const EmployeeShiftEditor = ({ shifts = [], rangeStart, rangeEnd, onSaved }) => {
    const [open, setOpen] = useState(false);
    const [users, setUsers] = useState([]);
    const [usersLoading, setUsersLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    const [userId, setUserId] = useState('');
    const [shiftId, setShiftId] = useState('');
    const [isOff, setIsOff] = useState(false);
    const [startDate, setStartDate] = useState(rangeStart || '');
    const [endDate, setEndDate] = useState(rangeEnd || '');

    // Daftar pegawai diambil hanya saat panel dibuka — halaman jadwal tidak
    // perlu menanggung request ini kalau tombolnya tidak dipakai. `role=EMPLOYEE`
    // supaya akun admin tidak ikut muncul di pilihan jadwal shift.
    useEffect(() => {
        if (!open || users.length) return;
        setUsersLoading(true);
        getUsers({ limit: 500, status: 'active', role: 'EMPLOYEE' })
            .then((res) => setUsers(res?.data?.users || []))
            .catch(() => showError('Gagal memuat daftar pegawai'))
            .finally(() => setUsersLoading(false));
    }, [open, users.length]);

    // Rentang default ikut tampilan aktif (minggu/bulan) selama panel tertutup.
    useEffect(() => {
        if (open) return;
        setStartDate(rangeStart || '');
        setEndDate(rangeEnd || '');
    }, [rangeStart, rangeEnd, open]);

    /** Jumlah hari yang akan tersentuh — dipakai untuk ringkasan & tombol simpan. */
    const dayCount = useMemo(() => {
        if (!startDate || !endDate) return 0;
        const a = new Date(`${startDate}T00:00:00Z`).getTime();
        const b = new Date(`${endDate}T00:00:00Z`).getTime();
        if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 0;
        return Math.floor((b - a) / 86400000) + 1;
    }, [startDate, endDate]);

    const selectedUser = users.find((u) => String(u.id) === String(userId));
    const selectedShift = shifts.find((s) => String(s.id) === String(shiftId));

    // Prefill shift tujuan dari shift default pegawai (`users.shiftId`) supaya
    // kasus tersering — "orang ini pindah ke shift lain, bukan shift defaultnya"
    // — cukup diubah satu dropdown, tidak dari kosong.
    useEffect(() => {
        if (!userId || isOff) return;
        const u = users.find((x) => String(x.id) === String(userId));
        if (u?.shiftId) setShiftId((prev) => prev || String(u.shiftId));
    }, [userId, users, isOff]);

    const reset = () => {
        setUserId('');
        setShiftId('');
        setIsOff(false);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!userId) { showError('Pilih pegawai dulu'); return; }
        if (!startDate) { showError('Pilih tanggal mulai'); return; }
        if (!isOff && !shiftId) { showError('Pilih shift tujuan atau tandai libur'); return; }
        if (dayCount === 0) { showError('Rentang tanggal tidak valid'); return; }

        setSaving(true);
        try {
            const res = await updateUserShiftRange({
                userId: Number(userId),
                startDate,
                endDate: endDate || startDate,
                shiftId: isOff ? null : Number(shiftId),
                isOffDay: isOff,
            });

            const changed = res?.data?.daysAffected ?? dayCount;
            const who = selectedUser?.fullName || 'Pegawai';
            showSuccess(
                isOff
                    ? `${who} ditandai libur ${changed} hari`
                    : `${who} → ${selectedShift?.name || 'shift'} selama ${changed} hari`
            );
            setOpen(false);
            reset();
            if (onSaved) onSaved();
        } catch (err) {
            showError(err?.response?.data?.message || 'Gagal mengubah jadwal pegawai');
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium shadow-sm transition-colors inline-flex items-center gap-1.5"
            >
                <UserCog className="w-4 h-4" />
                Ubah Shift Pegawai
            </button>

            <Modal isOpen={open} onClose={() => setOpen(false)} title="Ubah Shift Pegawai">
                <form onSubmit={handleSubmit} className="space-y-4">
                    <p className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                        Pilih pegawai, shift tujuan, lalu rentang tanggal. Tanggal yang belum punya
                        jadwal akan dibuatkan otomatis, dan tanda libur manual pada hari itu dicabut
                        karena pegawai dinyatakan masuk.
                    </p>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Pegawai</label>
                        <select
                            value={userId}
                            onChange={(e) => setUserId(e.target.value)}
                            className="w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 focus:border-blue-500 focus:ring-blue-500 text-sm"
                            required
                        >
                            <option value="">{usersLoading ? 'Memuat pegawai...' : '-- Pilih Pegawai --'}</option>
                            {users.map((u) => (
                                <option key={u.id} value={u.id}>
                                    {u.fullName}{u.department ? ` — ${u.department}` : ''}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            id="employeeShiftIsOff"
                            checked={isOff}
                            onChange={(e) => setIsOff(e.target.checked)}
                            className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 h-4 w-4"
                        />
                        <label htmlFor="employeeShiftIsOff" className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
                            Tandai LIBUR pada rentang ini (bukan pindah shift)
                        </label>
                    </div>

                    {!isOff && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Shift Tujuan</label>
                            <select
                                value={shiftId}
                                onChange={(e) => setShiftId(e.target.value)}
                                className="w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 focus:border-blue-500 focus:ring-blue-500 text-sm"
                                required
                            >
                                <option value="">-- Pilih Shift --</option>
                                {shifts.map((s) => (
                                    <option key={s.id} value={s.id}>
                                        {s.name} ({s.startTime} - {s.endTime})
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Dari Tanggal</label>
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 text-sm"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Sampai Tanggal</label>
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                min={startDate}
                                className="w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 text-sm"
                            />
                        </div>
                    </div>

                    <div className="flex items-start gap-2 text-xs text-gray-600 dark:text-gray-300 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                        <CalendarRange className="w-4 h-4 flex-shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" />
                        <span>
                            {dayCount > 0 ? (
                                <>
                                    <b>{dayCount} hari</b> akan diubah
                                    {selectedUser ? ` untuk ${selectedUser.fullName}` : ''}
                                    {isOff ? ' menjadi libur' : selectedShift ? ` ke ${selectedShift.name}` : ''}.
                                </>
                            ) : (
                                'Rentang tanggal belum lengkap.'
                            )}
                        </span>
                    </div>

                    <div className="pt-2 flex justify-end gap-2 border-t border-gray-200 dark:border-gray-700">
                        <Button variant="secondary" type="button" onClick={() => setOpen(false)}>
                            <X className="w-4 h-4" />
                            Batal
                        </Button>
                        <Button type="submit" loading={saving} disabled={dayCount === 0}>
                            Simpan Perubahan
                        </Button>
                    </div>
                </form>
            </Modal>
        </>
    );
};

export default EmployeeShiftEditor;

