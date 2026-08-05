import { useState } from 'react';
import Card from '../../components/shared/Card';

// ─── DATA DEFINISI (3 Pos, berlaku untuk 4 maupun 5 orang) ──────────────────
const JOBS = [
    {
        id: 'A',
        label: 'Pos A — Dapur Dalam',
        tasks: ['Lap-lap meja', 'Cuci lap'],
        icon: '🧹',
        color: 'from-blue-600 to-blue-700',
        border: 'border-blue-500',
    },
    {
        id: 'B',
        label: 'Pos B — Dapur Dalam',
        tasks: ['Sapu lantai dapur', 'Pel lantai dapur', 'Cuci piring'],
        icon: '🫧',
        color: 'from-emerald-600 to-emerald-700',
        border: 'border-emerald-500',
    },
    {
        id: 'C',
        label: 'Pos C — Dapur Luar',
        tasks: ['Angkat & rapikan bangku', 'Sapu area luar', 'Pel area luar', 'Bersihkan WC'],
        icon: '🪑',
        color: 'from-purple-600 to-purple-700',
        border: 'border-purple-500',
    },
];

// ─── RAMADAN 2026 (default) ───────────────────────────────────────────────────
const DEFAULT_START = '2026-03-01';
const DEFAULT_END = '2026-03-30';

// ─── UTIL ─────────────────────────────────────────────────────────────────────
const getDaysInRange = (start, end) => {
    const days = [];
    let cur = new Date(start);
    const last = new Date(end);
    while (cur <= last) {
        days.push(new Date(cur));
        cur.setDate(cur.getDate() + 1);
    }
    return days;
};

const DAY_ID = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const MONTH_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

const fmtDate = (d) =>
    `${DAY_ID[d.getDay()]}, ${d.getDate()} ${MONTH_ID[d.getMonth()]}`;

/**
 * Build rotation: 3 job positions, N workers.
 * Each day, rotate who holds each position.
 * Workers with index >= JOBS.length get "Bebas" (free/helper) that day.
 */
const buildRotation = (names, days) => {
    const n = names.length;
    return days.map((date, dayIdx) => {
        // Rotate the worker order for this day
        const rotated = Array.from({ length: n }, (_, i) => names[(i + dayIdx) % n]);
        return {
            date,
            assignments: JOBS.map((job, jobIdx) => ({
                job,
                person: rotated[jobIdx] ?? '—',
            })),
            freeWorkers: rotated.slice(JOBS.length), // workers with no task
        };
    });
};

// ─── COMPONENT ────────────────────────────────────────────────────────────────
const JobdeskClosingPage = () => {
    const [mode, setMode] = useState(4); // 4 or 5
    const [startDate, setStartDate] = useState(DEFAULT_START);
    const [endDate, setEndDate] = useState(DEFAULT_END);
    const [nameInputs, setNameInputs] = useState(
        Array(5).fill('').map((_, i) => ['', '', '', '', ''][i])
    );
    const [generated, setGenerated] = useState(null);
    const [viewMode, setViewMode] = useState('today'); // 'today' | 'all'

    const filledNames = nameInputs.slice(0, mode).filter((n) => n.trim());

    const handleGenerate = () => {
        const names = nameInputs.slice(0, mode).map((n) => n.trim());
        if (names.some((n) => !n)) {
            alert(`Masukkan ${mode} nama karyawan terlebih dahulu.`);
            return;
        }
        if (!startDate || !endDate) {
            alert('Pilih tanggal mulai dan selesai.');
            return;
        }
        const days = getDaysInRange(startDate, endDate);
        const rotation = buildRotation(names, days);
        setGenerated(rotation);

        // Simpan ke localStorage
        const config = { mode, names, startDate, endDate };
        localStorage.setItem('jobdesk_closing_config', JSON.stringify(config));
    };

    // Find today's entry
    const todayStr = new Date().toLocaleDateString('en-CA');
    const todayEntry = generated?.find(
        (g) => g.date.toLocaleDateString('en-CA') === todayStr
    );

    // Build per-person summary
    const personSummary = generated
        ? (() => {
            const map = {};
            generated.forEach(({ assignments }) => {
                assignments.forEach(({ job, person }) => {
                    if (!map[person]) map[person] = {};
                    map[person][job.id] = (map[person][job.id] || 0) + 1;
                });
            });
            return map;
        })()
        : null;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    🌙 Jobdesk Closing Ramadhan
                </h1>
                <p className="text-gray-500 dark:text-gray-400 mt-1">
                    Rotasi tugas closing dapur yang adil selama Ramadhan
                </p>
            </div>

            {/* Setup Panel */}
            <Card>
                <div className="p-5 space-y-5">
                    {/* Mode */}
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                            Jumlah Karyawan Closing
                        </label>
                        <div className="flex gap-3">
                            {[4, 5].map((m) => (
                                <button
                                    key={m}
                                    onClick={() => {
                                        setMode(m);
                                        setGenerated(null);
                                    }}
                                    className={`px-5 py-2 rounded-lg font-semibold text-sm border-2 transition-all ${mode === m
                                        ? 'bg-indigo-700 text-white border-indigo-700 shadow'
                                        : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-indigo-400'
                                        }`}
                                >
                                    {m} Orang
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Names */}
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                            Nama Karyawan Closing Dapur
                        </label>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                            {Array.from({ length: mode }).map((_, i) => (
                                <div key={i}>
                                    <label className="text-xs text-gray-400 mb-1 block">
                                        Karyawan {i + 1}
                                    </label>
                                    <input
                                        type="text"
                                        value={nameInputs[i]}
                                        onChange={(e) => {
                                            const next = [...nameInputs];
                                            next[i] = e.target.value;
                                            setNameInputs(next);
                                            setGenerated(null);
                                        }}
                                        placeholder={`Nama ${i + 1}`}
                                        className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                    />
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Date Range */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                                Tanggal Mulai Ramadhan
                            </label>
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => { setStartDate(e.target.value); setGenerated(null); }}
                                className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                                Tanggal Selesai Ramadhan
                            </label>
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => { setEndDate(e.target.value); setGenerated(null); }}
                                className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white text-sm"
                            />
                        </div>
                    </div>

                    <button
                        onClick={handleGenerate}
                        className="w-full py-3 bg-gradient-to-r from-indigo-700 to-slate-700 hover:from-indigo-800 hover:to-slate-800 text-white font-semibold rounded-lg shadow transition-all"
                    >
                        🌙 Generate Rotasi Jobdesk
                    </button>
                </div>
            </Card>

            {/* Job Definitions */}
            <div>
                <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                    3 Pos Closing ({mode} Orang — {mode - JOBS.length} Bebas per hari)
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {JOBS.map((job) => (
                        <div
                            key={job.id}
                            className={`bg-gradient-to-br ${job.color} text-white rounded-xl p-4 shadow`}
                        >
                            <div className="text-2xl mb-1">{job.icon}</div>
                            <p className="font-bold text-sm">{job.label}</p>
                            <ul className="mt-2 space-y-1">
                                {job.tasks.map((t, i) => (
                                    <li key={i} className="text-xs text-white/85 flex items-start gap-1">
                                        <span className="mt-0.5">•</span> {t}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                    {/* Bebas slot */}
                    {Array.from({ length: mode - JOBS.length }).map((_, i) => (
                        <div key={`free-${i}`} className="bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-xl p-4 border-2 border-dashed border-gray-300 dark:border-gray-600">
                            <div className="text-2xl mb-1">🆓</div>
                            <p className="font-bold text-sm">Bebas / Helper</p>
                            <p className="text-xs mt-2 opacity-70">Giliran tidak ada tugas hari ini — bantu posisi lain jika diperlukan</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Results */}
            {generated && (
                <>
                    {/* Today's Assignments */}
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                                📅 Hari Ini — {fmtDate(new Date())}
                            </h2>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setViewMode('today')}
                                    className={`px-3 py-1 rounded text-sm font-medium border transition-all ${viewMode === 'today'
                                        ? 'bg-indigo-700 text-white border-indigo-700'
                                        : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300'
                                        }`}
                                >
                                    Hari Ini
                                </button>
                                <button
                                    onClick={() => setViewMode('all')}
                                    className={`px-3 py-1 rounded text-sm font-medium border transition-all ${viewMode === 'all'
                                        ? 'bg-indigo-700 text-white border-indigo-700'
                                        : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300'
                                        }`}
                                >
                                    Semua Hari
                                </button>
                            </div>
                        </div>

                        {viewMode === 'today' && (
                            <div>
                                {todayEntry ? (
                                    <div>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            {todayEntry.assignments.map(({ job, person }) => (
                                                <div
                                                    key={job.id}
                                                    className={`bg-gradient-to-br ${job.color} text-white rounded-xl p-5 shadow-lg`}
                                                >
                                                    <div className="text-3xl mb-2">{job.icon}</div>
                                                    <p className="font-bold text-lg">{person}</p>
                                                    <p className="text-xs text-white/70 mt-0.5">{job.label}</p>
                                                    <ul className="mt-3 space-y-1">
                                                        {job.tasks.map((t, i) => (
                                                            <li key={i} className="text-xs text-white/90 flex items-start gap-1">
                                                                <span>✓</span> {t}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            ))}
                                        </div>
                                        {todayEntry.freeWorkers?.length > 0 && (
                                            <div className="mt-3 flex items-center gap-2 bg-gray-50 dark:bg-gray-800 rounded-lg px-4 py-2.5 border border-gray-200 dark:border-gray-700">
                                                <span>🆓</span>
                                                <span className="text-sm text-gray-600 dark:text-gray-300">
                                                    <strong>Bebas hari ini:</strong> {todayEntry.freeWorkers.join(', ')}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-8 text-center text-gray-400">
                                        Hari ini bukan termasuk periode Ramadhan yang diset.
                                    </div>
                                )}
                            </div>
                        )}

                        {viewMode === 'all' && (
                            <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
                                <table className="min-w-full text-sm">
                                    <thead className="bg-gray-50 dark:bg-gray-800">
                                        <tr>
                                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Tanggal</th>
                                            {JOBS.map((j) => (
                                                <th key={j.id} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
                                                    {j.icon} Pos {j.id}
                                                </th>
                                            ))}
                                            {mode > JOBS.length && <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">🆓 Bebas</th>}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-900">
                                        {generated.map(({ date, assignments, freeWorkers }, idx) => {
                                            const isToday = date.toLocaleDateString('en-CA') === todayStr;
                                            return (
                                                <tr key={idx} className={isToday ? 'bg-indigo-50 dark:bg-indigo-900/30 font-semibold' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'}>
                                                    <td className="px-4 py-2 whitespace-nowrap text-gray-700 dark:text-gray-300">
                                                        {isToday && <span className="mr-1 text-indigo-600">▶</span>}
                                                        {fmtDate(date)}
                                                    </td>
                                                    {assignments.map(({ job, person }) => (
                                                        <td key={job.id} className="px-4 py-2 whitespace-nowrap text-gray-800 dark:text-gray-200">{person}</td>
                                                    ))}
                                                    {mode > JOBS.length && <td className="px-4 py-2 whitespace-nowrap text-gray-500 dark:text-gray-400 italic">{(freeWorkers || []).join(', ')}</td>}
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    {/* Fairness Summary */}
                    {personSummary && (
                        <Card>
                            <div className="p-5">
                                <h3 className="font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                                    ⚖️ Ringkasan Keadilan Rotasi
                                    <span className="text-xs font-normal text-gray-400">(jumlah hari per pos)</span>
                                </h3>
                                <div className="overflow-x-auto">
                                    <table className="min-w-full text-sm">
                                        <thead>
                                            <tr className="text-left text-xs text-gray-500 dark:text-gray-400 uppercase">
                                                <th className="pb-2 pr-4">Nama</th>
                                                {JOBS.map((j) => (
                                                    <th key={j.id} className="pb-2 px-3">
                                                        {j.icon} Pos {j.id}
                                                    </th>
                                                ))}
                                                <th className="pb-2 px-3">🆓 Bebas</th>
                                                <th className="pb-2 pl-3">Total Hari</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                            {Object.entries(personSummary).map(([name, counts]) => {
                                                const total = Object.values(counts).reduce((a, b) => a + b, 0);
                                                return (
                                                    <tr key={name}>
                                                        <td className="py-2 pr-4 font-medium text-gray-800 dark:text-gray-200 whitespace-nowrap">
                                                            {name}
                                                        </td>
                                                        {jobs.map((j) => (
                                                            <td key={j.id} className="py-2 px-3 text-center">
                                                                <span className="inline-block min-w-[2rem] py-0.5 rounded bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-semibold text-xs">
                                                                    {counts[j.id] || 0}
                                                                </span>
                                                            </td>
                                                        ))}
                                                        <td className="py-2 pl-3 text-center font-bold text-gray-700 dark:text-gray-300">
                                                            {total}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </Card>
                    )}
                </>
            )}
        </div>
    );
};

export default JobdeskClosingPage;
