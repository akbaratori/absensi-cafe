import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import ProtectedRoute from './components/shared/ProtectedRoute';
import MainLayout from './components/layout/MainLayout';
import AuthLayout from './components/layout/AuthLayout';

// Pages
import LoginPage from './pages/auth/LoginPage';
import DashboardPage from './pages/employee/DashboardPage';


import AttendancePage from './pages/employee/AttendancePage';
import LeavePage from './pages/employee/LeavePage';
import MySchedulePage from './pages/employee/MySchedulePage';
import AdminDashboardPage from './pages/admin/AdminDashboardPage';
import UsersPage from './pages/admin/UsersPage';
import AttendanceAdminPage from './pages/admin/AttendanceAdminPage';
import LeaveApprovalPage from './pages/admin/LeaveApprovalPage';
import ReportsPage from './pages/admin/ReportsPage';
import SettingsPage from './pages/admin/SettingsPage';

import ShiftManagementPage from './pages/admin/ShiftManagementPage';
import SwapApprovalPage from './pages/admin/SwapApprovalPage';
import OffDayApprovalPage from './pages/admin/OffDayApprovalPage';
import ScheduleManagementPage from './pages/admin/ScheduleManagementPage';
import PayrollPage from './pages/admin/PayrollPage';
import JobdeskClosingPage from './pages/admin/JobdeskClosingPage';

// Components


// Public routes (login)
const PublicRoute = ({ children }) => {
  return <AuthLayout>{children}</AuthLayout>;
};

// Protected routes (require auth)
const EmployeeRoute = ({ children }) => {
  return (
    <ProtectedRoute>
      <MainLayout>{children}</MainLayout>
    </ProtectedRoute>
  );
};

// Admin routes (require admin)
const AdminRoute = ({ children }) => {
  return (
    <ProtectedRoute requireAdmin>
      <MainLayout>{children}</MainLayout>
    </ProtectedRoute>
  );
};

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ThemeProvider>
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 3000,
              style: {
                background: '#363636',
                color: '#fff',
              },
              success: {
                duration: 3000,
                iconTheme: {
                  primary: '#10b981',
                  secondary: '#fff',
                },
              },
              error: {
                duration: 5000,
                iconTheme: {
                  primary: '#ef4444',
                  secondary: '#fff',
                },
              },
            }}
          />

          <Routes>
            {/* Public routes */}
            <Route
              path="/login"
              element={
                <PublicRoute>
                  <LoginPage />
                </PublicRoute>
              }
            />

            {/* Protected employee routes */}
            <Route
              path="/dashboard"
              element={
                <EmployeeRoute>
                  <DashboardPage />
                </EmployeeRoute>
              }
            />

            <Route
              path="/attendance"
              element={
                <EmployeeRoute>
                  <AttendancePage />
                </EmployeeRoute>
              }
            />

            <Route
              path="/leaves"
              element={
                <EmployeeRoute>
                  <LeavePage />
                </EmployeeRoute>
              }
            />

            <Route
              path="/my-schedule"
              element={
                <EmployeeRoute>
                  <MySchedulePage />
                </EmployeeRoute>
              }
            />

            {/* Protected admin routes */}
            <Route
              path="/admin/dashboard"
              element={
                <AdminRoute>
                  <AdminDashboardPage />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/users"
              element={
                <AdminRoute>
                  <UsersPage />
                </AdminRoute>
              }
            />

            <Route
              path="/admin/attendance"
              element={
                <AdminRoute>
                  <AttendanceAdminPage />
                </AdminRoute>
              }
            />

            <Route
              path="/admin/leaves"
              element={
                <AdminRoute>
                  <LeaveApprovalPage />
                </AdminRoute>
              }
            />

            <Route
              path="/admin/reports"
              element={
                <AdminRoute>
                  <ReportsPage />
                </AdminRoute>
              }
            />

            <Route
              path="/admin/settings"
              element={
                <AdminRoute>
                  <SettingsPage />
                </AdminRoute>
              }
            />

            <Route
              path="/admin/shifts"
              element={
                <AdminRoute>
                  <ShiftManagementPage />
                </AdminRoute>
              }
            />

            <Route
              path="/admin/swaps"
              element={
                <AdminRoute>
                  <SwapApprovalPage />
                </AdminRoute>
              }
            />

            <Route
              path="/admin/off-days"
              element={
                <AdminRoute>
                  <OffDayApprovalPage />
                </AdminRoute>
              }
            />

            <Route
              path="/admin/schedules"
              element={
                <AdminRoute>
                  <ScheduleManagementPage />
                </AdminRoute>
              }
            />

            <Route
              path="/admin/payroll"
              element={
                <AdminRoute>
                  <PayrollPage />
                </AdminRoute>
              }
            />

            <Route
              path="/admin/jobdesk-closing"
              element={
                <AdminRoute>
                  <JobdeskClosingPage />
                </AdminRoute>
              }
            />



            {/* Default redirect */}
            <Route path="/" element={<Navigate to="/dashboard" replace />} />

            {/* 404 fallback */}
            <Route
              path="*"
              element={
                <div className="min-h-screen flex items-center justify-center">
                  <div className="text-center">
                    <h1 className="text-4xl font-bold text-gray-900 mb-4">404</h1>
                    <p className="text-gray-600 mb-4">Halaman tidak ditemukan</p>
                    <button
                      onClick={() => window.location.href = '/dashboard'}
                      className="text-primary-600 hover:text-primary-700 font-medium"
                    >
                      Ke Dasbor
                    </button>
                  </div>
                </div>
              }
            />
          </Routes>


        </ThemeProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
