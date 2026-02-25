import { useState, useEffect } from 'react';
import Modal from '../../components/shared/Modal';
import Input from '../../components/shared/Input';
import Button from '../../components/shared/Button';
import { showSuccess, showError } from '../../hooks/useToast';
import { getAllShifts } from '../../services/shiftService';
import { createUser, updateUser } from '../../services/adminService';

const UserModal = ({ isOpen, onClose, user = null, onSuccess }) => {
    const [loading, setLoading] = useState(false);
    const [shifts, setShifts] = useState([]);
    const [formData, setFormData] = useState({
        username: '',
        password: '',
        fullName: '',
        email: '',
        role: 'EMPLOYEE',
        shiftId: '',
        employeeId: '',
    });

    useEffect(() => {
        const fetchShifts = async () => {
            try {
                const response = await getAllShifts();
                setShifts(response.data.shifts);
            } catch (error) {
                console.error('Failed to fetch shifts');
            }
        };
        fetchShifts();
    }, []);

    useEffect(() => {
        if (user) {
            setFormData({
                username: user.username,
                password: '', // Leave blank to keep existing
                fullName: user.fullName,
                email: user.email || '',
                role: user.role,
                shiftId: user.shiftId || '', // Use shiftId from user object
                employeeId: user.employeeId || '',
                hourlyRate: user.hourlyRate || 0,
                offDay: user.offDay !== undefined ? user.offDay : 0,
                department: user.department || 'BAR',
            });
        } else {
            setFormData({
                username: '',
                password: '',
                fullName: '',
                email: '',
                role: 'EMPLOYEE',
                shiftId: '', // Default empty or first shift logic later
                employeeId: '',
                hourlyRate: 0,
                offDay: 0, // Default Sunday
                department: 'BAR',
            });
        }
    }, [user, isOpen]);

    const generateEmployeeId = (role) => {
        const prefix = role === 'ADMIN' ? 'ADM' : 'EMP';
        const randomNum = Math.floor(1000 + Math.random() * 9000); // 4 digit random number
        return `${prefix}-${randomNum}`;
    };

    const handleChange = (e) => {
        const { name, value } = e.target;

        if (name === 'role') {
            // Auto-generate employeeId if it's empty or looks like an auto-generated one (to allow switching roles to update prefix)
            // But usually safer to only do it if empty to avoid accidental overwrites of manual edits.
            // Let's go with: if user is NEW (no user prop) AND employeeId is empty or starts with previous prefix.

            // Simple approach: If creating new user, auto-regenerate. If editing, don't touch unless empty.
            if (!user && (formData.employeeId === '' || formData.employeeId.startsWith('ADM-') || formData.employeeId.startsWith('EMP-'))) {
                setFormData((prev) => ({
                    ...prev,
                    [name]: value,
                    employeeId: generateEmployeeId(value)
                }));
                return;
            }
        }

        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    // Trigger initial generation for new users if empty
    useEffect(() => {
        if (!user && !formData.employeeId && formData.role) {
            setFormData(prev => ({
                ...prev,
                employeeId: generateEmployeeId(prev.role)
            }));
        }
    }, [user, formData.role]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            if (user) {
                // Update existing user
                const dataToUpdate = { ...formData };
                if (!dataToUpdate.password) delete dataToUpdate.password;
                // username can be updated now

                // Ensure hourlyRate is a valid number
                if (dataToUpdate.hourlyRate) {
                    dataToUpdate.hourlyRate = parseInt(dataToUpdate.hourlyRate, 10);
                }
                if (dataToUpdate.offDay !== undefined) {
                    dataToUpdate.offDay = parseInt(dataToUpdate.offDay, 10);
                }

                await updateUser(user.id, dataToUpdate);
                showSuccess('User updated successfully');
            } else {
                // Create new user
                // Ensure hourlyRate is a valid number for creation
                const dataToCreate = { ...formData };
                if (dataToCreate.hourlyRate) {
                    dataToCreate.hourlyRate = parseInt(dataToCreate.hourlyRate, 10);
                }
                if (dataToCreate.offDay !== undefined) {
                    dataToCreate.offDay = parseInt(dataToCreate.offDay, 10);
                }
                await createUser(dataToCreate);
                showSuccess('User created successfully');
            }
            onSuccess();
            onClose();
        } catch (error) {
            console.error('User creation error:', error);
            const errorData = error.response?.data?.error;
            let message = errorData?.message || 'Failed to save user';

            // If there are detailed validation errors, append them
            if (errorData?.details) {
                const details = Object.values(errorData.details).join(', ');
                message = `${message}: ${details}`;
            }

            showError(message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={user ? 'Edit User' : 'Add User'}
        >
            <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                    label="Username"
                    name="username"
                    value={formData.username}
                    onChange={handleChange}
                    required
                    placeholder="johndoe"
                />

                <Input
                    label="Full Name"
                    name="fullName"
                    value={formData.fullName}
                    onChange={handleChange}
                    required
                    placeholder="John Doe"
                />

                <Input
                    label="Email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="john@example.com"
                />

                <Input
                    label="Password"
                    name="password"
                    type="password"
                    value={formData.password}
                    onChange={handleChange}
                    required={!user}
                    placeholder={user ? 'Leave blank to keep current' : 'Enter password'}
                />

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Role
                        </label>
                        <select
                            name="role"
                            value={formData.role}
                            onChange={handleChange}
                            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                        >
                            <option value="EMPLOYEE">Employee</option>
                            <option value="ADMIN">Admin</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Departemen
                        </label>
                        <select
                            name="department"
                            value={formData.department}
                            onChange={handleChange}
                            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                        >
                            <option value="BAR">Bar</option>
                            <option value="KITCHEN">Kitchen</option>
                        </select>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Shift Cadangan (Backup)
                        </label>
                        <select
                            name="shiftId"
                            value={formData.shiftId}
                            onChange={handleChange}
                            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                        >
                            <option value="">Pilih Shift</option>
                            {shifts.map((shift) => (
                                <option key={shift.id} value={shift.id}>
                                    {shift.name} ({shift.startTime} - {shift.endTime})
                                </option>
                            ))}
                        </select>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            Digunakan jika belum ada jadwal bulanan.
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <Input
                        label="Employee ID"
                        name="employeeId"
                        value={formData.employeeId}
                        onChange={handleChange}
                        placeholder="EMP001"
                    />

                    <Input
                        label="Hourly Rate (Gaji/Jam)"
                        name="hourlyRate"
                        type="number"
                        value={formData.hourlyRate}
                        onChange={handleChange}
                        placeholder="0"
                    />
                </div>

                <div className="flex justify-end gap-2 mt-6">
                    <Button type="button" variant="outline" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button type="submit" variant="primary" loading={loading}>
                        Save
                    </Button>
                </div>
            </form>
        </Modal>
    );
};

export default UserModal;
