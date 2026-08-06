import { useState, useEffect } from 'react';
import { bulkGenerateSchedule } from '../../services/scheduleService';
import { getAllShifts } from '../../services/shiftService';
import { getUsers } from '../../services/adminService';
import { showSuccess, showError } from '../../hooks/useToast';
import Button from '../shared/Button';

const BulkSchedulePanel = ({ onComplete }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [shifts, setShifts] = useState([]);
    const [users, setUsers] = useState([]);
    const [result, setResult] = useState(null);
    const [formData, setFormData] = useState({
        shiftId: '',
        startDate: '',
        endDate: '',
        keepOffDays: true,
        selectAll: true,
        selectedUserIds: [],
    });

    useEffect(() => {
        if (isOpen) {
            fetchData();
        }
    }, [isOpen]);

    const fetchData = async () => {
        try {
            const [shiftsRes, usersRes] = await Promise.all([
                getAllShifts(),
                getUsers({ limit: 100, status: 'active' }),
            ]);
            setShifts(shiftsRes.data.shifts || []);
            const employeeList = (usersRes.data?.users || []).filter(u => u.role === 'EMPLOYEE');
            setUsers(employeeList);
            setFormData(prev => ({
                ...prev,
                selectedUserIds: employeeList.map(u => u.id),
            }));
        } catch (err) {
            console.error('Failed to fetch data', err);
        }
    };

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        if (type === 'checkbox') {
            setFormData(prev => ({ ...prev, [name]: checked }));
            if (name === 'selectAll') {
                setFormData(prev => ({
                    ...prev,
                    selectAll: checked,
                    selectedUserIds: checked ? users.map(u => u.id) : [],
                }));
            }
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    };

    const toggleUser = (userId) => {
        setFormData(prev => {
            const ids = prev.selectedUserIds.includes(userId)
                ? prev.selectedUserIds.filter(id => id !== userId)
                : [...prev.selectedUserIds, userId];
            return { ...prev, selectedUserIds: ids, selectAll: ids.length === users.length };
        });
    };

    const handleSubmit = async () => {
        if (!formData.shiftId || !formData.startDate || !formData.endDate) {
            showError('Pilih shift, tanggal mulai, dan tanggal selesai');
            return;
        }
        if (formData.selectedUserIds.length === 0) {
            showError('Pilih minimal 1 karyawan');
            return;
        }

        setLoading(true);
        setResult(null);
        try {
            const payload = {
                userIds: formData.selectAll ? 'ALL' : formData.selectedUserIds,
                startDate: formData.startDate,
                endDate: formData.endDate,
                shiftId: parseInt(formData.shiftId),
                keepOffDays: formData.keepOffDays,
            };
            const res = await bulkGenerateSchedule(payload);
            setResult(res.data);
            showSuccess(res.message || 'Jadwal massal berhasil digenerate!');
            if (onComplete) onComplete();
        } catch (err) {
            showError(err.response?.data?.error?.message || 'Gagal generate jadwal massal');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) {
        return (
            <div className="mb-4">
                <button
                    onClick={() => setIsOpen(true)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-gradient-to-r from-indigo-700 to-slate-700 text-white rounded-lg shadow hover:from-indigo-800 hover:to-slate-800 transition-all"
                >
                    <div className="flex items-center gap-2">
                        <span className="text-lg">🌙</span>
                        <span className="font-semibold">Generate Jadwal Massal (Ramadhan)</span>
                    </div>
                    <span className="text-sm opacity-80">Klik untuk buka →</span>
                </button>
            </div>
        );
    }

    return (
        <div className="mb-4 bg-white dark:bg-gray-800 rounded-lg shadow-md border border-indigo-200 dark:border-indigo-900 overflow-hidden">
            {/* Header */}
            <div className="px-4 py-3 bg-gradient-to-r from-indigo-700 to-slate-700 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="text-lg">🌙</span>
                    <h3 className="font-semibold">Generate Jadwal Massal</h3>
                </div>
                <button onClick={() => { setIsOpen(false); setResult(null); }} className="text-white/80 hover:text-white text-xl">&times;</button>
            </div>

            <div className="p-4 space-y-4">
                {/* Shift Selection */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Pilih Shift
                    </label>
                    <select
                        name="shiftId"
                        value={formData.shiftId}
                        onChange={handleChange}
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    >
                        <option value="">-- Pilih Shift --</option>
                        {shifts.map(s => (
                            <option key={s.id} value={s.id}>
                                {s.name} ({s.startTime} - {s.endTime})
                            </option>
                        ))}
                    </select>
                </div>

                {/* Date Range */}
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Tanggal Mulai
                        </label>
                        <input
                            type="date"
                            name="startDate"
                            value={formData.startDate}
                            onChange={handleChange}
                            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Tanggal Selesai
                        </label>
                        <input
                            type="date"
                            name="endDate"
                            value={formData.endDate}
                            onChange={handleChange}
                            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                        />
                    </div>
                </div>

                {/* Keep Off Days */}
                <div className="flex items-center gap-2">
                    <input
                        type="checkbox"
                        id="keepOffDays"
                        name="keepOffDays"
                        checked={formData.keepOffDays}
                        onChange={handleChange}
                        className="rounded border-gray-300 text-amber-500 focus:ring-amber-500"
                    />
                    <label htmlFor="keepOffDays" className="text-sm text-gray-700 dark:text-gray-300">
                        Tetap hormati hari libur masing-masing karyawan
                    </label>
                </div>

                {/* User Selection */}
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Karyawan ({formData.selectedUserIds.length}/{users.length})
                        </label>
                        <label className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 cursor-pointer">
                            <input
                                type="checkbox"
                                name="selectAll"
                                checked={formData.selectAll}
                                onChange={handleChange}
                                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            Pilih Semua
                        </label>
                    </div>
                    <div className="max-h-32 overflow-y-auto border rounded-md p-2 dark:border-gray-600 space-y-1">
                        {users.map(u => (
                            <label key={u.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 px-1 py-0.5 rounded">
                                <input
                                    type="checkbox"
                                    checked={formData.selectedUserIds.includes(u.id)}
                                    onChange={() => toggleUser(u.id)}
                                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                />
                                <span className="text-gray-700 dark:text-gray-300">{u.fullName}</span>
                                <span className="text-xs text-gray-400">({u.department})</span>
                            </label>
                        ))}
                    </div>
                </div>

                {/* Result */}
                {result && (
                    <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-md p-3">
                        <p className="text-sm text-green-800 dark:text-green-300 font-medium">✅ Jadwal berhasil digenerate!</p>
                        <ul className="mt-1 text-xs text-green-600 dark:text-green-400 space-y-0.5">
                            <li>👥 {result.totalUsers} karyawan</li>
                            <li>📅 {result.totalDays} hari</li>
                            <li>📋 {result.totalSchedules} total jadwal</li>
                        </ul>
                    </div>
                )}

                {/* Submit */}
                <Button
                    onClick={handleSubmit}
                    loading={loading}
                    variant="primary"
                    className="w-full bg-gradient-to-r from-indigo-700 to-slate-700 hover:from-indigo-800 hover:to-slate-800"
                >
                    🌙 Generate Jadwal Massal
                </Button>
            </div>
        </div>
    );
};

export default BulkSchedulePanel;
