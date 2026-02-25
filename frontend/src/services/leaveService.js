import api from './api';

/**
 * Get current user's leave quota and balance
 * @returns {Promise} Response with quota details
 */
export const getLeaveQuota = async () => {
    return await api.get('/leaves/quota');
};

/**
 * Create a new leave request
 * @param {FormData} formData - Leave data including proof file
 * @returns {Promise} Response
 */
export const createLeave = async (formData) => {
    return await api.post('/leaves', formData, {
        headers: {
            'Content-Type': 'multipart/form-data',
        },
    });
};

/**
 * Get current user's leave history
 * @returns {Promise} Response with list of leaves
 */
export const getMyLeaves = async () => {
    return await api.get('/leaves/my-leaves');
};
