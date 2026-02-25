import api from './api';

export const getAllShifts = async () => {
    const response = await api.get('/shifts');
    return response.data;
};

export const createShift = async (data) => {
    const response = await api.post('/shifts', data);
    return response.data;
};

export const updateShift = async (id, data) => {
    const response = await api.put(`/shifts/${id}`, data);
    return response.data;
};

export const deleteShift = async (id) => {
    const response = await api.delete(`/shifts/${id}`);
    return response.data;
};
