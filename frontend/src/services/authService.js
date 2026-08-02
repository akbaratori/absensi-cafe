import api from './api';

/**
 * Login user
 */
export const login = async (username, password) => {
  const response = await api.post('/auth/login', { username, password });
  return response.data;
};

/**
 * Refresh access token
 */
export const refreshToken = async (refreshToken) => {
  const response = await api.post('/auth/refresh', { refreshToken });
  return response.data;
};

/**
 * Logout user
 */
export const logout = async () => {
  const response = await api.post('/auth/logout');
  return response.data;
};

/**
 * Get current user info
 */
export const getCurrentUser = async () => {
  const response = await api.get('/auth/me');
  return response.data;
};
