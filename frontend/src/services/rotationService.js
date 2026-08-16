import api from './api';

const rotationService = {
  // Posisi
  listPositions: () => api.get('/rotation/positions'),
  getPosition: (id) => api.get(`/rotation/positions/${id}`),
  createPosition: (data) => api.post('/rotation/positions', data),
  updatePosition: (id, data) => api.put(`/rotation/positions/${id}`, data),

  // Roster
  setRoster: (id, userIds) => api.put(`/rotation/positions/${id}/roster`, { userIds }),
  insertRosterMember: (id, userId, orderIndex) =>
    api.post(`/rotation/positions/${id}/roster`, { userId, orderIndex }),
  removeRosterMember: (id, userId) =>
    api.delete(`/rotation/positions/${id}/roster/${userId}`),

  // Jadwal
  generateWeek: (id, weekStart) =>
    api.post(`/rotation/positions/${id}/generate-week`, { weekStart }),
  getSchedule: (id, weekStart) =>
    api.get(`/rotation/positions/${id}/schedule`, { params: { weekStart } }),
  listSchedules: (id, startWeek, endWeek) =>
    api.get(`/rotation/positions/${id}/schedules`, { params: { startWeek, endWeek } }),
};

export default rotationService;

export const listPositions = () => api.get('/rotation/positions');
export const createPosition = (data) => api.post('/rotation/positions', data);
export const getPosition = (id) => api.get(`/rotation/positions/${id}`);
export const updatePosition = (id, data) => api.put(`/rotation/positions/${id}`, data);
export const setRoster = (id, userIds) => api.put(`/rotation/positions/${id}/roster`, { userIds });
export const insertRosterMember = (id, userId, orderIndex) =>
  api.post(`/rotation/positions/${id}/roster`, { userId, orderIndex });
export const removeRosterMember = (id, userId) =>
  api.delete(`/rotation/positions/${id}/roster/${userId}`);
export const generateWeek = (id, weekStart) =>
  api.post(`/rotation/positions/${id}/generate-week`, { weekStart });
export const getSchedule = (id, weekStart) =>
  api.get(`/rotation/positions/${id}/schedule`, { params: { weekStart } });
