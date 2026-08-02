import { useState, useEffect } from 'react';
import Card from '../../components/shared/Card';
import Button from '../../components/shared/Button';
import { getAllShifts, createShift, updateShift, deleteShift } from '../../services/shiftService';
import { showSuccess, showError } from '../../hooks/useToast';
import { Plus, Edit2, Trash2, Clock } from 'lucide-react';
import Modal from '../../components/shared/Modal';

const ShiftManagementPage = () => {
    const [shifts, setShifts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingShift, setEditingShift] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        startTime: '',
        endTime: '',
    });

    const fetchShifts = async () => {
        try {
            const response = await getAllShifts();
            setShifts(response.data.shifts);
        } catch (error) {
            console.error('Failed to fetch shifts:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchShifts();
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editingShift) {
                await updateShift(editingShift.id, formData);
                showSuccess('Shift updated successfully');
            } else {
                await createShift(formData);
                showSuccess('Shift created successfully');
            }
            setIsModalOpen(false);
            resetForm();
            fetchShifts();
        } catch (error) {
            showError(error.response?.data?.message || 'Failed to save shift');
        }
    };

    const handleDelete = async (id) => {
        if (window.confirm('Are you sure you want to delete this shift?')) {
            try {
                await deleteShift(id);
                showSuccess('Shift deleted successfully');
                fetchShifts();
            } catch (error) {
                showError('Failed to delete shift');
            }
        }
    };

    const openEditModal = (shift) => {
        setEditingShift(shift);
        setFormData({
            name: shift.name,
            startTime: shift.startTime,
            endTime: shift.endTime,
        });
        setIsModalOpen(true);
    };

    const resetForm = () => {
        setEditingShift(null);
        setFormData({
            name: '',
            startTime: '',
            endTime: '',
        });
    };

    if (loading) return <div>Loading...</div>;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Shift Management</h1>
                    <p className="text-gray-600 dark:text-gray-400">Manage work shifts and hours</p>
                </div>
                <Button onClick={() => { resetForm(); setIsModalOpen(true); }}>
                    <Plus className="w-5 h-5 mr-2" />
                    Add Shift
                </Button>
            </div>

            <Card>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-800">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Shift Name</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Start Time</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">End Time</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                            {shifts.map((shift) => (
                                <tr key={shift.id}>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{shift.name}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                        <div className="flex items-center">
                                            <Clock className="w-4 h-4 mr-2" />
                                            {shift.startTime}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                        <div className="flex items-center">
                                            <Clock className="w-4 h-4 mr-2" />
                                            {shift.endTime}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <button
                                            onClick={() => openEditModal(shift)}
                                            className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300 mr-4"
                                        >
                                            <Edit2 className="w-5 h-5" />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(shift.id)}
                                            className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                                        >
                                            <Trash2 className="w-5 h-5" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>

            <Modal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title={editingShift ? 'Edit Shift' : 'Add New Shift'}
            >
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Shift Name</label>
                        <input
                            type="text"
                            required
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white sm:text-sm"
                            placeholder="e.g. Morning Shift"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Start Time</label>
                            <input
                                type="time"
                                required
                                value={formData.startTime}
                                onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white sm:text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">End Time</label>
                            <input
                                type="time"
                                required
                                value={formData.endTime}
                                onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white sm:text-sm"
                            />
                        </div>
                    </div>
                    <div className="mt-5 flex justify-end gap-2">
                        <Button variant="secondary" onClick={() => setIsModalOpen(false)}>
                            Cancel
                        </Button>
                        <Button type="submit">
                            {editingShift ? 'Update Shift' : 'Create Shift'}
                        </Button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default ShiftManagementPage;
