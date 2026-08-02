import { useState, useEffect } from 'react';
import { Check, XCircle, Search } from 'lucide-react';
import Card from '../../components/shared/Card';
import Button from '../../components/shared/Button';
import Badge from '../../components/shared/Badge';
import { getAllSwaps, approveSwapByAdmin, rejectSwap } from '../../services/swapService';
import { showSuccess, showError } from '../../hooks/useToast';

const SwapApprovalPage = () => {
    const [swaps, setSwaps] = useState([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(null);
    const [filterStatus, setFilterStatus] = useState('PENDING_ADMIN'); // Default to pending admin

    const fetchSwaps = async () => {
        setLoading(true);
        try {
            const response = await getAllSwaps({ status: filterStatus === 'ALL' ? undefined : filterStatus });
            // API returns { status: 'success', data: { swaps: [...] } }
            setSwaps(response.data?.data?.swaps || []);
        } catch (error) {
            console.error('Failed to fetch swaps:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSwaps();
    }, [filterStatus]);

    const handleApprove = async (swapId) => {
        setActionLoading(swapId);
        try {
            await approveSwapByAdmin(swapId);
            showSuccess('Permintaan tukar shift disetujui!');
            fetchSwaps();
        } catch (error) {
            showError(error.response?.data?.error?.message || 'Gagal menyetujui permintaan');
        } finally {
            setActionLoading(null);
        }
    };

    const handleReject = async (swapId) => {
        if (!confirm('Yakin ingin menolak permintaan ini?')) return;

        setActionLoading(swapId);
        try {
            await rejectSwap(swapId); // Admin uses same endpoint but logic handles it
            showSuccess('Permintaan ditolak.');
            fetchSwaps();
        } catch (error) {
            showError(error.response?.data?.error?.message || 'Gagal menolak permintaan');
        } finally {
            setActionLoading(null);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Persetujuan Tukar Shift</h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">Review permintaan tukar shift yang sudah disetujui antar karyawan.</p>
                </div>

                <div className="flex bg-gray-100 dark:bg-gray-700 p-1 rounded-lg">
                    <button
                        onClick={() => setFilterStatus('PENDING_ADMIN')}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${filterStatus === 'PENDING_ADMIN'
                            ? 'bg-white dark:bg-gray-600 text-primary-600 shadow-sm'
                            : 'text-gray-600 dark:text-gray-300 hover:text-gray-900'
                            }`}
                    >
                        Perlu Persetujuan
                    </button>
                    <button
                        onClick={() => setFilterStatus('ALL')}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${filterStatus === 'ALL'
                            ? 'bg-white dark:bg-gray-600 text-primary-600 shadow-sm'
                            : 'text-gray-600 dark:text-gray-300 hover:text-gray-900'
                            }`}
                    >
                        Semua Riwayat
                    </button>
                </div>
            </div>

            <Card>
                {/* Desktop View (Table) */}
                <div className="hidden md:block overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-800">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Tanggal</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Pemohon</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Target</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Alasan</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                            {loading ? (
                                <tr>
                                    <td colSpan="6" className="px-6 py-12 text-center text-gray-500">Loading...</td>
                                </tr>
                            ) : swaps.length === 0 ? (
                                <tr>
                                    <td colSpan="6" className="px-6 py-12 text-center text-gray-500">Tidak ada data.</td>
                                </tr>
                            ) : (
                                swaps.map((swap) => (
                                    <tr key={swap.id}>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                                            {new Date(swap.date).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm font-medium text-gray-900 dark:text-white">{swap.requester?.fullName}</div>
                                            <div className="text-xs text-gray-500">{swap.requester?.employeeId}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm font-medium text-gray-900 dark:text-white">{swap.target?.fullName}</div>
                                            <div className="text-xs text-gray-500">{swap.target?.employeeId}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="text-sm text-gray-500 italic max-w-xs truncate">{swap.reason}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={`px-2 py-1 rounded-full text-xs font-medium border capitalize
                                                ${swap.status === 'APPROVED' ? 'bg-green-100 text-green-800 border-green-200' : ''}
                                                ${swap.status === 'REJECTED' ? 'bg-red-100 text-red-800 border-red-200' : ''}
                                                ${swap.status === 'PENDING_USER' ? 'bg-yellow-100 text-yellow-800 border-yellow-200' : ''}
                                                ${swap.status === 'PENDING_ADMIN' ? 'bg-blue-100 text-blue-800 border-blue-200' : ''}
                                             `}>
                                                {swap.status.replace('_', ' ').toLowerCase()}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                            {swap.status === 'PENDING_ADMIN' && (
                                                <div className="flex justify-end gap-2">
                                                    <Button
                                                        size="sm"
                                                        variant="text"
                                                        className="text-green-600 hover:text-green-700 bg-green-50 hover:bg-green-100"
                                                        onClick={() => handleApprove(swap.id)}
                                                        loading={actionLoading === swap.id}
                                                        disabled={actionLoading !== null}
                                                    >
                                                        <Check className="w-4 h-4" />
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="text"
                                                        className="text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100"
                                                        onClick={() => handleReject(swap.id)}
                                                        loading={actionLoading === swap.id}
                                                        disabled={actionLoading !== null}
                                                    >
                                                        <XCircle className="w-4 h-4" />
                                                    </Button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Mobile View (Cards) */}
                <div className="block md:hidden divide-y divide-gray-200 dark:divide-gray-700">
                    {loading ? (
                        <div className="p-6 text-center text-gray-500">Loading...</div>
                    ) : swaps.length === 0 ? (
                        <div className="p-6 text-center text-gray-500">Tidak ada data.</div>
                    ) : (
                        swaps.map((swap) => (
                            <div key={swap.id} className="p-4 space-y-3">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <p className="font-semibold text-gray-900 dark:text-white">
                                            {new Date(swap.date).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                                        </p>
                                        <span className={`px-2 py-0.5 mt-1 inline-block rounded-full text-xs font-medium border capitalize
                                            ${swap.status === 'APPROVED' ? 'bg-green-100 text-green-800 border-green-200' : ''}
                                            ${swap.status === 'REJECTED' ? 'bg-red-100 text-red-800 border-red-200' : ''}
                                            ${swap.status === 'PENDING_USER' ? 'bg-yellow-100 text-yellow-800 border-yellow-200' : ''}
                                            ${swap.status === 'PENDING_ADMIN' ? 'bg-blue-100 text-blue-800 border-blue-200' : ''}
                                         `}>
                                            {swap.status.replace('_', ' ').toLowerCase()}
                                        </span>
                                    </div>
                                    <div className="text-right">
                                        {swap.status === 'PENDING_ADMIN' && (
                                            <div className="flex gap-2">
                                                <Button
                                                    size="sm"
                                                    variant="text"
                                                    className="text-green-600 hover:text-green-700 bg-green-50"
                                                    onClick={() => handleApprove(swap.id)}
                                                    loading={actionLoading === swap.id}
                                                    disabled={actionLoading !== null}
                                                >
                                                    <Check className="w-4 h-4" />
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="text"
                                                    className="text-red-600 hover:text-red-700 bg-red-50"
                                                    onClick={() => handleReject(swap.id)}
                                                    loading={actionLoading === swap.id}
                                                    disabled={actionLoading !== null}
                                                >
                                                    <XCircle className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-2 text-sm bg-gray-50 dark:bg-gray-700/50 p-3 rounded-lg">
                                    <div>
                                        <p className="text-xs text-gray-500">Pemohon</p>
                                        <p className="font-medium text-gray-900 dark:text-white">{swap.requester?.fullName}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-gray-500">Target</p>
                                        <p className="font-medium text-gray-900 dark:text-white">{swap.target?.fullName}</p>
                                    </div>
                                    <div className="col-span-2 border-t border-gray-200 dark:border-gray-600 pt-2 mt-1">
                                        <p className="text-xs text-gray-500">Alasan</p>
                                        <p className="italic text-gray-700 dark:text-gray-300">{swap.reason}</p>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </Card>
        </div>
    );
};

export default SwapApprovalPage;
