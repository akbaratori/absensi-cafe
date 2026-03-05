import { useMemo } from 'react';

// ─── JOB DEFINITIONS (sama persis dengan JobdeskClosingPage) ──────────────────
const JOBS_4 = [
    { id: 'A', label: 'Pos A', icon: '🧹', tasks: ['Lap-lap meja', 'Cuci lap'], color: 'bg-blue-600' },
    { id: 'B', label: 'Pos B', icon: '🫧', tasks: ['Sapu lantai dapur', 'Pel lantai dapur'], color: 'bg-emerald-600' },
    { id: 'C', label: 'Pos C', icon: '🚿', tasks: ['Cuci piring', 'Bersihkan WC'], color: 'bg-amber-600' },
    { id: 'D', label: 'Pos D', icon: '🪑', tasks: ['Angkat bangku', 'Sapu luar', 'Pel luar'], color: 'bg-purple-600' },
];

const JOBS_5 = [
    { id: 'A', label: 'Pos A', icon: '🧹', tasks: ['Lap-lap meja', 'Cuci lap'], color: 'bg-blue-600' },
    { id: 'B', label: 'Pos B', icon: '🫧', tasks: ['Sapu lantai dapur', 'Pel lantai dapur'], color: 'bg-emerald-600' },
    { id: 'C', label: 'Pos C', icon: '🍽️', tasks: ['Cuci piring'], color: 'bg-amber-600' },
    { id: 'D', label: 'Pos D', icon: '🚿', tasks: ['Bersihkan WC', 'Angkat bangku'], color: 'bg-rose-600' },
    { id: 'E', label: 'Pos E', icon: '🪑', tasks: ['Sapu luar', 'Pel luar'], color: 'bg-purple-600' },
];

const getDayOffset = (startDateStr, targetDate) => {
    const start = new Date(startDateStr);
    start.setHours(0, 0, 0, 0);
    const target = new Date(targetDate);
    target.setHours(0, 0, 0, 0);
    return Math.floor((target - start) / (1000 * 60 * 60 * 24));
};

const DAY_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const MONTH_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

const ClosingTodayWidget = () => {
    const today = new Date();
    const todayStr = today.toLocaleDateString('en-CA'); // YYYY-MM-DD

    const assignments = useMemo(() => {
        try {
            const raw = localStorage.getItem('jobdesk_closing_config');
            if (!raw) return null;
            const { mode, names, startDate, endDate } = JSON.parse(raw);

            // Check if today is within range
            if (todayStr < startDate || todayStr > endDate) return null;
            if (!names || names.length === 0) return null;

            const jobs = mode === 5 ? JOBS_5 : JOBS_4;
            const dayOffset = getDayOffset(startDate, todayStr);
            const n = names.length;

            return jobs.map((job, jobIdx) => ({
                job,
                person: names[(jobIdx + dayOffset) % n],
            }));
        } catch {
            return null;
        }
    }, [todayStr]);

    if (!assignments) return null;

    const fmtToday = `${DAY_ID[today.getDay()]}, ${today.getDate()} ${MONTH_ID[today.getMonth()]} ${today.getFullYear()}`;

    return (
        <div className="mb-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
            {/* Header */}
            <div className="px-4 py-3 bg-gradient-to-r from-indigo-700 to-slate-700 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span>🧹</span>
                    <div>
                        <p className="font-semibold text-sm">Jobdesk Closing Hari Ini</p>
                        <p className="text-xs text-white/70">{fmtToday}</p>
                    </div>
                </div>
                <a
                    href="/admin/jobdesk-closing"
                    className="text-xs text-white/80 hover:text-white underline"
                >
                    Ubah Konfigurasi →
                </a>
            </div>

            {/* Assignments */}
            <div className="p-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {assignments.map(({ job, person }) => (
                        <div
                            key={job.id}
                            className={`${job.color} text-white rounded-lg p-3 shadow-sm`}
                        >
                            <div className="flex items-center gap-1.5 mb-1.5">
                                <span className="text-base">{job.icon}</span>
                                <span className="text-xs font-bold opacity-80">{job.label}</span>
                            </div>
                            <p className="font-bold text-sm leading-tight">{person}</p>
                            <ul className="mt-1.5 space-y-0.5">
                                {job.tasks.map((t, i) => (
                                    <li key={i} className="text-[10px] text-white/85 flex items-start gap-1">
                                        <span className="mt-px">·</span> {t}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default ClosingTodayWidget;
