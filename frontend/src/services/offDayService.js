import api from "./api";

export const createOffDayRequest = async (data) => {
  return await api.post("/off-days", data);
};

export const getOffDayRequests = async (status, isAdmin = false) => {
  const params = status ? { status } : {};
  // Both admin and user use the same endpoint - backend handles role-based filtering
  return await api.get("/off-days", { params });
};
