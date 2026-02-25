import api from './api';

// Helper to create FormData
const createAttendanceFormData = (location, notes, photo) => {
  const formData = new FormData();
  if (location) {
    formData.append('location[latitude]', location.latitude);
    formData.append('location[longitude]', location.longitude);
  }
  if (notes) formData.append('notes', notes);
  if (photo) {
    // Convert base64 to blob if needed, or append file directly
    // Assuming photo is a File object or Blob
    formData.append('photo', photo, 'photo.jpg');
  }
  return formData;
};


/**
 * Clock in
 */
export const clockIn = async (location, notes, photo) => {
  // If photo is base64 string (from react-webcam), convert to blob
  let photoBlob = photo;
  if (typeof photo === 'string' && photo.startsWith('data:image')) {
    const res = await fetch(photo);
    photoBlob = await res.blob();
  }

  const formData = createAttendanceFormData(location, notes, photoBlob);

  const response = await api.post('/attendance/clock-in', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

/**
 * Clock out
 */
export const clockOut = async (location, photo) => {
  // If photo is base64 string (from react-webcam), convert to blob
  let photoBlob = photo;
  if (typeof photo === 'string' && photo.startsWith('data:image')) {
    const res = await fetch(photo);
    photoBlob = await res.blob();
  }

  const formData = createAttendanceFormData(location, null, photoBlob);

  const response = await api.post('/attendance/clock-out', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

/**
 * Get today's attendance
 */
export const getTodayAttendance = async () => {
  const response = await api.get('/attendance/today');
  return response.data;
};

/**
 * Get attendance history
 */
export const getAttendanceHistory = async (params = {}) => {
  const response = await api.get('/attendance/history', { params });
  return response.data;
};

/**
 * Get specific attendance record
 */
export const getAttendanceById = async (id) => {
  const response = await api.get(`/attendance/${id}`);
  return response.data;
};

/**
 * Get monthly summary for dashboard
 */
export const getMonthlySummary = async (month) => {
  const response = await api.get('/attendance/monthly-summary', {
    params: { month }
  });
  return response.data;
};

// Admin services

/**
 * Get all attendance records (admin)
 */
export const getAllAttendance = async (params = {}) => {
  const response = await api.get('/admin/attendance', { params });
  return response.data;
};

/**
 * Update attendance record (admin)
 */
export const updateAttendance = async (id, data) => {
  const response = await api.put(`/admin/attendance/${id}`, data);
  return response.data;
};

/**
 * Get daily report (admin)
 */
export const getDailyReport = async (params = {}) => {
  const response = await api.get('/admin/reports/daily', { params });
  return response.data;
};

/**
 * Get monthly report (admin)
 */
export const getMonthlyReport = async (params = {}) => {
  const response = await api.get('/admin/reports/monthly', { params });
  return response.data;
};

/**
 * Export report as CSV (admin)
 */
export const exportReport = async (params = {}) => {
  const response = await api.get('/admin/reports/export', {
    params,
    responseType: 'blob',
  });
  return response;
};
