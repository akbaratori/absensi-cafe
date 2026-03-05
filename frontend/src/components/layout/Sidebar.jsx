import { NavLink } from 'react-router-dom';
import { Home, Users, FileText, BarChart3, Settings, LogOut, Clock, Brain, Sparkles, Calendar, CheckSquare, DollarSign } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useState } from 'react';

const Sidebar = ({ isOpen, onClose }) => {
  const { user, logout, isAdmin } = useAuth();

  const menuItems = [
    {
      name: 'Dasbor',
      path: '/dashboard',
      icon: Home,
    },
    {
      name: 'Absensi Saya',
      path: '/attendance',
      icon: Clock,
    },
    {
      name: 'Jadwal Saya',
      path: '/my-schedule',
      icon: Calendar,
    },
    {
      name: 'Pengajuan Cuti',
      path: '/leaves',
      icon: Calendar,
    },
  ];

  const adminMenuItems = [
    {
      name: 'Dashboard',
      path: '/admin/dashboard',
      icon: Home,
    },
    {
      name: 'Pengguna',
      path: '/admin/users',
      icon: Users,
    },
    {
      name: 'Data Absensi',
      path: '/admin/attendance',
      icon: FileText,
    },
    {
      name: 'Persetujuan Cuti',
      path: '/admin/leaves',
      icon: CheckSquare,
    },
    {
      name: 'Laporan',
      path: '/admin/reports',
      icon: BarChart3,
    },
    {
      name: 'Payroll (Gaji)',
      path: '/admin/payroll',
      icon: DollarSign,
    },

    {
      name: 'Shift',
      path: '/admin/shifts',
      icon: Clock,
    },
    {
      name: 'Jadwal Rolling',
      path: '/admin/schedules',
      icon: Calendar,
    },
    {
      name: '🌙 Jobdesk Closing',
      path: '/admin/jobdesk-closing',
      icon: Calendar,
    },
    {
      name: 'Tukar Shift',
      path: '/admin/swaps',
      icon: Calendar,
    },
    {
      name: 'Tukar Libur',
      path: '/admin/off-days',
      icon: Calendar,
    },
    {
      name: 'Pengaturan',
      path: '/admin/settings',
      icon: Settings,
    },
  ];

  const handleLogout = async () => {
    await logout();
    window.location.href = '/login';
  };

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-20 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
        fixed top-0 left-0 h-full w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 z-30
        transform transition-transform duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0
      `}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-between h-16 px-6 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center shadow-lg shadow-primary-500/30">
                <Clock className="w-5 h-5 text-white" />
              </div>
              <span className="text-lg font-bold text-gray-900 dark:text-white">Absensi Cafe</span>
            </div>
            <button
              onClick={onClose}
              className="lg:hidden p-2 rounded-md hover:bg-gray-100"
            >
              ✕
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
            {/* Employee menu */}
            {menuItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={() => onClose()}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${isActive
                    ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400'
                    : 'text-gray-700 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:translate-x-1'
                  }`
                }
              >
                <item.icon className="w-5 h-5" />
                {item.name}
              </NavLink>
            ))}

            {/* Admin menu */}
            {isAdmin && (
              <>
                <div className="pt-6 pb-2">
                  <p className="px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Admin
                  </p>
                </div>
                {adminMenuItems.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    onClick={() => onClose()}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${isActive
                        ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400'
                        : 'text-gray-700 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:translate-x-1'
                      }`
                    }
                  >
                    <item.icon className="w-5 h-5" />
                    {item.name}
                  </NavLink>
                ))}
              </>
            )}
          </nav>

          {/* User info + logout */}
          <div className="p-4 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-700/50">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                  {user?.fullName}
                </p>
                <p className="text-xs text-gray-600 dark:text-gray-400 truncate">
                  {user?.role === 'ADMIN' ? 'Administrator' : 'Karyawan'}
                </p>
              </div>
              <button
                onClick={handleLogout}
                className="p-2 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                title="Logout"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
