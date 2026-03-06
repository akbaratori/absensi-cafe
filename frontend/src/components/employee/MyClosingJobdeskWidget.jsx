import { useState, useEffect, useMemo } from 'react';
import { getClosingConfig, getAllSchedules } from '../../services/scheduleService';
import { useAuth } from '../../contexts/AuthContext';

// ─── JOB DEFINITIONS (harus sama dengan ClosingSetupPanel) ────────────────────
const JOBS_4 = [
    { id: 'A', label: 'Pos A', icon: '🧹', tasks: ['Lap-lap meja', 'Cuci lap'], color: 'from-blue-600 to-blue-700' },
    { id: 'B', label: 'Pos B', icon: '🫧', tasks: ['Sapu lantai dapur', 'Pel lantai dapur'], color: 'from-emerald-600 to-emerald-700' },
    { id: 'C', label: 'Pos C', icon: '🚿', tasks: ['Cuci piring', 'Bersihkan WC'], color: 'from-amber-600 to-amber-700' },
    { id: 'D', label: 'Pos D', icon: '🪑', tasks: ['Angkat bangku', 'Sapu luar', 'Pel luar'], color: 'from-purple-600 to-purple-700' },
];
const JOBS_5 = [
    { id: 'A', label: 'Pos A', icon: '🧹', tasks: ['Lap-lap meja', 'Cuci lap'], color: 'from-blue-600 to-blue-700' },
    { id: 'B', label: 'Pos B', icon: '🫧', tasks: ['Sapu lantai dapur', 'Pel lantai dapur'], color: 'from-emerald-600 to-emerald-700' },
    { id: 'C', label: 'Pos C', icon: '🍽️', tasks: ['Cuci piring'], color: 'from-amber-600 to-amber-700' },
    { id: 'D', label: 'Pos D', icon: '🚿', tasks: ['Bersihkan WC', 'Angkat bangku'], color: 'from-rose-600 to-rose-700' },
    { id: 'E', label: 'Pos E', icon: '🪑', tasks: ['Sapu luar', 'Pel luar'], color: 'from-purple-600 to-purple-700' },
];

const getDayOffset = (startDateStr, targetDateStr) => {
    const start = new Date(startDateStr + 'T00:00:00');
    const target = new Date(targetDateStr + 'T00:00:00');
    return Math.floor((target - start) / (1000 * 60 * 60 * 24));
};

const getDaysInRange = (start, end) => {
    const days = [];
    let cur = new Date(start + 'T00:00:00');
    const last = new Date(end + 'T00:00:00');
    while (cur <= last) {
        const y = cur.getFullYear(), m = String(cur.getMonth() + 1).padStart(2, '0'), d = String(cur.getDate()).padStart(2, '0');
        days.push(`${y}-${m}-${d}`);
        cur.setDate(cur.getDate() + 1);
    }
    return days;
};

const toLocalDateStr = (d) => {
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

const DAY_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const MONTH_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

/**
 * Widget untuk karyawan — menampilkan jobdesk closing mereka hari ini
 * jika mereka termasuk dalam rotasi closing yang dikonfigurasi admin
 */
const MyClosingJobdeskWidget = () => {
    const { user } = useAuth();
    const [config, setConfig] = useState(null);
    const [myAssignment, setMyAssignment] = useState(null); // { job, isOff }
    const [scheduleMap, setScheduleMap] = useState({}); // dateStr -> Set<userId>
    const [loading, setLoading] = useState(true);

    const today = new Date();
    const todayStr = toLocalDateStr(today);

    // Fetch closing config dari backend
    useEffect(() => {
        setLoading(true);
        getClosingConfig()
            .then(res => {
                const cfg = res?.data?.config;
                setConfig(cfg || null);
            })
            .catch(() => setConfig(null))
            .finally(() => setLoading(false));
    }, []);

    // Fetch jadwal libur untuk range Ramadhan
    useEffect(() => {
        if (!config?.startDate || !config?.endDate) return;
        getAllSchedules({ startDate: config.startDate, endDate: config.endDate })
            .then(res => {
                const schedules = res.data?.data || [];
                const map = {};
                schedules.forEach(s => {
                    if (!s.isOffDay) return;
                    const dateStr = s.date.substring(0, 10);
                    if (!map[dateStr]) map[dateStr] = new Set();
                    map[dateStr].add(s.userId);
                });
                setScheduleMap(map);
            })
            .catch(() => { });
    }, [config]);

    // Hitung assignment untuk hari ini
    const todayData = useMemo(() => {
        if (!config || !user) return null;

        const { mode, selectedUsers, startDate, endDate } = config;
        if (!selectedUsers || !startDate || !endDate) return null;
        if (todayStr < startDate || todayStr > endDate) return null;

        const workers = (selectedUsers || []).slice(0, mode).filter(Boolean);
        if (workers.length === 0) return null;

        // Cek apakah user ini termasuk dalam workers
        const myWorker = workers.find(w => w.userId === user.id);
        if (!myWorker) return null; // User tidak termasuk tim closing

        const jobs = mode === 5 ? JOBS_5 : JOBS_4;
        const n = workers.length;
        const days = getDaysInRange(startDate, endDate);
        const dayIdx = days.indexOf(todayStr);
        if (dayIdx === -1) return null;

        // Rotasi workers untuk hari ini
        const rotated = Array.from({ length: n }, (_, i) => workers[(i + dayIdx) % n]);
        const offToday = scheduleMap[todayStr] || new Set();
        const working = rotated.filter(w => !offToday.has(w.userId));

        if (offToday.has(user.id)) {
            return { isOff: true, job: null, tasks: [] };
        }

        if (working.length === 0) return null;

        // Cari job yang assigned ke user ini
        const myWorkingIdx = working.findIndex(w => w.userId === user.id);
        if (myWorkingIdx === -1) return null;

        // User ini dapat job index sesuai posisinya di working list
        const jobIdx = myWorkingIdx % jobs.length;
        const job = jobs[jobIdx];

        return { isOff: false, job, tasks: job.tasks };
    }, [config, user, todayStr, scheduleMap]);

    if (loading) return null;
    if (!config || !todayData) return null;

    const fmtToday = `${DAY_ID[today.getDay()]}, ${today.getDate()} ${MONTH_ID[today.getMonth()]}`;

    if (todayData.isOff) {
        return (
            <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 mb-4">
                <div className="flex items-center gap-2">
                    <span>🧹</span>
                    <div>
                        <p className="font-semibold text-sm text-gray-800 dark:text-gray-200">Jobdesk Closing — {fmtToday}</p>
                        <p className="text-xs text-gray-500">Kamu libur hari ini — tidak ada tugas closing 🎉</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={`bg-gradient-to-br ${todayData.job.color} text-white rounded-xl p-4 mb-4 shadow-lg`}>
            <div className="flex items-start justify-between">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg">{todayData.job.icon}</span>
                        <p className="font-bold text-sm">Jobdesk Closing Hari Ini</p>
                    </div>
                    <p className="text-white/70 text-xs mb-3">{fmtToday}</p>
                    <p className="font-bold text-lg">{todayData.job.label}</p>
                    <ul className="mt-2 space-y-1">
                        {todayData.tasks.map((t, i) => (
                            <li key={i} className="text-sm text-white/90 flex items-center gap-1.5">
                                <span className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center text-xs">✓</span>
                                {t}
                            </li>
                        ))}
                    </ul>
                </div>
                <span className="text-4xl opacity-30">{todayData.job.icon}</span>
            </div>
        </div>
    );
};

export default MyClosingJobdeskWidget;
