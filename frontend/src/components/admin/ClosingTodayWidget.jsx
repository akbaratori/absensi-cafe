import { useEffect, useMemo, useState } from 'react';
import { getClosingConfig } from '../../services/scheduleService';
import { generateOpeningClosingRoster, validateFourStaff, mondayOf, toDateKey, OPENING_CLOSING_CONFIG_KEY } from '../../utils/openingClosing';

const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

const ClosingTodayWidget = () => {
    const [config, setConfig] = useState(null);

    // Baca config dari backend, fallback localStorage (dipasang admin di halaman jobdesk).
    useEffect(() => {
        const apply = (cfg) => { if (Array.isArray(cfg?.staff)) setConfig(cfg); };
        getClosingConfig()
            .then((res) => apply(res?.data?.config))
            .catch(() => { try { apply(JSON.parse(localStorage.getItem(OPENING_CLOSING_CONFIG_KEY))); } catch { /* none */ } });
    }, []);

    const today = useMemo(() => new Date(), []);
    const todayStr = toDateKey(today);

    const rows = useMemo(() => {
        if (!config || !validateFourStaff(config.staff)) return null;
        try { return generateOpeningClosingRoster({ staff: config.staff, startDate: mondayOf(config.startDate) }); }
        catch { return null; }
    }, [config]);

    const row = useMemo(() => rows?.find((r) => r.dateKey === todayStr) ?? null, [rows, todayStr]);

    if (!row) return null;
    const fmtToday = `${DAY_NAMES[today.getDay()]}, ${today.getDate()} ${MONTH_SHORT[today.getMonth()]} ${today.getFullYear()}`;

    const card = (job, person, color) => (
        <div key={job.id} className={`${color} text-white rounded-lg p-3 shadow-sm`}>
            <div className="flex items-center gap-1.5 mb-1">
                <span>{job.icon || '🧹'}</span><span className="text-xs font-bold opacity-80">{job.label}</span>
            </div>
            <p className="font-bold text-sm leading-tight">{person.name}</p>
            <ul className="mt-1.5 space-y-0.5">{job.tasks.map((t, i) => <li key={i} className="text-[10px] text-white/85">· {t}</li>)}</ul>
        </div>
    );

    return (
        <div className="mb-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-gradient-to-r from-indigo-700 to-slate-700 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span>🍳</span>
                    <div>
                        <p className="font-semibold text-sm">Jobdesk Opening &amp; Closing Hari Ini</p>
                        <p className="text-xs text-white/70">{fmtToday}</p>
                    </div>
                </div>
                <a href="/admin/jobdesk-closing" className="text-xs text-white/80 hover:text-white underline">Ubah →</a>
            </div>
            <div className="p-3 space-y-3">
                <div>
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">🎬 Opening (Shift 1)</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">{row.opening.map(({ job, person }) => card(job, person, 'bg-orange-600'))}</div>
                </div>
                <div>
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">🌙 Closing (Shift 2)</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">{row.closing.map(({ job, person }) => card(job, person, 'bg-slate-700'))}</div>
                </div>
                {(row.off || row.stockChecker) && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 flex gap-4">
                        {row.off && <span>🏖️ Libur: <b>{row.off.name}</b></span>}
                        {row.stockChecker && <span>📋 Pengecek stok: <b>{row.stockChecker.name}</b></span>}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ClosingTodayWidget;