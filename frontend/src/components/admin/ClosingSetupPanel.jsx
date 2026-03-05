import { useState, useEffect, useMemo } from 'react';

// ─── JOB DEFINITIONS ────────────────────────────────────────────────────────
const JOBS_4 = [
    { id: 'A', label: 'Pos A — Dapur Dalam', icon: '🧹', tasks: ['Lap-lap meja', 'Cuci lap'], color: 'from-blue-600 to-blue-700' },
    { id: 'B', label: 'Pos B — Dapur Dalam', icon: '🫧', tasks: ['Sapu lantai dapur', 'Pel lantai dapur'], color: 'from-emerald-600 to-emerald-700' },
    { id: 'C', label: 'Pos C — Dapur Dalam', icon: '🚿', tasks: ['Cuci piring', 'Bersihkan WC'], color: 'from-amber-600 to-amber-700' },
    { id: 'D', label: 'Pos D — Dapur Luar', icon: '🪑', tasks: ['Angkat bangku', 'Sapu luar', 'Pel luar'], color: 'from-purple-600 to-purple-700' },
];
const JOBS_5 = [
    { id: 'A', label: 'Pos A — Dapur Dalam', icon: '🧹', tasks: ['Lap-lap meja', 'Cuci lap'], color: 'from-blue-600 to-blue-700' },
    { id: 'B', label: 'Pos B — Dapur Dalam', icon: '🫧', tasks: ['Sapu lantai dapur', 'Pel lantai dapur'], color: 'from-emerald-600 to-emerald-700' },
    { id: 'C', label: 'Pos C — Dapur Dalam', icon: '🍽️', tasks: ['Cuci piring'], color: 'from-amber-600 to-amber-700' },
    { id: 'D', label: 'Pos D — Dalam + Luar', icon: '🚿', tasks: ['Bersihkan WC', 'Angkat bangku'], color: 'from-rose-600 to-rose-700' },
    { id: 'E', label: 'Pos E — Dapur Luar', icon: '🪑', tasks: ['Sapu luar', 'Pel luar'], color: 'from-purple-600 to-purple-700' },
];

const getDayOffset = (startDateStr, targetDate) => {
    const start = new Date(startDateStr);
    start.setHours(0, 0, 0, 0);
    const t = new Date(targetDate);
    t.setHours(0, 0, 0, 0);
    return Math.floor((t - start) / (1000 * 60 * 60 * 24));
};

const getDaysInRange = (start, end) => {
    const days = [];
    let cur = new Date(start);
    const last = new Date(end);
    while (cur <= last) { days.push(new Date(cur)); cur.setDate(cur.getDate() + 1); }
    return days;
};

const DAY_ID = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const MONTH_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const fmtDate = (d) => `${DAY_ID[d.getDay()]}, ${d.getDate()} ${MONTH_ID[d.getMonth()]}`;

const STORAGE_KEY = 'jobdesk_closing_config';

const ClosingSetupPanel = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [mode, setMode] = useState(4);
    const [nameInputs, setNameInputs] = useState(['', '', '', '', '']);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [saved, setSaved] = useState(false);
    const [viewAll, setViewAll] = useState(false);

    const today = new Date();
    const todayStr = today.toLocaleDateString('en-CA');

    // Load from localStorage on mount
    useEffect(() => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const cfg = JSON.parse(raw);
                setMode(cfg.mode || 4);
                const names = Array(5).fill('');
                cfg.names?.forEach((n, i) => { names[i] = n; });
                setNameInputs(names);
                setStartDate(cfg.startDate || '');
                setEndDate(cfg.endDate || '');
                setSaved(true);
            }
        } catch { }
    }, []);

    const jobs = mode === 5 ? JOBS_5 : JOBS_4;
    const names = nameInputs.slice(0, mode).map(n => n.trim());

    const handleSave = () => {
        if (names.some(n => !n)) { alert(`Masukkan ${mode} nama karyawan.`); return; }
        if (!startDate || !endDate) { alert('Masukkan tanggal Ramadhan.'); return; }
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode, names, startDate, endDate }));
        setSaved(true);
    };

    // Today's assignments
    const todayAssignments = useMemo(() => {
        if (!saved || !startDate || !endDate) return null;
        if (todayStr < startDate || todayStr > endDate) return null;
        if (names.some(n => !n)) return null;
        const offset = getDayOffset(startDate, todayStr);
        return jobs.map((job, i) => ({ job, person: names[(i + offset) % names.length] }));
    }, [saved, startDate, endDate, todayStr, JSON.stringify(names), mode]);

    // Full rotation
    const allDays = useMemo(() => {
        if (!saved || !startDate || !endDate || names.some(n => !n)) return [];
        return getDaysInRange(startDate, endDate).map((date, dayIdx) => ({
            date,
            assignments: jobs.map((job, i) => ({ job, person: names[(i + dayIdx) % names.length] })),
        }));
    }, [saved, startDate, endDate, JSON.stringify(names), mode]);

    if (!isOpen) {
        return (
            <div className="mb-4">
                <button
                    onClick={() => setIsOpen(true)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-gradient-to-r from-slate-700 to-gray-700 hover:from-slate-800 hover:to-gray-800 text-white rounded-lg shadow transition-all"
                >
                    <div className="flex items-center gap-2">
                        <span className="text-base">🧹</span>
                        <span className="font-semibold text-sm">Jobdesk Closing Ramadhan</span>
                        {saved && todayAssignments && (
                            <span className="text-xs bg-green-500 text-white px-2 py-0.5 rounded-full ml-1">Aktif Hari Ini</span>
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
                    <p className="font-semibold text-sm">Jobdesk Closing Ramadhan</p>
                </div>
                <button onClick={() => setIsOpen(false)} className="text-white/70 hover:text-white text-lg">✕</button>
            </div>

            <div className="p-4 space-y-4">
                {/* Mode */}
                <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Jumlah Karyawan:</span>
                    {[4, 5].map(m => (
                        <button key={m}
                            onClick={() => { setMode(m); setSaved(false); }}
                            className={`px-4 py-1.5 rounded-lg text-sm font-semibold border-2 transition-all ${mode === m ? 'bg-slate-700 text-white border-slate-700' : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-slate-500'}`}
                        >{m} Orang</button>
                    ))}
                </div>

                {/* Names */}
                <div className={`grid grid-cols-2 md:grid-cols-${mode} gap-2`}>
                    {Array.from({ length: mode }).map((_, i) => (
                        <input key={i} type="text" placeholder={`Nama ${i + 1}`}
                            value={nameInputs[i]}
                            onChange={e => { const n = [...nameInputs]; n[i] = e.target.value; setNameInputs(n); setSaved(false); }}
                            className="px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white text-sm focus:ring-2 focus:ring-slate-500"
                        />
                    ))}
                </div>

                {/* Dates */}
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Tanggal Mulai</label>
                        <input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); setSaved(false); }}
                            className="w-full px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white text-sm" />
                    </div>
                    <div>
                        <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Tanggal Selesai</label>
                        <input type="date" value={endDate} onChange={e => { setEndDate(e.target.value); setSaved(false); }}
                            className="w-full px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white text-sm" />
                    </div>
                </div>

                <button onClick={handleSave}
                    className="w-full py-2 bg-gradient-to-r from-slate-700 to-gray-700 hover:from-slate-800 hover:to-gray-800 text-white font-semibold rounded-lg text-sm transition-all"
                >💾 Simpan Konfigurasi</button>

                {/* Today's View */}
                {todayAssignments ? (
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                                📅 Hari Ini — {fmtDate(today)}
                            </p>
                            <button onClick={() => setViewAll(v => !v)}
                                className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline">
                                {viewAll ? 'Sembunyikan Rotasi' : 'Lihat Semua Hari →'}
                            </button>
                        </div>
                        <div className={`grid grid-cols-2 md:grid-cols-${mode === 4 ? '4' : '5'} gap-2`}>
                            {todayAssignments.map(({ job, person }) => (
                                <div key={job.id} className={`bg-gradient-to-br ${job.color} text-white rounded-lg p-3 shadow`}>
                                    <div className="text-xl mb-1">{job.icon}</div>
                                    <p className="font-bold text-sm">{person}</p>
                                    <p className="text-[10px] opacity-75 mt-0.5">{job.label}</p>
                                    <ul className="mt-1.5 space-y-0.5">
                                        {job.tasks.map((t, i) => (
                                            <li key={i} className="text-[9px] text-white/85">· {t}</li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : saved ? (
                    <p className="text-xs text-center text-gray-400 py-2">Hari ini di luar periode Ramadhan yang diset.</p>
                ) : null}

                {/* Full Rotation Table */}
                {viewAll && allDays.length > 0 && (
                    <div className="overflow-x-auto mt-2 rounded-lg border border-gray-200 dark:border-gray-700 max-h-60 overflow-y-auto">
                        <table className="min-w-full text-xs">
                            <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
                                <tr>
                                    <th className="px-3 py-2 text-left text-gray-500 dark:text-gray-400 font-semibold">Tanggal</th>
                                    {jobs.map(j => (
                                        <th key={j.id} className="px-3 py-2 text-left text-gray-500 dark:text-gray-400 font-semibold">
                                            {j.icon} Pos {j.id}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-700 bg-white dark:bg-gray-900">
                                {allDays.map(({ date, assignments }, idx) => {
                                    const isToday = date.toLocaleDateString('en-CA') === todayStr;
                                    return (
                                        <tr key={idx} className={isToday ? 'bg-indigo-50 dark:bg-indigo-900/30 font-semibold' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'}>
                                            <td className="px-3 py-1.5 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                                                {isToday && <span className="text-indigo-500 mr-1">▶</span>}{fmtDate(date)}
                                            </td>
                                            {assignments.map(({ job, person }) => (
                                                <td key={job.id} className="px-3 py-1.5 text-gray-800 dark:text-gray-200 whitespace-nowrap">{person}</td>
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
