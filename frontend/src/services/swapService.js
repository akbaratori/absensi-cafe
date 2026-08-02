import api from './api';

export const createSwapRequest = async (data) => {
    return await api.post('/swaps', data);
};

export const getMySwaps = async () => {
    return await api.get('/swaps/my-swaps');
};

export const approveSwapByUser = async (swapId) => {
    return await api.patch(`/swaps/${swapId}/approve`);
};

export const rejectSwap = async (swapId) => {
    return await api.patch(`/swaps/${swapId}/reject`);
};

// Admin
export const getAllSwaps = async (params) => {
    return await api.get('/swaps', { params });
};

export const approveSwapByAdmin = async (swapId) => {
    return await api.patch(`/swaps/${swapId}/admin-approve`);
};
