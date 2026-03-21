import api from './api';

/**
 * Get all users
 */
export const getUsers = async (params = {}) => {
  const response = await api.get('/admin/users', { params });
  return response.data;
};

/**
 * Get user by ID
 */
export const getUserById = async (id) => {
  const response = await api.get(`/admin/users/${id}`);
  return response.data;
};

/**
 * Create new user
 */
export const createUser = async (data) => {
  const response = await api.post('/admin/users', data);
  return response.data;
};

/**
 * Update user
 */
export const updateUser = async (id, data) => {
  const response = await api.put(`/admin/users/${id}`, data);
  return response.data;
};

/**
 * Deactivate user
 */
export const deleteUser = async (id) => {
  const response = await api.delete(`/admin/users/${id}`);
  return response.data;
};

/**
 * Get next available Employee ID
 */
export const getNextEmployeeId = async (role = 'EMPLOYEE') => {
  const response = await api.get('/admin/users/next-id', { params: { role } });
  return response.data;
};

/**
 * Get system configuration
 */
export const getConfig = async () => {
  const response = await api.get('/admin/config');
  return response.data;
};

/**
 * Update system configuration
 */
export const updateConfig = async (data) => {
  const response = await api.put('/admin/config', data);
  return response.data;
};

export const deleteAttendance = async (id) => {
  const response = await api.delete(`/admin/attendance/${id}`);
  return response.data;
};

/**
 * Hapus SEMUA data absensi (untuk testing/reset)
 */
export const deleteAllAttendance = async () => {
  const response = await api.delete('/admin/attendance/all');
  return response.data;
};

/**
 * Get dashboard statistics
 */
export const getDashboardStats = async () => {
  const response = await api.get('/admin/dashboard-stats');
  return response.data;
};
