import api from './api';

export const updateSchedule = async (id, data) => {
    const response = await api.put(`/schedules/${id}`, data);
    return response.data;
};

export const deleteSchedule = async (id) => {
    const response = await api.delete(`/schedules/${id}`);
    return response.data;
};

export const upsertSingleSchedule = async (data) => {
    const response = await api.post('/schedules/single', data);
    return response.data;
};

export const updateUserScheduleCell = async (data) => {
    const response = await api.put('/schedules/user-schedule-cell', data);
    return response.data;
};
/**
 * Simpan banyak sel jadwal SEKALI jalan — dipakai tombol "Simpan Semua" di
 * Jadwal Lengkap. Admin menumpuk perubahan jobdesk/stasiun per staff per hari,
 * lalu mengirimnya dalam satu request supaya halaman tidak reload tiap sel.
 *
 * @param {Array<{userId: number, date: string, shiftId?: number|null,
 *   isOffDay?: boolean, kitchenStation?: string|null,
 *   temporaryDepartment?: string|null}>} changes
 * @returns {Promise<{success: boolean, message: string,
 *   data: {total: number, saved: number,
 *     failed: Array<{userId:number, date:string, message:string}>}}>}
 */
export const bulkUpdateUserScheduleCells = async (changes) => {
    const response = await api.put('/schedules/user-schedule-cell/bulk', { changes });
    return response.data;
};


/**
 * Ubah shift satu pegawai untuk RENTANG tanggal sekaligus.
 *
 * Dipakai tombol "Ubah shift beberapa hari" di halaman Jadwal Lengkap, supaya
 * admin tidak perlu mengklik satu sel per hari. Tanggal yang belum punya baris
 * jadwal tetap dibuat di backend, jadi tidak perlu generate ulang.
 *
 * @param {Object} data
 * @param {number} data.userId
 * @param {string} data.startDate - "YYYY-MM-DD"
 * @param {string} data.endDate   - "YYYY-MM-DD" (boleh sama dengan startDate)
 * @param {number} [data.shiftId] - wajib bila `isOffDay` tidak diisi
 * @param {boolean} [data.isOffDay]
 * @returns {Promise<{success: boolean, data: {updated: number, created: number,
 *   daysAffected: number, offDaysSkipped: string[]}}>}
 */
export const updateUserShiftRange = async (data) => {
    const response = await api.put('/schedules/user-shift-range', data);
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

export const getClosingConfig = async () => {
    const response = await api.get('/schedules/closing-config');
    return response.data;
};

export const saveClosingConfig = async (data) => {
    const response = await api.post('/schedules/closing-config', data);
    return response.data;
};

/**
 * Rekap keadilan jobdesk dapur (staff × jobdesk + beban rata-rata per hari kerja).
 * Dipakai panel "Rekap Keadilan Jobdesk" di halaman Jadwal Lengkap.
 * @param {string} month - "YYYY-MM"
 */
export const getJobdeskFairness = async (month) => {
    const response = await api.get('/schedules/jobdesk-fairness', { params: { month } });
    return response.data;
};

/**
 * Rekap jobdesk MILIK SENDIRI untuk satu bulan — dipakai halaman "Jadwal Saya".
 * Berbeda dari `getJobdeskFairness` (khusus admin), endpoint ini hanya
 * mengembalikan data user yang sedang login, jadi aman dipanggil EMPLOYEE.
 * @param {string} month - "YYYY-MM"
 */
export const getMyJobdeskSummary = async (month) => {
    const response = await api.get('/schedules/my-jobdesk-summary', { params: { month } });
    return response.data;
};

/**
 * Rangkuman JUMLAH jobdesk SELURUH pegawai untuk satu bulan (khusus admin).
 * Menjawab "pegawai ini sudah mengerjakan berapa jobdesk bulan ini?".
 * @param {string} month - "YYYY-MM"
 */
export const getJobdeskSummary = async (month) => {
    const response = await api.get('/schedules/jobdesk-summary', { params: { month } });
    return response.data;
};

/**
 * Sesuaikan angka kolom A–D rekap keadilan jobdesk seorang staf (khusus admin).
 * Backend memindahkan hari kerja antar stasiun sampai angkanya sama persis
 * dengan yang diinput, lalu mengirim balik daftar hari yang berubah.
 *
 * @param {Object} data
 * @param {string} data.month - "YYYY-MM"
 * @param {number} data.userId
 * @param {Object} data.targets - { A, B, C, D } target jumlah hari per stasiun utama
 * @returns {Promise<{success: boolean, data: {before: Object, after: Object,
 *   changedDays: number, changes: Array, coverageWarnings: Array}}>}
 */
export const adjustJobdeskFairness = async (data) => {
    const response = await api.put('/schedules/jobdesk-fairness/adjust', data);
    return response.data;
};

