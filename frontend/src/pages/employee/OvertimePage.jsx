import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Plus, Clock, X } from 'lucide-react';
import api from '../../services/api';
import Card from '../../components/shared/Card';
import Button from '../../components/shared/Button';
import { showSuccess, showError } from '../../hooks/useToast';

const OvertimePage = () => {
    const [overtimes, setOvertimes] = useState([]);
    const [summary, setSummary] = useState({ totalHours: 0, totalRequests: 0 });
    const [showModal, setShowModal] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const { register, handleSubmit, reset, formState: { errors } } = useForm();

    useEffect(() => {
        fetchOvertimes();
        fetchSummary();
    }, []);

    const fetchOvertimes = async () => {
        try {
            const response = await api.get('/overtime/my');
            setOvertimes(response.data.data.records);
        } catch (error) {
            console.error('Failed to fetch overtime', error);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchSummary = async () => {
        try {
            const month = new Date().toISOString().slice(0, 7);
            const response = await api.get('/overtime/my/summary', { params: { month } });
            setSummary(response.data.data);
        } catch (error) {
            console.error('Failed to fetch overtime summary', error);
        }
    };

    const onSubmit = async (data) => {
        // Combine date with start/end times into ISO strings
        const startTime = new Date(`${data.date}T${data.startTime}:00+08:00`).toISOString();
        const endTime = new Date(`${data.date}T${data.endTime}:00+08:00`).toISOString();

        try {
            await api.post('/overtime', {
                date: data.date,
                startTime,
                endTime,
                reason: data.reason,
            });
            setShowModal(false);
            reset();
            fetchOvertimes();
            fetchSummary();
            showSuccess('Pengajuan lembur berhasil dikirim');
        } catch (error) {
            const message = error.response?.data?.error?.message || error.message || 'Gagal mengirim pengajuan lembur';
            showError(message);
        }
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'APPROVED': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
            case 'REJECTED': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
            default: return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
        }
    };

    const formatDateTime = (iso) => {
        return new Date(iso).toLocaleString('id-ID', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Lembur (Overtime)</h1>
                    <p className="text-gray-600 dark:text-gray-400">Ajukan dan pantau lembur kamu</p>
                </div>
                <Button onClick={() => setShowModal(true)}>
                    <Plus className="w-5 h-5" />
                    <span>Ajukan Lembur</span>
                </Button>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Card>
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-primary-50 dark:bg-primary-900/20 rounded-xl">
                            <Clock className="w-6 h-6 text-primary-600 dark:text-primary-400" />
                        </div>
                        <div>
                            <p className="text-sm text-gray-500 dark:text-gray-400">Total Jam Lembur (Bulan Ini)</p>
                            <p className="text-2xl font-bold text-gray-900 dark:text-white">{summary.totalHours} jam</p>
                        </div>
                </Card>
                <Card>
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-xl">
                            <Clock className="w-6 h-6 text-green-600 dark:text-green-400" />
                        </div>
                        <div>
                            <p className="text-sm text-gray-500 dark:text-gray-400">Pengajuan Disetujui (Bulan Ini)</p>
                            <p className="text-2xl font-bold text-gray-900 dark:text-white">{summary.totalRequests} pengajuan</p>
                        </div>
                </Card>
            </div>

            {/* Overtime History */}
            <Card>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-800">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Tanggal</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Jam Mulai</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Jam Selesai</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Durasi</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Alasan</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                            {isLoading ? (
                                <tr>
                                    <td colSpan="6" className="px-6 py-4 text-center text-gray-500 dark:text-gray-400">
                                        Memuat data...
                                    </td>
                                </tr>
                            ) : overtimes.length === 0 ? (
                                <tr>
                                    <td colSpan="6" className="px-6 py-4 text-center text-gray-500 dark:text-gray-400">
                                        Belum ada pengajuan lembur.
                                    </td>
                                </tr>
                            ) : (
                                overtimes.map((ot) => (
                                    <tr key={ot.id}>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                                            {new Date(ot.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                            {new Date(ot.startTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                            {new Date(ot.endTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                            {ot.durationHours} jam
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                                            {ot.reason || '-'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(ot.status)}`}>
                                                {ot.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            {/* Create Overtime Modal */}
            {showModal && (
                <div className="fixed inset-0 z-50 overflow-y-auto">
                    <div className="flex items-center justify-center min-h-screen px-4">
                        <div className="fixed inset-0 bg-black bg-opacity-50" onClick={() => setShowModal(false)} />
                        <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-lg w-full p-6">
                            <div className="flex justify-between items-center mb-6">
                                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Ajukan Lembur</h2>
                                <button onClick={() => setShowModal(false)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
                                    <X className="w-5 h-5 text-gray-500" />
                                </button>
                            </div>

                            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        Tanggal
                                    </label>
                                    <input
                                        type="date"
                                        {...register('date', { required: 'Tanggal wajib diisi' })}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    />
                                    {errors.date && <p className="mt-1 text-sm text-red-600">{errors.date.message}</p>}
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                            Jam Mulai
                                        </label>
                                        <input
                                            type="time"
                                            {...register('startTime', { required: 'Jam mulai wajib diisi' })}
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        />
                                        {errors.startTime && <p className="mt-1 text-sm text-red-600">{errors.startTime.message}</p>}
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                            Jam Selesai
                                        </label>
                                        <input
                                            type="time"
                                            {...register('endTime', { required: 'Jam selesai wajib diisi' })}
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        />
                                        {errors.endTime && <p className="mt-1 text-sm text-red-600">{errors.endTime.message}</p>}
                                    </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        Alasan
                                    </label>
                                    <textarea
                                        {...register('reason')}
                                        rows="3"
                                        placeholder="Alasan lembur (opsional)"
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    />
                                </div>

                                <div className="flex justify-end gap-3 pt-4">
                                    <Button variant="secondary" onClick={() => setShowModal(false)}>
                                        Batal
                                    </Button>
                                    <Button type="submit">
                                        Kirim Pengajuan
                                    </Button>
                                </div>
                            </form>
                        </div>
            )}
        </div>
    );
};

export default OvertimePage;