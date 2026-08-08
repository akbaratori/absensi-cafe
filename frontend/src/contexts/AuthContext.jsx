import { createContext, useContext, useState, useEffect } from 'react';
import { login as loginApi, logout as logoutApi, getCurrentUser } from '../services/authService';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Initialize auth state on mount
  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem('token');
      if (token) {
        try {
          const response = await getCurrentUser();
          const payload = response.data || response;
          const userData = payload.data || payload;
          setUser(userData);
          setIsAuthenticated(true);
        } catch (error) {
          console.error('Auth initialization failed:', error);
          if (error.response && error.response.status === 401) {
            localStorage.removeItem('token');
            localStorage.removeItem('refreshToken');
          }
        }
      }
      setLoading(false);
    };

    initAuth();
  }, []);

  const login = async (username, password) => {
    const response = await loginApi(username, password);

    // Backend wraps payload in response.data.data
    const payload = response.data || response;
    const authData = payload.data || payload;

    // Store tokens
    localStorage.setItem('token', authData.accessToken);
    localStorage.setItem('refreshToken', authData.refreshToken);

    // Set user state
    setUser(authData.user);
    setIsAuthenticated(true);

    return authData;
  };

  const logout = async () => {
    try {
      await logoutApi();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
      setUser(null);
      setIsAuthenticated(false);
    }
  };

  const isAdmin = user?.role === 'ADMIN';

  const value = {
    user,
    isAuthenticated,
    isAdmin,
    loading,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
