import api from './api';

const rotationService = {
  // Posisi
  listPositions: () => api.get('/rotation'),
  getPosition: (id) => api.get(`/rotation/${id}`),
  createPosition: (data) => api.post('/rotation', data),
  updatePosition: (id, data) => api.put(`/rotation/${id}`, data),
  deletePosition: (id) => api.delete(`/rotation/${id}`),

  // Roster
  setRoster: (id, roster) => api.post(`/rotation/${id}/roster`, { roster }),
  insertRosterMember: (id, userId, orderIndex) =>
    api.post(`/rotation/${id}/roster/insert`, { userId, orderIndex }),
  removeRosterMember: (id, userId) =>
    api.post(`/rotation/${id}/roster/remove`, { userId }),

  // Jadwal
  generateWeek: (id, weekStart) =>
    api.post(`/rotation/${id}/generate-week`, { weekStart }),
  generateMonth: (id, month) =>
    api.post(`/rotation/${id}/generate-month`, { month }),
  getSchedule: (id, weekStart) =>
    api.get(`/rotation/${id}/schedule`, { params: { weekStart } }),
  listSchedules: (id, startWeek, endWeek) =>
    api.get(`/rotation/${id}/schedules`, { params: { startWeek, endWeek } }),

  // Semua jadwal posisi untuk satu minggu (FullSchedulePage)
  getAllSchedules: (weekStart) =>
    api.get('/rotation/all-schedules', { params: { weekStart } }),

  // Jadwal milik karyawan (skema rotasi baru)
  getMySchedule: (from, to) =>
    api.get('/rotation/my-schedule', { params: { from, to } }),

  // Manual Off-days
  getManualOffDays: (weekStart) =>
    api.get('/rotation/manual-off-days', { params: { weekStart } }),
  saveManualOffDays: (weekStart, offDays) =>
    api.post('/rotation/manual-off-days', { weekStart, offDays }),

  // Backup assignments
  listBackups: (date) =>
    api.get('/rotation/backups', { params: { date } }),
  getBackupCandidates: (date, absentPositionId) =>
    api.get('/rotation/backup-candidates', { params: { date, absentPositionId } }),
  createBackup: (data) =>
    api.post('/rotation/backups', data),
  deleteBackup: (id) =>
    api.delete(`/rotation/backups/${id}`),
};

export default rotationService;
