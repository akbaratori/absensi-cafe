import React, { useState, useEffect } from 'react';
import { Check, X, Trash2 } from 'lucide-react';
import api from '../../services/api';
import Card from '../../components/shared/Card';
import Button from '../../components/shared/Button';
import { showSuccess, showError } from '../../hooks/useToast';

const OvertimeApprovalPage = () => {
    const [overtimes, setOvertimes] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filter, setFilter] = useState('PENDING');

    useEffect(() => {
        fetchOvertimes();
    }, [filter]);

    const fetchOvertimes = async () => {
        try {
            const response = await api.get('/admin/overtime', { params: { status: filter } });
            setOvertimes(response.data.data.records);
        } catch (error) {
            console.error('Failed to fetch overtime', error);
            showError('Gagal memuat data lembur');
        } finally {
            setIsLoading(false);
        }
    };

    const handleApprove = async (id) => {
        try {
            await api.patch(`/admin/overtime/${id}/approve`);
            showSuccess('Pengajuan lembur disetujui');
            fetchOvertimes();
        } catch (error) {
            const message = error.response?.data?.error?.message || error.message || 'Gagal menyetujui';
            showError(message);
        }
    };

    const handleReject = async (id) => {
        try {
            await api.patch(`/admin/overtime/${id}/reject`);
            showSuccess('Pengajuan lembur ditolak');
            fetchOvertimes();
        } catch (error) {
            const message = error.response?.data?.error?.message || error.message || 'Gagal menolak';
            showError(message);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Hapus pengajuan lembur ini?')) return;
        try {
            await api.delete(`/admin/overtime/${id}`);
            showSuccess('Pengajuan lembur dihapus');
            fetchOvertimes();
        } catch (error) {
            const message = error.response?.data?.error?.message || error.message || 'Gagal menghapus';
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

    const filters = [
        { value: 'PENDING', label: 'Menunggu' },
        { value: 'APPROVED', label: 'Disetujui' },
        { value: 'REJECTED', label: 'Ditolak' },
        { value: 'ALL', label: 'Semua' },
    ];

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Persetujuan Lembur</h1>
                <p className="text-gray-600 dark:text-gray-400">Kelola pengajuan lembur karyawan</p>
            </div>

            {/* Filter tabs */}
            <div className="flex flex-wrap gap-2">
                {filters.map((f) => (
                    <button
                        key={f.value}
                        onClick={() => setFilter(f.value)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                            filter === f.value
                                ? 'bg-primary-600 text-white'
                                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                        }`}
                    >
                        {f.label}
                    </button>
                ))}
            </div>

            <Card>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-800">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Karyawan</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Tanggal</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Jam</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Durasi</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Alasan</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                            {isLoading ? (
                                <tr>
                                    <td colSpan="7" className="px-6 py-4 text-center text-gray-500 dark:text-gray-400">
                                        Memuat data...
                                    </td>
                                </tr>
                            ) : overtimes.length === 0 ? (
                                <tr>
                                    <td colSpan="7" className="px-6 py-4 text-center text-gray-500 dark:text-gray-400">
                                        Tidak ada data lembur.
                                    </td>
                                </tr>
                            ) : (
                                overtimes.map((ot) => (
                                    <tr key={ot.id}>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm font-medium text-gray-900 dark:text-white">{ot.user?.fullName || '-'}</div>
                                            <div className="text-xs text-gray-500 dark:text-gray-400">{ot.user?.employeeId || ''}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                            {new Date(ot.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                            {new Date(ot.startTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} - {new Date(ot.endTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
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
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex items-center gap-2">
                                                {ot.status === 'PENDING' && (
                                                    <>
                                                        <button
                                                            onClick={() => handleApprove(ot.id)}
                                                            className="p-2 rounded-lg bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-800 transition-colors"
                                                            title="Setujui"
                                                        >
                                                            <Check className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleReject(ot.id)}
                                                            className="p-2 rounded-lg bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-800 transition-colors"
                                                            title="Tolak"
                                                        >
                                                            <X className="w-4 h-4" />
                                                        </button>
                                                    </>
                                                )}
                                                <button
                                                    onClick={() => handleDelete(ot.id)}
                                                    className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                                                    title="Hapus"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
};

export default OvertimeApprovalPage;