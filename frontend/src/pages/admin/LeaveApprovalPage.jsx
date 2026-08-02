import React, { useState, useEffect } from 'react';
import { Check, X, Eye, Trash2 } from 'lucide-react';
import api from '../../services/api';
import Card from '../../components/shared/Card';
import Modal from '../../components/shared/Modal';
import Button from '../../components/shared/Button';
import { showSuccess, showError } from '../../hooks/useToast';

const LeaveApprovalPage = () => {
    const [leaves, setLeaves] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [confirmationModal, setConfirmationModal] = useState({
        isOpen: false,
        leaveId: null,
        status: null, // 'APPROVED', 'REJECTED', or 'DELETE'
        leaveName: ''
    });
    const [actionLoading, setActionLoading] = useState(false);

    useEffect(() => {
        fetchLeaves();
    }, []);

    const fetchLeaves = async () => {
        try {
            const response = await api.get('/leaves');
            setLeaves(response.data.data.leaves);
        } catch (error) {
            console.error('Failed to fetch leaves', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleUpdateStatus = (leave, status) => {
        setConfirmationModal({
            isOpen: true,
            leaveId: leave.id,
            status: status,
            leaveName: leave.user.fullName
        });
    };

    const handleDelete = (leave) => {
        setConfirmationModal({
            isOpen: true,
            leaveId: leave.id,
            status: 'DELETE',
            leaveName: leave.user.fullName
        });
    };

    const handleConfirmAction = async () => {
        const { leaveId, status } = confirmationModal;
        if (!leaveId) return;

        setActionLoading(true);
        try {
            if (status === 'DELETE') {
                await api.delete(`/leaves/${leaveId}`);
                showSuccess('Leave request deleted successfully');
            } else {
                await api.patch(`/leaves/${leaveId}/status`, { status });
                showSuccess(`Leave request ${status.toLowerCase()} successfully`);
            }
            fetchLeaves(); // Refresh list
            setConfirmationModal(prev => ({ ...prev, isOpen: false }));
        } catch (error) {
            console.error('Failed to process action', error);
            showError(`Failed to ${status === 'DELETE' ? 'delete' : 'update'} request`);
        } finally {
            setActionLoading(false);
        }
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'APPROVED': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
            case 'REJECTED': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
            default: return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Leave Requests</h1>
                <p className="text-gray-600 dark:text-gray-400">View and manage employee leave requests</p>
            </div>

            <Card>
                {/* Desktop View (Table) */}
                <div className="hidden md:block overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-800">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Employee</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Type</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Dates</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Reason</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Proof</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                            {leaves.length === 0 ? (
                                <tr>
                                    <td colSpan="7" className="px-6 py-4 text-center text-gray-500 dark:text-gray-400">
                                        No leave requests found.
                                    </td>
                                </tr>
                            ) : (
                                leaves.map((leave) => (
                                    <tr key={leave.id}>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm font-medium text-gray-900 dark:text-white">{leave.user.fullName}</div>
                                            <div className="text-xs text-gray-500 dark:text-gray-400">{leave.user.role}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                            {leave.type}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                            {new Date(leave.startDate).toLocaleDateString()} - {new Date(leave.endDate).toLocaleDateString()}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 max-w-xs truncate">
                                            {leave.reason}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-500">
                                            {leave.proof ? (
                                                <a href={leave.proof} target="_blank" rel="noopener noreferrer" className="flex items-center hover:underline">
                                                    <Eye size={16} className="mr-1" /> View
                                                </a>
                                            ) : '-'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(leave.status)}`}>
                                                {leave.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                            {leave.status === 'PENDING' && (
                                                <div className="flex space-x-2">
                                                    <button
                                                        onClick={() => handleUpdateStatus(leave, 'APPROVED')}
                                                        className="text-green-600 hover:text-green-900 dark:hover:text-green-400"
                                                        title="Approve"
                                                    >
                                                        <Check size={20} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleUpdateStatus(leave, 'REJECTED')}
                                                        className="text-red-600 hover:text-red-900 dark:hover:text-red-400"
                                                        title="Reject"
                                                    >
                                                        <X size={20} />
                                                    </button>
                                                </div>
                                            )}
                                            <button
                                                onClick={() => handleDelete(leave)}
                                                className="text-gray-600 hover:text-red-600 dark:hover:text-red-400 ml-2"
                                                title="Delete"
                                            >
                                                <Trash2 size={20} />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Mobile View (Cards) */}
                <div className="block md:hidden divide-y divide-gray-200 dark:divide-gray-700">
                    {leaves.length === 0 ? (
                        <div className="p-4 text-center text-gray-500 dark:text-gray-400">
                            No leave requests found.
                        </div>
                    ) : (
                        leaves.map((leave) => (
                            <div key={leave.id} className="p-4 space-y-3">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <p className="font-semibold text-gray-900 dark:text-white">{leave.user.fullName}</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">{leave.user.role} • {leave.type}</p>
                                    </div>
                                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(leave.status)}`}>
                                        {leave.status}
                                    </span>
                                </div>

                                <div className="text-sm space-y-1">
                                    <div className="flex justify-between">
                                        <span className="text-gray-500 dark:text-gray-400">Date:</span>
                                        <span className="text-gray-900 dark:text-white font-medium">
                                            {new Date(leave.startDate).toLocaleDateString()} - {new Date(leave.endDate).toLocaleDateString()}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-500 dark:text-gray-400">Reason:</span>
                                        <span className="text-gray-900 dark:text-white truncate max-w-[150px]">{leave.reason}</span>
                                    </div>
                                    {leave.proof && (
                                        <div className="flex justify-between">
                                            <span className="text-gray-500 dark:text-gray-400">Proof:</span>
                                            <a href={leave.proof} target="_blank" rel="noopener noreferrer" className="text-blue-500 text-xs flex items-center">
                                                <Eye size={14} className="mr-1" /> View
                                            </a>
                                        </div>
                                    )}
                                </div>

                                <div className="flex justify-end gap-3 pt-2 border-t border-gray-100 dark:border-gray-700">
                                    {leave.status === 'PENDING' && (
                                        <>
                                            <button
                                                onClick={() => handleUpdateStatus(leave, "APPROVED")}
                                                className="flex items-center px-3 py-1 bg-green-100 text-green-700 rounded-md text-sm font-medium"
                                            >
                                                <Check size={16} className="mr-1" /> Approve
                                            </button>
                                            <button
                                                onClick={() => handleUpdateStatus(leave, "REJECTED")}
                                                className="flex items-center px-3 py-1 bg-red-100 text-red-700 rounded-md text-sm font-medium"
                                            >
                                                <X size={16} className="mr-1" /> Reject
                                            </button>
                                        </>
                                    )}
                                    <button
                                        onClick={() => handleDelete(leave)}
                                        className="text-gray-400 hover:text-red-600 p-1"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </Card >

            <Modal
                isOpen={confirmationModal.isOpen}
                onClose={() => setConfirmationModal(prev => ({ ...prev, isOpen: false }))}
                title="Confirm Action"
                size="sm"
            >
                <div className="space-y-4">
                    <p className="text-gray-600 dark:text-gray-300">
                        {confirmationModal.status === 'DELETE' ? (
                            <>Are you sure you want to <span className="font-bold text-red-600">DELETE</span> the leave request for <span className="font-semibold">{confirmationModal.leaveName}</span>? This action cannot be undone.</>
                        ) : (
                            <>Are you sure you want to <span className="font-bold">{confirmationModal.status}</span> the leave request for <span className="font-semibold">{confirmationModal.leaveName}</span>?</>
                        )}
                    </p>
                    <div className="flex justify-end gap-3 mt-6">
                        <Button
                            variant="ghost"
                            onClick={() => setConfirmationModal(prev => ({ ...prev, isOpen: false }))}
                            disabled={actionLoading}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant={confirmationModal.status === 'APPROVED' ? 'primary' : 'danger'}
                            onClick={handleConfirmAction}
                            loading={actionLoading}
                        >
                            {confirmationModal.status === 'DELETE' ? 'Delete' : `Confirm ${confirmationModal.status === 'APPROVED' ? 'Approval' : 'Rejection'}`}
                        </Button>
                    </div>
                </div>
            </Modal>
        </div >
    );
};

export default LeaveApprovalPage;
