import api from './api';

export const createSwapRequest = async (data) => {
    return await api.post('/swaps', data);
};

// Backend: GET /swaps/my  -> { success, data: [...] }
export const getMySwaps = async (params) => {
    return await api.get('/swaps/my', { params });
};

// Backend: GET /swaps/inbox -> swaps yang menunggu respons saya (target)
export const getInbox = async () => {
    return await api.get('/swaps/inbox');
};

// Target user merespons: POST /swaps/:id/respond { action: 'ACCEPT' | 'REJECT' }
export const approveSwapByUser = async (swapId) => {
    return await api.post(`/swaps/${swapId}/respond`, { action: 'ACCEPT' });
};

export const rejectSwapByUser = async (swapId) => {
    return await api.post(`/swaps/${swapId}/respond`, { action: 'REJECT' });
};

// Admin
export const getAllSwaps = async (params) => {
    return await api.get('/swaps', { params });
};

export const getPendingAdminApproval = async () => {
    return await api.get('/swaps/pending-admin-approval');
};

// Admin approve/reject: POST /swaps/:id/approve { action: 'APPROVE' | 'REJECT' }
export const approveSwapByAdmin = async (swapId) => {
    return await api.post(`/swaps/${swapId}/approve`, { action: 'APPROVE' });
};

export const rejectSwapByAdmin = async (swapId) => {
    return await api.post(`/swaps/${swapId}/approve`, { action: 'REJECT' });
};

// Requester membatalkan pengajuan sendiri
export const cancelSwap = async (swapId) => {
    return await api.post(`/swaps/${swapId}/cancel`);
};

// Admin membatalkan swap yang sudah APPROVED (revert jadwal ke semula)
export const revertSwapByAdmin = async (swapId, note) => {
    return await api.post(`/swaps/${swapId}/revert`, { note });
};
