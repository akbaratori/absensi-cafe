import api from './api';

export const getPublicSchedule = (startDate, endDate) => {
    return api.get('/public/schedule', {
        params: { startDate, endDate }
    });
};
