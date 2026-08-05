import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import ProtectedRoute from './components/shared/ProtectedRoute';
import ErrorBoundary from './components/shared/ErrorBoundary';
import MainLayout from './components/layout/MainLayout';
import AuthLayout from './components/layout/AuthLayout';
import NotificationPermissionBanner from './components/NotificationPermissionBanner';

// Pages
import LoginPage from './pages/auth/LoginPage';
import DashboardPage from './pages/employee/DashboardPage';
import AttendancePage from './pages/employee/AttendancePage';
import LeavePage from './pages/employee/LeavePage';
import MySchedulePage from './pages/employee/MySchedulePage';
import OvertimePage from './pages/employee/OvertimePage';
import AdminDashboardPage from './pages/admin/AdminDashboardPage';
import UsersPage from './pages/admin/UsersPage';
import AttendanceAdminPage from './pages/admin/AttendanceAdminPage';
import LeaveApprovalPage from './pages/admin/LeaveApprovalPage';
import OvertimeApprovalPage from './pages/admin/OvertimeApprovalPage';
import ScheduleManagementPage from './pages/admin/ScheduleManagementPage';
import PayrollPage from './pages/admin/PayrollPage';
import JobdeskClosingPage from './pages/admin/JobdeskClosingPage';

// Components

// Public routes (login)
const PublicRoute = ({ children }) => {
  return <AuthLayout>{children}</AuthLayout>;
};

const App = () => {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <ThemeProvider>
          <BrowserRouter>
            <Toaster position="top-right" />
            <NotificationPermissionBanner />
            <Routes>
              <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
              
              <Route path="/" element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
                {/* Employee Routes */}
                <Route index element={<DashboardPage />} />
                <Route path="attendance" element={<AttendancePage />} />
                <Route path="leave" element={<LeavePage />} />
                <Route path="schedule" element={<MySchedulePage />} />
                <Route path="overtime" element={<OvertimePage />} />

                {/* Admin Routes */}
                <Route path="admin/dashboard" element={<AdminDashboardPage />} />
                <Route path="admin/users" element={<UsersPage />} />
                <Route path="admin/attendance" element={<AttendanceAdminPage />} />
                <Route path="admin/leave" element={<LeaveApprovalPage />} />
                <Route path="admin/overtime" element={<OvertimeApprovalPage />} />
                <Route path="admin/schedule" element={<ScheduleManagementPage />} />
                <Route path="admin/payroll" element={<PayrollPage />} />
                <Route path="admin/jobdesk" element={<JobdeskClosingPage />} />
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </ThemeProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
};

export default App;