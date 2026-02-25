import React from 'react';
import { Lightbulb, AlertTriangle, CheckCircle, Info } from 'lucide-react';
import Card from './Card';

const DashboardInsights = ({ stats }) => {
    if (!stats) return null;

    const insights = [];
    const { summary, pendingLeaves } = stats;
    const totalEmployees = summary?.totalEmployees || 0;
    const present = summary?.present || 0;
    const late = summary?.late || 0;
    const absent = summary?.absent || 0;

    // Rule 1: High Attendance
    if (totalEmployees > 0) {
        const attendanceRate = ((present + late) / totalEmployees) * 100;
        if (attendanceRate >= 90) {
            insights.push({
                type: 'success',
                icon: CheckCircle,
                title: 'Tingkat Kehadiran Tinggi',
                message: `Luar biasa! ${Math.round(attendanceRate)}% karyawan hadir hari ini.`,
            });
        } else if (attendanceRate < 50 && attendanceRate > 0) {
            insights.push({
                type: 'warning',
                icon: AlertTriangle,
                title: 'Kehadiran Rendah',
                message: `Perhatian, hanya ${Math.round(attendanceRate)}% karyawan yang hadir saat ini.`,
            });
        }
    }

    // Rule 2: Lateness
    if (late > 0) {
        insights.push({
            type: 'warning',
            icon: ClockIcon, // Will define below
            title: 'Keterlambatan Terdeteksi',
            message: `Ada ${late} karyawan yang terlambat hari ini. Perlu evaluasi kedisiplinan.`,
        });
    }

    // Rule 3: Pending Leaves
    if (pendingLeaves > 0) {
        insights.push({
            type: 'info',
            icon: Info,
            title: 'Persetujuan Cuti Menunggu',
            message: `Terdapat ${pendingLeaves} pengajuan cuti yang perlu respon Anda segera.`,
        });
    }

    // Rule 4: Perfect Day (Everything 0 issues)
    if (late === 0 && absent === 0 && pendingLeaves === 0 && present > 0) {
        insights.push({
            type: 'success',
            icon: CheckCircle,
            title: 'Operasional Sempurna',
            message: 'Tidak ada keterlambatan atau absen tanpa keterangan hari ini.',
        });
    }

    // Rule 5: Empty State / Early Morning
    if (insights.length === 0) {
        insights.push({
            type: 'neutral',
            icon: Lightbulb,
            title: 'Menunggu Aktivitas',
            message: 'Belum ada cukup data untuk memberikan wawasan hari ini.',
        });
    }

    return (
        <Card className="h-full">
            <Card.Header className="flex items-center gap-2 border-b border-gray-100 dark:border-gray-700 pb-3">
                <Lightbulb className="w-5 h-5 text-yellow-500" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Smart Insights</h3>
            </Card.Header>
            <div className="p-4 space-y-4">
                {insights.map((insight, index) => (
                    <div key={index} className={`flex gap-3 p-3 rounded-lg ${getBgColor(insight.type)}`}>
                        <insight.icon className={`w-5 h-5 flex-shrink-0 ${getTextColor(insight.type)}`} />
                        <div>
                            <p className={`text-sm font-semibold ${getTextColor(insight.type)}`}>{insight.title}</p>
                            <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">{insight.message}</p>
                        </div>
                    </div>
                ))}
            </div>
        </Card>
    );
};

// Helpers
const ClockIcon = (props) => (
    <svg
        {...props}
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
    </svg>
);

const getBgColor = (type) => {
    switch (type) {
        case 'success': return 'bg-green-50 dark:bg-green-900/20';
        case 'warning': return 'bg-amber-50 dark:bg-amber-900/20';
        case 'info': return 'bg-blue-50 dark:bg-blue-900/20';
        default: return 'bg-gray-50 dark:bg-gray-800';
    }
};

const getTextColor = (type) => {
    switch (type) {
        case 'success': return 'text-green-700 dark:text-green-400';
        case 'warning': return 'text-amber-700 dark:text-amber-400';
        case 'info': return 'text-blue-700 dark:text-blue-400';
        default: return 'text-gray-700 dark:text-gray-400';
    }
};

export default DashboardInsights;
