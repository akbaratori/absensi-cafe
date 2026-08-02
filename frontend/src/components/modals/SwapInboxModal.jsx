import { useState, useEffect } from 'react';
import { X, Check, XCircle } from 'lucide-react';
import Button from '../../components/shared/Button';
import Badge from '../../components/shared/Badge';
import { getMySwaps, approveSwapByUser, rejectSwap } from '../../services/swapService';
import { showSuccess, showError } from '../../hooks/useToast';
import { useAuth } from '../../contexts/AuthContext';

const SwapInboxModal = ({ onClose }) => {
    const { user } = useAuth();
    const [swaps, setSwaps] = useState([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(null); // id of swap being processed

    const fetchSwaps = async () => {
        try {
            const response = await getMySwaps();
            // API returns { status: 'success', data: { swaps: [...] } }
            // Axios response is { data: { ...API_BODY... } }
            // So we need response.data.data.swaps
            setSwaps(response.data?.data?.swaps || []);
        } catch (error) {
            console.error('Failed to fetch swaps:', error);
            setSwaps([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSwaps();
    }, []);

    const handleApprove = async (swapId) => {
        setActionLoading(swapId);
        try {
            await approveSwapByUser(swapId);
            showSuccess('Permintaan disetujui! Menunggu Admin.');
            fetchSwaps(); // Refresh list
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
            await rejectSwap(swapId);
            showSuccess('Permintaan ditolak.');
            fetchSwaps(); // Refresh list
        } catch (error) {
            showError(error.response?.data?.error?.message || 'Gagal menolak permintaan');
        } finally {
            setActionLoading(null);
        }
    };

    // Filter Logic:
    // 1. Inbox (Incoming Requests): where targetUserId == user.id AND status == 'PENDING_USER'
    // 2. Sent Requests (My Requests): where requesterId == user.id
    // 3. History: Approved/Rejected/PendingAdmin

    const incomingRequests = swaps.filter(s => s.targetUserId == user?.id && s.status === 'PENDING_USER');
    const myHistory = swaps.filter(s => !(s.targetUserId == user?.id && s.status === 'PENDING_USER'));

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-2xl overflow-hidden max-h-[90vh] flex flex-col">
                <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-700">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                        Kotak Masuk & Riwayat Tukar Shift
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-500">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-4 overflow-y-auto flex-1 space-y-6">

                    {/* Incoming Requests Section */}
                    <div>
                        <h4 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">
                            Permintaan Masuk ({incomingRequests.length})
                        </h4>

                        {loading ? (
                            <div className="animate-pulse space-y-2">
                                <div className="h-16 bg-gray-100 dark:bg-gray-700 rounded-lg"></div>
                            </div>
                        ) : incomingRequests.length > 0 ? (
                            <div className="space-y-3">
                                {incomingRequests.map(swap => (
                                    <div key={swap.id} className="bg-purple-50 dark:bg-purple-900/10 border border-purple-100 dark:border-purple-800/30 p-4 rounded-lg flex flex-col sm:flex-row justify-between gap-4 items-start sm:items-center">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="font-semibold text-gray-900 dark:text-white">
                                                    {swap.requester?.fullName}
                                                </span>
                                                <span className="text-sm text-gray-500">ingin tukar shift pada</span>
                                            </div>
                                            <div className="font-mono text-lg font-medium text-purple-700 dark:text-purple-400 my-1">
                                                {new Date(swap.date).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                                            </div>
                                            <p className="text-sm text-gray-600 dark:text-gray-400 italic">
                                                "{swap.reason}"
                                            </p>
                                        </div>

                                        <div className="flex gap-2 w-full sm:w-auto">
                                            <Button
                                                size="sm"
                                                variant="primary"
                                                className="flex-1 sm:flex-none"
                                                onClick={() => handleApprove(swap.id)}
                                                loading={actionLoading === swap.id}
                                                disabled={actionLoading !== null}
                                            >
                                                <Check className="w-4 h-4 mr-1" /> Setuju
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="danger"
                                                className="flex-1 sm:flex-none"
                                                onClick={() => handleReject(swap.id)}
                                                loading={actionLoading === swap.id}
                                                disabled={actionLoading !== null}
                                            >
                                                <XCircle className="w-4 h-4 mr-1" /> Tolak
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-gray-500 text-sm italic bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg text-center">
                                Tidak ada permintaan masuk saat ini.
                            </p>
                        )}
                    </div>

                    {/* History Section */}
                    <div>
                        <h4 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">
                            Riwayat & Status ({myHistory.length})
                        </h4>

                        {loading ? (
                            <div className="animate-pulse space-y-2">
                                <div className="h-16 bg-gray-100 dark:bg-gray-700 rounded-lg"></div>
                            </div>
                        ) : myHistory.length > 0 ? (
                            <div className="space-y-3">
                                {myHistory.map(swap => (
                                    <div key={swap.id} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-4 rounded-lg flex flex-col sm:flex-row justify-between gap-2">
                                        <div>
                                            <div className="text-sm text-gray-900 dark:text-white">
                                                {swap.requesterId === user.id ? (
                                                    <>Ke: <strong>{swap.target?.fullName}</strong></>
                                                ) : (
                                                    <>Dari: <strong>{swap.requester?.fullName}</strong></>
                                                )}
                                                {' '} • {new Date(swap.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                                            </div>
                                            <div className="text-xs text-gray-500">
                                                {swap.reason}
                                            </div>
                                        </div>
                                        <div>
                                            <span className={`px-2 py-1 rounded-full text-xs font-medium border
                                                ${swap.status === 'APPROVED' ? 'bg-green-100 text-green-800 border-green-200' : ''}
                                                ${swap.status === 'REJECTED' ? 'bg-red-100 text-red-800 border-red-200' : ''}
                                                ${swap.status === 'PENDING_USER' ? 'bg-yellow-100 text-yellow-800 border-yellow-200' : ''}
                                                ${swap.status === 'PENDING_ADMIN' ? 'bg-blue-100 text-blue-800 border-blue-200' : ''}
                                             `}>
                                                {swap.status.replace('_', ' ')}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-gray-500 text-sm italic text-center py-4">
                                Belum ada riwayat tukar shift.
                            </p>
                        )}
                    </div>

                </div>
            </div>
        </div>
    );
};

export default SwapInboxModal;
