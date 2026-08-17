import api from './api';

const rotationService = {
  // Posisi
  listPositions: () => api.get('/rotation'),
  getPosition: (id) => api.get(`/rotation/${id}`),
  createPosition: (data) => api.post('/rotation', data),
  updatePosition: (id, data) => api.put(`/rotation/${id}`, data),

  // Roster
  setRoster: (id, roster) => api.post(`/rotation/${id}/roster`, { roster }),
  insertRosterMember: (id, userId, orderIndex) =>
    api.post(`/rotation/${id}/roster/insert`, { userId, orderIndex }),
  removeRosterMember: (id, userId) =>
    api.post(`/rotation/${id}/roster/remove`, { userId }),

  // Jadwal
  generateWeek: (id, weekStart) =>
    api.post(`/rotation/${id}/generate-week`, { weekStart }),
  getSchedule: (id, weekStart) =>
    api.get(`/rotation/${id}/schedule`, { params: { weekStart } }),
  listSchedules: (id, startWeek, endWeek) =>
    api.get(`/rotation/${id}/schedules`, { params: { startWeek, endWeek } }),
};

export default rotationService;