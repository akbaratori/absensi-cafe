import axios from 'axios';

// Resolve API base URL.
// Jika VITE_API_URL tidak diset di environment Vercel, default '/api/v1' akan
// memanggil domain frontend sendiri — jika domain itu deployment Vercel lain
// (serverless), request jadi bocor ke instance salah & kena rate limit kecil.
// Di production tanpa VITE_API_URL, fallback ke backend Render yang diketahui.
const resolveBaseURL = () => {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
  if (import.meta.env.DEV) return '/api/v1';
  return 'https://absensi-cafe-backend.onrender.com/api/v1';
};

// Create axios instance with base configuration
const api = axios.create({
  baseURL: resolveBaseURL(),
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
