import api from "./api";

// Employee: buat request tukar libur
// Body: { targetUserId, offDate, workDate, reason }
export const createOffDayRequest = async (data) => {
  return await api.post("/off-days", data);
};

// Employee: lihat semua request milik sendiri (sebagai requester)
export const getMyOffDayRequests = async (status) => {
  const params = status ? { status } : {};
  return await api.get("/off-days/my", { params });
};

// Employee: lihat inbox — request masuk yang butuh respons (status PENDING_TARGET_RESPONSE)
export const getOffDayInbox = async () => {
  return await api.get("/off-days/inbox");
};

// Employee (target): terima atau tolak request
// action: 'ACCEPT' | 'REJECT'
export const respondToOffDayRequest = async (id, action) => {
  return await api.post(`/off-days/${id}/respond`, { action });
};

// Employee (requester): batalkan request sendiri
export const cancelOffDayRequest = async (id) => {
  return await api.post(`/off-days/${id}/cancel`);
};

// Admin: ambil semua request (opsional filter status)
export const getOffDayRequests = async (status) => {
  const params = status ? { status } : {};
  return await api.get("/off-days", { params });
};

// Admin: ambil request yang butuh persetujuan admin (status PENDING_APPROVAL)
export const getPendingOffDayAdminApproval = async () => {
  return await api.get("/off-days/pending-admin-approval");
};

// Admin: setujui atau tolak request
// action: 'APPROVE' | 'REJECT'
export const approveOffDayByAdmin = async (id, action) => {
  return await api.post(`/off-days/${id}/approve`, { action });
};
