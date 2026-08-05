import api from './api';

// Employee endpoints
export const createOvertime = async (data) => {
    const response = await api.post('/overtime', data);
    return response.data;
};

export const getMyOvertime = async (params = {}) => {
    const response = await api.get('/overtime/my', { params });
    return response.data;
};

export const getMyOvertimeSummary = async (month) => {
    const response = await api.get('/overtime/my/summary', { params: { month } });
    return response.data;
};

// Admin endpoints
export const getAllOvertime = async (params = {}) => {
    const response = await api.get('/admin/overtime', { params });
    return response.data;
};

export const approveOvertime = async (id, notes) => {
    const response = await api.patch(`/admin/overtime/${id}/approve`, { notes });
    return response.data;
};

export const rejectOvertime = async (id, notes) => {
    const response = await api.patch(`/admin/overtime/${id}/reject`, { notes });
    return response.data;
};

export const deleteOvertime = async (id) => {
    const response = await api.delete(`/admin/overtime/${id}`);
    return response.data;
};