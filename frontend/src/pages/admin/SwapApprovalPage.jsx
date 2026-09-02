import { useState, useEffect, useRef } from 'react';
import { Check, XCircle, RotateCcw, AlertTriangle } from 'lucide-react';
import Card from '../../components/shared/Card';
import Button from '../../components/shared/Button';
import Badge from '../../components/shared/Badge';
import { getAllSwaps, approveSwapByAdmin, rejectSwapByAdmin, revertSwapByAdmin } from '../../services/swapService';
import { showSuccess, showError } from '../../hooks/useToast';

// Modal konfirmasi reusable — menggantikan confirm() dan prompt() bawaan browser
const ConfirmModal = ({ open, title, message, confirmLabel, confirmVariant = 'danger', onConfirm, onCancel, children }) => {
    const cancelRef = useRef(null);

    useEffect(() => {
        if (open) cancelRef.current?.focus();
    }, [open]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="modal-title"
                className="relative bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md mx-4 p-6 space-y-4"
            >
                <div className="flex items-start gap-3">
                    <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${confirmVariant === 'danger' ? 'bg-red-100 dark:bg-red-900/30' : 'bg-orange-100 dark:bg-orange-900/30'}`}>
                        <AlertTriangle className={`w-5 h-5 ${confirmVariant === 'danger' ? 'text-red-600 dark:text-red-400' : 'text-orange-600 dark:text-orange-400'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 id="modal-title" className="text-base font-semibold text-gray-900 dark:text-white">{title}</h3>
                        {message && <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{message}</p>}
                    </div>
                </div>
                {children}
                <div className="flex justify-end gap-3 pt-2">
                    <button
                        ref={cancelRef}
                        onClick={onCancel}
                        className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                        Batal
                    </button>
                    <button
                        onClick={onConfirm}
                        className={`px-4 py-2 text-sm font-medium rounded-lg text-white transition-colors ${confirmVariant === 'danger' ? 'bg-red-600 hover:bg-red-700' : 'bg-orange-600 hover:bg-orange-700'}`}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
};

const SwapApprovalPage = () => {
    const [swaps, setSwaps] = useState([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(null);
    const [filterStatus, setFilterStatus] = useState('PENDING_APPROVAL');

    // State modal reject & revert
    const [rejectModal, setRejectModal] = useState({ open: false, swapId: null });
    const [revertModal, setRevertModal] = useState({ open: false, swapId: null, note: '' });

    const fetchSwaps = async () => {
        setLoading(true);
        try {
            const response = await getAllSwaps({ status: filterStatus === 'ALL' ? undefined : filterStatus });
            const payload = response.data?.data;
            setSwaps(Array.isArray(payload) ? payload : payload?.swaps || []);
        } catch (error) {
            console.error('Failed to fetch swaps:', error);
            setSwaps([]);
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

    // Reject: buka modal konfirmasi dulu
    const handleReject = (swapId) => setRejectModal({ open: true, swapId });

    const confirmReject = async () => {
        const { swapId } = rejectModal;
        setRejectModal({ open: false, swapId: null });
        setActionLoading(swapId);
        try {
            await rejectSwapByAdmin(swapId);
            showSuccess('Permintaan ditolak.');
            fetchSwaps();
        } catch (error) {
            showError(error.response?.data?.error?.message || 'Gagal menolak permintaan');
        } finally {
            setActionLoading(null);
        }
    };

    // Revert: buka modal dengan input alasan opsional
    const handleRevert = (swapId) => setRevertModal({ open: true, swapId, note: '' });

    const confirmRevert = async () => {
        const { swapId, note } = revertModal;
        setRevertModal({ open: false, swapId: null, note: '' });
        setActionLoading(swapId);
        try {
            await revertSwapByAdmin(swapId, note.trim() || undefined);
            showSuccess('Tukar shift dibatalkan dan jadwal dikembalikan ke semula.');
            fetchSwaps();
        } catch (error) {
            showError(error.response?.data?.error?.message || 'Gagal membatalkan tukar shift');
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
                        onClick={() => setFilterStatus('PENDING_APPROVAL')}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${filterStatus === 'PENDING_APPROVAL'
                            ? 'bg-white dark:bg-gray-600 text-primary-600 shadow-sm'
                            : 'text-gray-600 dark:text-gray-300 hover:text-gray-900'
                            }`}
                    >
                        Perlu Persetujuan
                    </button>
                    <button
                        onClick={() => setFilterStatus('PENDING_TARGET_RESPONSE')}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${filterStatus === 'PENDING_TARGET_RESPONSE'
                            ? 'bg-white dark:bg-gray-600 text-primary-600 shadow-sm'
                            : 'text-gray-600 dark:text-gray-300 hover:text-gray-900'
                            }`}
                    >
                        Menunggu Karyawan
                    </button>
                    <button
                        onClick={() => setFilterStatus('APPROVED')}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${filterStatus === 'APPROVED'
                            ? 'bg-white dark:bg-gray-600 text-primary-600 shadow-sm'
                            : 'text-gray-600 dark:text-gray-300 hover:text-gray-900'
                            }`}
                    >
                        Disetujui
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
                                                ${swap.status.startsWith('REJECTED') ? 'bg-red-100 text-red-800 border-red-200' : ''}
                                                ${swap.status === 'PENDING_TARGET_RESPONSE' ? 'bg-yellow-100 text-yellow-800 border-yellow-200' : ''}
                                                ${swap.status === 'PENDING_APPROVAL' ? 'bg-blue-100 text-blue-800 border-blue-200' : ''}
                                                ${swap.status === 'CANCELLED' ? 'bg-gray-100 text-gray-800 border-gray-200' : ''}
                                                ${swap.status === 'REVERTED' ? 'bg-orange-100 text-orange-800 border-orange-200' : ''}
                                             `}>
                                                {swap.status.replace(/_/g, ' ').toLowerCase()}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                            {swap.status === 'PENDING_APPROVAL' && (
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
                                            {/* Admin bisa menolak permintaan yang stuck menunggu respons karyawan */}
                                            {swap.status === 'PENDING_TARGET_RESPONSE' && (
                                                <div className="flex justify-end gap-2">
                                                    <Button
                                                        size="sm"
                                                        variant="text"
                                                        className="text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100"
                                                        onClick={() => handleReject(swap.id)}
                                                        loading={actionLoading === swap.id}
                                                        disabled={actionLoading !== null}
                                                    >
                                                        <XCircle className="w-4 h-4" /> Tolak
                                                    </Button>
                                                </div>
                                            )}
                                            {/* Admin bisa membatalkan swap yang sudah APPROVED (revert jadwal) */}
                                            {swap.status === 'APPROVED' && (
                                                <div className="flex justify-end gap-2">
                                                    <Button
                                                        size="sm"
                                                        variant="text"
                                                        className="text-orange-600 hover:text-orange-700 bg-orange-50 hover:bg-orange-100"
                                                        onClick={() => handleRevert(swap.id)}
                                                        loading={actionLoading === swap.id}
                                                        disabled={actionLoading !== null}
                                                    >
                                                        <RotateCcw className="w-4 h-4 mr-1" /> Batalkan
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
                                            ${swap.status.startsWith('REJECTED') ? 'bg-red-100 text-red-800 border-red-200' : ''}
                                            ${swap.status === 'PENDING_TARGET_RESPONSE' ? 'bg-yellow-100 text-yellow-800 border-yellow-200' : ''}
                                            ${swap.status === 'PENDING_APPROVAL' ? 'bg-blue-100 text-blue-800 border-blue-200' : ''}
                                            ${swap.status === 'CANCELLED' ? 'bg-gray-100 text-gray-800 border-gray-200' : ''}
                                            ${swap.status === 'REVERTED' ? 'bg-orange-100 text-orange-800 border-orange-200' : ''}
                                         `}>
                                            {swap.status.replace(/_/g, ' ').toLowerCase()}
                                        </span>
                                    </div>
                                    <div className="text-right">
                                        {swap.status === 'PENDING_APPROVAL' && (
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
                                        {swap.status === 'PENDING_TARGET_RESPONSE' && (
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
                                        )}
                                        {swap.status === 'APPROVED' && (
                                            <Button
                                                size="sm"
                                                variant="text"
                                                className="text-orange-600 hover:text-orange-700 bg-orange-50"
                                                onClick={() => handleRevert(swap.id)}
                                                loading={actionLoading === swap.id}
                                                disabled={actionLoading !== null}
                                            >
                                                <RotateCcw className="w-4 h-4 mr-1" /> Batalkan
                                            </Button>
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

            {/* Modal konfirmasi tolak */}
            <ConfirmModal
                open={rejectModal.open}
                title="Tolak Permintaan Tukar Shift?"
                message="Permintaan ini akan ditolak dan tidak dapat diproses ulang."
                confirmLabel="Ya, Tolak"
                confirmVariant="danger"
                onConfirm={confirmReject}
                onCancel={() => setRejectModal({ open: false, swapId: null })}
            />

            {/* Modal batalkan (revert) dengan input alasan opsional */}
            <ConfirmModal
                open={revertModal.open}
                title="Batalkan Tukar Shift yang Sudah Disetujui?"
                message="Jadwal kedua karyawan akan dikembalikan ke posisi semula."
                confirmLabel="Ya, Batalkan"
                confirmVariant="warning"
                onConfirm={confirmRevert}
                onCancel={() => setRevertModal({ open: false, swapId: null, note: '' })}
            >
                <div className="mt-1">
                    <label htmlFor="revert-note" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Alasan pembatalan <span className="text-gray-400 font-normal">(opsional)</span>
                    </label>
                    <textarea
                        id="revert-note"
                        rows={3}
                        value={revertModal.note}
                        onChange={(e) => setRevertModal((prev) => ({ ...prev, note: e.target.value }))}
                        placeholder="Contoh: Kesalahan input, perubahan jadwal mendadak..."
                        className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
                    />
                </div>
            </ConfirmModal>
        </div>
    );
};

export default SwapApprovalPage;
