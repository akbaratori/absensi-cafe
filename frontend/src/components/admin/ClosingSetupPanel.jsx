import { useState, useEffect, useMemo, useCallback } from 'react';
import { getUsers } from '../../services/adminService';
import { getAllSchedules, getClosingConfig, saveClosingConfig } from '../../services/scheduleService';

// ─── JOB DEFINITIONS (3 posisi, berlaku untuk 4 maupun 5 orang) ──────────────
const JOBS = [
    { id: 'A', label: 'Pos A — Dapur Dalam', icon: '🧹', tasks: ['Lap-lap meja', 'Cuci lap'], color: 'from-blue-600 to-blue-700' },
    { id: 'B', label: 'Pos B — Dapur Dalam', icon: '🫧', tasks: ['Sapu lantai dapur', 'Pel lantai dapur', 'Cuci piring'], color: 'from-emerald-600 to-emerald-700' },
    { id: 'C', label: 'Pos C — Dapur Luar', icon: '🪑', tasks: ['Angkat bangku', 'Sapu luar', 'Pel luar', 'Bersihkan WC'], color: 'from-purple-600 to-purple-700' },
];

const DAY_ID = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const MONTH_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const fmtDate = (d) => `${DAY_ID[d.getDay()]}, ${d.getDate()} ${MONTH_ID[d.getMonth()]}`;

const getDaysInRange = (start, end) => {
    const days = [];
    let cur = new Date(start);
    const last = new Date(end);
    while (cur <= last) { days.push(new Date(cur)); cur.setDate(cur.getDate() + 1); }
    return days;
};

const toLocalDateStr = (d) => {
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

const STORAGE_KEY = 'jobdesk_closing_config_v2';

// ─── ASSIGNMENT LOGIC ────────────────────────────────────────────────────────
/**
 * For a given day, compute task assignments considering who is OFF.
 * Workers rotate base position each day (dayIdx).
 * OFF workers are skipped; tasks are redistributed (combined) to those working.
 */
const computeDayAssignments = (workers, jobs, dayIdx, offUserIds = new Set()) => {
    const n = workers.length;
    // Rotate worker order for this day
    const rotated = Array.from({ length: n }, (_, i) => workers[(i + dayIdx) % n]);
    const working = rotated.filter(w => !offUserIds.has(w.userId));

    if (working.length === 0) {
        return jobs.map(j => ({ job: j, person: '—', isOff: true }));
    }

    // Distribute jobs round-robin among working members
    const result = jobs.map((job, jobIdx) => ({
        job,
        person: working[jobIdx % working.length].name,
        isOff: false,
    }));

    return result;
};

// ─── COMPONENT ────────────────────────────────────────────────────────────────
const ClosingSetupPanel = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [mode, setMode] = useState(4);
    const [allEmployees, setAllEmployees] = useState([]);
    const [selectedUsers, setSelectedUsers] = useState(Array(5).fill(null)); // { userId, name }
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [saved, setSaved] = useState(false);
    const [viewAll, setViewAll] = useState(false);

    // Schedule off-day data fetched from API
    const [scheduleMap, setScheduleMap] = useState({}); // { 'YYYY-MM-DD': Set<userId> }
    const [scheduleLoading, setScheduleLoading] = useState(false);

    const today = new Date();
    const todayStr = toLocalDateStr(today);
    const jobs = mode === 5 ? JOBS_5 : JOBS_4;

    // Load employees — dijalankan SELALU saat mount (bukan bergantung isOpen)
    useEffect(() => {
        getUsers({ limit: 100, page: 1, status: 'active' }).then(res => {
            // res = { success, data: { users: [...], pagination } }
            const list = res?.data?.users ?? res?.users ?? [];
            // Tampilkan semua karyawan aktif (EMPLOYEE), fallback ke semua jika kosong
            const employees = list.filter(u => u.role === 'EMPLOYEE');
            setAllEmployees(employees.length > 0 ? employees : list);
        }).catch(err => console.error('[ClosingSetupPanel] getUsers:', err));
    }, []);

    // Load saved config — coba dari backend dulu, fallback ke localStorage
    useEffect(() => {
        getClosingConfig().then(res => {
            const cfg = res?.data?.config;
            if (cfg) {
                setMode(cfg.mode || 4);
                setSelectedUsers(cfg.selectedUsers || Array(5).fill(null));
                setStartDate(cfg.startDate || '');
                setEndDate(cfg.endDate || '');
                setSaved(true);
                // Sync ke localStorage sebagai cache
                localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
            } else {
                // Fallback localStorage
                try {
                    const raw = localStorage.getItem(STORAGE_KEY);
                    if (raw) {
                        const cfg2 = JSON.parse(raw);
                        setMode(cfg2.mode || 4);
                        setSelectedUsers(cfg2.selectedUsers || Array(5).fill(null));
                        setStartDate(cfg2.startDate || '');
                        setEndDate(cfg2.endDate || '');
                        setSaved(true);
                    }
                } catch { }
            }
        }).catch(() => {
            // Fallback localStorage jika API gagal
            try {
                const raw = localStorage.getItem(STORAGE_KEY);
                if (!raw) return;
                const cfg2 = JSON.parse(raw);
                setMode(cfg2.mode || 4);
                setSelectedUsers(cfg2.selectedUsers || Array(5).fill(null));
                setStartDate(cfg2.startDate || '');
                setEndDate(cfg2.endDate || '');
                setSaved(true);
            } catch { }
        });
    }, []);

    // Fetch schedule off-days when dates or users change
    const fetchSchedules = useCallback(async () => {
        if (!startDate || !endDate) return;
        const workerIds = selectedUsers.slice(0, mode).filter(Boolean).map(u => u.userId);
        if (workerIds.length === 0) return;

        setScheduleLoading(true);
        try {
            const res = await getAllSchedules({ startDate, endDate });
            const schedules = res.data?.data || [];

            // Build map: dateStr -> Set of userId who are OFF
            const map = {};
            schedules.forEach(s => {
                if (!s.isOffDay) return;
                if (!workerIds.includes(s.userId)) return;
                const dateStr = s.date.substring(0, 10);
                if (!map[dateStr]) map[dateStr] = new Set();
                map[dateStr].add(s.userId);
            });
            setScheduleMap(map);
        } catch (err) {
            console.error('Failed to fetch schedules for closing panel', err);
        } finally {
            setScheduleLoading(false);
        }
    }, [startDate, endDate, JSON.stringify(selectedUsers.slice(0, mode)), mode]);

    useEffect(() => {
        if (saved) fetchSchedules();
    }, [saved, fetchSchedules]);

    const workers = selectedUsers.slice(0, mode).filter(Boolean);

    const handleSave = () => {
        if (workers.length < mode) { alert(`Pilih ${mode} karyawan terlebih dahulu.`); return; }
        if (!startDate || !endDate) { alert('Masukkan tanggal Ramadhan.'); return; }
        const cfg = { mode, selectedUsers, startDate, endDate };
        // Simpan ke backend (agar karyawan bisa akses)
        saveClosingConfig(cfg).catch(err => console.error('Gagal simpan ke backend:', err));
        // Juga ke localStorage sebagai cache
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
        setSaved(true);
        fetchSchedules();
    };

    // Today's assignments with off-day awareness
    const todayAssignments = useMemo(() => {
        if (!saved || workers.length < mode) return null;
        if (todayStr < startDate || todayStr > endDate) return null;
        const days = getDaysInRange(startDate, endDate);
        const dayIdx = days.findIndex(d => toLocalDateStr(d) === todayStr);
        if (dayIdx === -1) return null;
        const offToday = scheduleMap[todayStr] || new Set();
        return computeDayAssignments(workers, jobs, dayIdx, offToday);
    }, [saved, workers, jobs, todayStr, startDate, endDate, scheduleMap]);

    // Full rotation
    const allDays = useMemo(() => {
        if (!saved || workers.length < mode || !startDate || !endDate) return [];
        return getDaysInRange(startDate, endDate).map((date, dayIdx) => {
            const dateStr = toLocalDateStr(date);
            const offSet = scheduleMap[dateStr] || new Set();
            return { date, dateStr, assignments: computeDayAssignments(workers, jobs, dayIdx, offSet) };
        });
    }, [saved, workers, jobs, startDate, endDate, scheduleMap]);

    const selectUser = (slotIdx, userId) => {
        const emp = allEmployees.find(e => e.id === parseInt(userId));
        const next = [...selectedUsers];
        next[slotIdx] = emp ? { userId: emp.id, name: emp.fullName } : null;
        setSelectedUsers(next);
        setSaved(false);
    };

    if (!isOpen) {
        return (
            <div className="mb-4">
                <button
                    onClick={() => setIsOpen(true)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-gradient-to-r from-slate-700 to-gray-700 hover:from-slate-800 hover:to-gray-800 text-white rounded-lg shadow transition-all"
                >
                    <div className="flex items-center gap-2">
                        <span>🧹</span>
                        <span className="font-semibold text-sm">Jobdesk Closing Ramadhan</span>
                        {saved && todayAssignments && (
                            <span className="text-xs bg-green-500 px-2 py-0.5 rounded-full">Aktif Hari Ini</span>
                        )}
                    </div>
                    <span className="text-xs opacity-70">Klik untuk buka →</span>
                </button>
            </div>
        );
    }

    return (
        <div className="mb-4 bg-white dark:bg-gray-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
            {/* Header */}
            <div className="px-4 py-3 bg-gradient-to-r from-slate-700 to-gray-700 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span>🧹</span>
                    <div>
                        <p className="font-semibold text-sm">Jobdesk Closing Ramadhan</p>
                        <p className="text-xs text-white/60">Otomatis menyesuaikan dengan jadwal libur</p>
                    </div>
                </div>
                <button onClick={() => setIsOpen(false)} className="text-white/70 hover:text-white text-lg">✕</button>
            </div>

            <div className="p-4 space-y-4">
                {/* Mode */}
                <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Jumlah Karyawan:</span>
                    {[4, 5].map(m => (
                        <button key={m} onClick={() => { setMode(m); setSaved(false); }}
                            className={`px-4 py-1.5 rounded-lg text-sm font-semibold border-2 transition-all ${mode === m ? 'bg-slate-700 text-white border-slate-700' : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-slate-500'}`}
                        >{m} Orang</button>
                    ))}
                </div>

                {/* User Selectors */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Pilih Karyawan Closing Dapur
                    </label>
                    <div className={`grid grid-cols-2 md:grid-cols-${mode} gap-2`}>
                        {Array.from({ length: mode }).map((_, i) => (
                            <div key={i}>
                                <label className="text-xs text-gray-400 mb-1 block">Karyawan {i + 1}</label>
                                <select
                                    value={selectedUsers[i]?.userId || ''}
                                    onChange={e => selectUser(i, e.target.value)}
                                    className="w-full px-2 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white text-sm focus:ring-2 focus:ring-slate-500"
                                >
                                    <option value="">-- Pilih --</option>
                                    {allEmployees.map(e => (
                                        <option key={e.id} value={e.id}>{e.fullName}</option>
                                    ))}
                                </select>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Dates */}
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Tanggal Mulai Ramadhan</label>
                        <input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); setSaved(false); }}
                            className="w-full px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white text-sm" />
                    </div>
                    <div>
                        <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Tanggal Selesai Ramadhan</label>
                        <input type="date" value={endDate} onChange={e => { setEndDate(e.target.value); setSaved(false); }}
                            className="w-full px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white text-sm" />
                    </div>
                </div>

                <button onClick={handleSave}
                    className="w-full py-2 bg-gradient-to-r from-slate-700 to-gray-700 hover:from-slate-800 hover:to-gray-800 text-white font-semibold rounded-lg text-sm transition-all"
                >
                    {scheduleLoading ? '⏳ Memuat jadwal libur...' : '💾 Simpan & Sinkronisasi Jadwal Libur'}
                </button>

                {/* Today's View */}
                {todayAssignments && (
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                                📅 Hari Ini — {fmtDate(today)}
                                {scheduleLoading && <span className="ml-2 text-xs text-gray-400">Memuat...</span>}
                            </p>
                            <button onClick={() => setViewAll(v => !v)}
                                className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline">
                                {viewAll ? 'Sembunyikan' : 'Lihat Semua Hari →'}
                            </button>
                        </div>

                        {/* Check if anyone is off today */}
                        {scheduleMap[todayStr]?.size > 0 && (
                            <div className="text-xs bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 text-orange-700 dark:text-orange-300 rounded-md px-3 py-1.5 mb-2">
                                ⚠️ {scheduleMap[todayStr].size} karyawan libur hari ini — tugas otomatis didistribusi ulang
                            </div>
                        )}

                        <div className={`grid grid-cols-2 md:grid-cols-${jobs.length} gap-2`}>
                            {todayAssignments.map(({ job, person }) => (
                                <div key={job.id} className={`bg-gradient-to-br ${job.color} text-white rounded-lg p-3 shadow`}>
                                    <div className="text-xl mb-1">{job.icon}</div>
                                    <p className="font-bold text-sm">{person}</p>
                                    <p className="text-[10px] opacity-70 mt-0.5">{job.label}</p>
                                    <ul className="mt-1.5 space-y-0.5">
                                        {job.tasks.map((t, i) => <li key={i} className="text-[9px] text-white/85">· {t}</li>)}
                                    </ul>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {saved && !todayAssignments && startDate && endDate && (
                    <p className="text-xs text-center text-gray-400 py-2">Hari ini di luar periode Ramadhan yang diset.</p>
                )}

                {/* Full Rotation Table */}
                {viewAll && allDays.length > 0 && (
                    <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700 max-h-64 overflow-y-auto">
                        <table className="min-w-full text-xs">
                            <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0 z-10">
                                <tr>
                                    <th className="px-3 py-2 text-left text-gray-500 dark:text-gray-400 font-semibold whitespace-nowrap">Tanggal</th>
                                    {jobs.map(j => (
                                        <th key={j.id} className="px-3 py-2 text-left text-gray-500 dark:text-gray-400 font-semibold whitespace-nowrap">
                                            {j.icon} {j.id}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-700 bg-white dark:bg-gray-900">
                                {allDays.map(({ date, dateStr, assignments }) => {
                                    const isToday = dateStr === todayStr;
                                    const hasOff = (scheduleMap[dateStr]?.size || 0) > 0;
                                    return (
                                        <tr key={dateStr}
                                            className={isToday ? 'bg-indigo-50 dark:bg-indigo-900/30 font-semibold' : hasOff ? 'bg-orange-50/50 dark:bg-orange-900/10' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'}
                                        >
                                            <td className="px-3 py-1.5 whitespace-nowrap text-gray-700 dark:text-gray-300">
                                                {isToday && <span className="text-indigo-500 mr-1">▶</span>}
                                                {fmtDate(date)}
                                                {hasOff && <span className="ml-1 text-[9px] text-orange-500">LIBUR</span>}
                                            </td>
                                            {assignments.map(({ job, person }) => (
                                                <td key={job.id} className="px-3 py-1.5 whitespace-nowrap text-gray-800 dark:text-gray-200">
                                                    {person}
                                                </td>
                                            ))}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ClosingSetupPanel;
