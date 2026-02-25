import { useState, useEffect } from 'react';
import { Users, Clock, AlertCircle, CheckCircle } from 'lucide-react';
import Card from '../../components/shared/Card';
import { getDashboardStats } from '../../services/adminService';
import { formatTime } from '../../utils/formatters';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import DashboardInsights from '../../components/shared/DashboardInsights';

const AdminDashboardPage = () => {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const response = await getDashboardStats();
                setStats(response.data);
            } catch (error) {
                console.error('Failed to fetch dashboard stats:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchStats();
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center text-center h-64">
                <div className="animate-pulse text-gray-400">Loading dashboard...</div>
            </div>
        );
    }

    const statCards = [
        {
            title: 'Total Karyawan',
            value: stats?.summary?.totalEmployees || 0,
            icon: Users,
            color: 'text-blue-600',
            bg: 'bg-blue-100',
        },
        {
            title: 'Hadir Hari Ini',
            value: (stats?.summary?.present || 0) + (stats?.summary?.late || 0) + (stats?.summary?.halfDay || 0),
            icon: CheckCircle,
            color: 'text-green-600',
            bg: 'bg-green-100',
        },
        {
            title: 'Terlambat',
            value: stats?.summary?.late || 0,
            icon: Clock,
            color: 'text-amber-600',
            bg: 'bg-amber-100',
        },
        {
            title: 'Pending Cuti',
            value: stats?.pendingLeaves || 0,
            icon: AlertCircle,
            color: 'text-purple-600',
            bg: 'bg-purple-100',
        },
    ];

    const chartData = [
        { name: 'Tepat Waktu', value: stats?.summary?.present || 0, fill: '#86efac' }, // Soft Green
        { name: 'Terlambat', value: stats?.summary?.late || 0, fill: '#fcd34d' }, // Soft Yellow
        { name: 'Setengah Hari', value: stats?.summary?.halfDay || 0, fill: '#93c5fd' }, // Soft Blue
        { name: 'Absen/Cuti', value: stats?.summary?.absent || 0, fill: '#fca5a5' }, // Soft Red
        { name: 'Belum Absen', value: stats?.summary?.notClockedIn || 0, fill: '#cbd5e1' }, // Soft Slate
    ];

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard Admin</h1>
                <p className="text-gray-600 dark:text-gray-400 mt-1">Ringkasan aktivitas hari ini</p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {statCards.map((stat, index) => (
                    <Card key={index} className="p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{stat.title}</p>
                                <p className={`text-3xl font-bold mt-2 ${stat.color}`}>{stat.value}</p>
                            </div>
                            <div className={`p-3 rounded-full ${stat.bg}`}>
                                <stat.icon className={`w-6 h-6 ${stat.color}`} />
                            </div>
                        </div>
                    </Card>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Chart Section */}
                <div className="lg:col-span-2">
                    <Card className="p-6 h-[400px]">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Grafik Kehadiran Hari Ini</h3>
                        <div className="h-[300px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis
                                        dataKey="name"
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fill: '#64748b', fontSize: 12 }}
                                        dy={10}
                                    />
                                    <YAxis
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fill: '#64748b', fontSize: 12 }}
                                        allowDecimals={false}
                                    />
                                    <Tooltip
                                        cursor={{ fill: '#f8fafc' }}
                                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    />
                                    <Bar
                                        dataKey="value"
                                        radius={[6, 6, 0, 0]}
                                        barSize={40}
                                        animationDuration={1000}
                                    >
                                        {chartData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.fill} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </Card>
                </div>

                {/* Insights Section */}
                <div className="lg:col-span-1">
                    <DashboardInsights stats={stats} />
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Recent Activity */}
                <div className="lg:col-span-3">
                    <Card className="h-full">
                        <Card.Header>
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Aktivitas Terbaru</h3>
                        </Card.Header>
                        <div className="divide-y divide-gray-200 dark:divide-gray-700">
                            {stats?.recentActivity?.length > 0 ? (
                                stats.recentActivity.map((activity, idx) => (
                                    <div key={idx} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <p className="font-medium text-gray-900 dark:text-white">{activity.user.fullName}</p>
                                                <p className="text-xs text-gray-500 dark:text-gray-400">{activity.user.employeeId}</p>
                                            </div>
                                            <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                                                {formatTime(activity.clockIn)}
                                            </span>
                                        </div>
                                        <div className="mt-2 flex items-center gap-2">
                                            <span className={`text-xs px-2 py-0.5 rounded-full ${activity.status === 'LATE' ? 'bg-amber-100 text-amber-800' :
                                                activity.status === 'PRESENT' ? 'bg-green-100 text-green-800' :
                                                    'bg-gray-100 text-gray-800'
                                                }`}>
                                                {activity.status}
                                            </span>
                                            {activity.clockOut && (
                                                <span className="text-xs text-gray-500">
                                                    Out: {formatTime(activity.clockOut)}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="p-4 text-center text-gray-500">Belum ada aktivitas hari ini</div>
                            )}
                        </div>
                        <div className="p-4 border-t border-gray-200">
                            <a href="/admin/attendance" className="text-sm text-primary-600 hover:text-primary-700 font-medium">
                                Lihat Semua Aktivitas &rarr;
                            </a>
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
};

export default AdminDashboardPage;
