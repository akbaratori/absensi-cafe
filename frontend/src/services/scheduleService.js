import api from './api';

export const generateSchedule = async (data) => {
    const response = await api.post('/schedules/generate', data);
    return response.data;
};

export const checkConflicts = async (data) => {
    const response = await api.post('/schedules/check-conflicts', data);
    return response.data;
};

export const distributeKitchenShifts = async (month) => {
    console.log('[Frontend] distributeKitchenShifts payload:', { month });
    // Send in both Query and Body to be safe against proxy stripping
    const response = await api.post(`/schedules/distribute-kitchen?month=${month}`, { month }, {
        headers: {
            'Content-Type': 'application/json'
        }
    });
    return response.data;
};

export const updateSchedule = async (id, data) => {
    const response = await api.put(`/schedules/${id}`, data);
    return response.data;
};

export const getUserSchedule = async (userId, startDate, endDate) => {
    return api.get(`/schedules/${userId}`, {
        params: { startDate, endDate }
    });
};

export const getAllSchedules = async ({ startDate, endDate, department }) => {
    return api.get('/schedules', {
        params: { startDate, endDate, department }
    });
};

export const bulkGenerateSchedule = async (data) => {
    const response = await api.post('/schedules/bulk-generate', data);
    return response.data;
};
