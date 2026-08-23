import axios from 'axios';

// Create axios instance with base configuration
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle common errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
      window.location.href = '/login';
    }

    // Network error — backend tidak bisa dijangkau (ECONNREFUSED / proxy 400/502/503)
    // Vite dev proxy mengembalikan 400 ketika backend mati, bukan error jaringan murni
    if (
      !error.response ||
      error.code === 'ERR_NETWORK' ||
      error.code === 'ECONNREFUSED' ||
      (error.response?.status === 400 &&
        error.response?.data?.toString?.().includes?.('connect ECONNREFUSED'))
    ) {
      // Jangan redirect, biarkan komponen menangani dengan try/catch
    }

    return Promise.reject(error);
  }
);

export default api;
