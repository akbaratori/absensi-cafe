import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import Button from '../../components/shared/Button';
import Input from '../../components/shared/Input';
import { createSwapRequest } from '../../services/swapService';
import { getAllSchedules } from '../../services/scheduleService';
import { useAuth } from '../../contexts/AuthContext';
import { showSuccess, showError } from '../../hooks/useToast';

const SwapRequestModal = ({ onClose, onSuccess }) => {
    const { user } = useAuth();
    const [formData, setFormData] = useState({
        targetUserId: '',
        date: '',
        reason: ''
    });
    const [potentialTargets, setPotentialTargets] = useState([]);
    const [loadingTargets, setLoadingTargets] = useState(false);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const fetchSchedulesForDate = async () => {
            if (!formData.date || !user) return;

            setLoadingTargets(true);
            try {
                // Fetch all schedules for this specific date
                const response = await getAllSchedules({
                    startDate: formData.date,
                    endDate: formData.date
                });

                // Filter out current user and map relevant info
                // Filter logic: Show everyone else who has a schedule entry for this day
                // or maybe we want to show all employees? 
                // scheduleService.getAllSchedules returns UserSchedule records.
                // If a user doesn't have a schedule generated, they won't appear.这是个限制 for swapping OFF days.
                // But generally initialized users have schedules.

                const targets = (response.data.data || [])
                    .filter(s => s.userId !== user.id)
                    .map(s => ({
                        userId: s.userId,
                        fullName: s.user.fullName,
                        shiftName: s.isOffDay ? 'Libur' : (s.shift?.name || 'Shift ?'),
                        isOffDay: s.isOffDay
                    }));

                setPotentialTargets(targets);

                // Reset selected target if not in new list
                setFormData(prev => ({ ...prev, targetUserId: '' }));
            } catch (error) {
                console.error("Failed to fetch schedules", error);
                showError("Gagal memuat jadwal rekan kerja.");
            } finally {
                setLoadingTargets(false);
            }
        };

        const timeoutId = setTimeout(() => {
            if (formData.date) fetchSchedulesForDate();
        }, 300); // Debounce slightly

        return () => clearTimeout(timeoutId);
    }, [formData.date, user]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await createSwapRequest(formData);
            showSuccess('Permintaan tukar shift berhasil dikirim!');
            onSuccess();
            onClose();
        } catch (error) {
            showError(error.response?.data?.error?.message || 'Gagal mengirim permintaan');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md overflow-hidden">
                <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-700">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                        Ajukan Tukar Shift
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-500">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-4 space-y-4">
                    {/* 1. Select Date First */}
                    <Input
                        label="Pilih Tanggal Tukar"
                        type="date"
                        value={formData.date}
                        onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                        required
                        helperText="Pilih tanggal terlebih dahulu untuk melihat rekan yang tersedia."
                    />

                    {/* 2. Select Colleague */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Pilih Teman
                        </label>
                        <select
                            className="w-full rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 focus:ring-primary-500 focus:border-primary-500 disabled:opacity-50 disabled:bg-gray-100 dark:disabled:bg-gray-800"
                            value={formData.targetUserId}
                            onChange={(e) => setFormData({ ...formData, targetUserId: e.target.value })}
                            required
                            disabled={!formData.date || loadingTargets}
                        >
                            <option value="">
                                {loadingTargets
                                    ? "Memuat jadwal..."
                                    : (!formData.date ? "-- Pilih Tanggal Dulu --" : "-- Pilih Rekan Kerja --")}
                            </option>
                            {potentialTargets.map(t => (
                                <option key={t.userId} value={t.userId}>
                                    {t.fullName} — {t.shiftName}
                                </option>
                            ))}
                        </select>
                        {formData.date && !loadingTargets && potentialTargets.length === 0 && (
                            <p className="text-xs text-orange-500 mt-1">Tidak ada rekan kerja lain yang ditemukan pada tanggal ini.</p>
                        )}
                    </div>

                    {/* 3. Reason */}
                    <div className="space-y-1">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Alasan
                        </label>
                        <textarea
                            className="w-full rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-primary-500 focus:border-primary-500 p-2"
                            rows="3"
                            value={formData.reason}
                            onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                            placeholder="Contoh: Ada acara keluarga penting..."
                            required
                        />
                    </div>

                    <div className="pt-2">
                        <Button type="submit" variant="primary" className="w-full" loading={loading} disabled={!formData.targetUserId}>
                            Kirim Permintaan
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default SwapRequestModal;
