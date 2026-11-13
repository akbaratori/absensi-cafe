import { useEffect, useMemo, useState } from 'react';
import { getClosingConfig } from '../../services/scheduleService';
import { useAuth } from '../../contexts/AuthContext';
import { generateOpeningClosingRoster, validateFourStaff, mondayOf, toDateKey, OPENING_CLOSING_CONFIG_KEY } from '../../utils/openingClosing';

const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

/**
 * Widget karyawan: tampilkan tugas opening/closing HARI INI untuk yang login.
 * Membaca config yang disimpan admin (getClosingConfig). Kalau user tidak termasuk
 * 4 staf dapur terpilih, atau hari ini libur, tampilkan info yang sesuai.
 */
const MyClosingJobdeskWidget = () => {
    const { user } = useAuth();
    const [config, setConfig] = useState(null);

    useEffect(() => {
        const apply = (cfg) => { if (Array.isArray(cfg?.staff)) setConfig(cfg); };
        getClosingConfig()
            .then((res) => apply(res?.data?.config))
            .catch(() => { try { apply(JSON.parse(localStorage.getItem(OPENING_CLOSING_CONFIG_KEY))); } catch { /* none */ } });
    }, []);

    const today = useMemo(() => new Date(), []);
    const todayStr = toDateKey(today);

    const assignment = useMemo(() => {
        if (!config || !user || !validateFourStaff(config.staff)) return null;
        try {
            const rows = generateOpeningClosingRoster({ staff: config.staff, startDate: mondayOf(config.startDate) });
            const row = rows.find((r) => r.dateKey === todayStr);
            if (!row) return null;

            if (row.off && String(row.off.id) === String(user.id)) return { kind: 'off' };

            const isStock = Boolean(row.stockChecker && String(row.stockChecker.id) === String(user.id));

            const open = row.opening.find(({ person }) => String(person.id) === String(user.id));
            if (open) return { kind: 'task', shift: 'Opening', job: open.job, stock: isStock };

            const close = row.closing.find(({ person }) => String(person.id) === String(user.id));
            if (close) return { kind: 'task', shift: 'Closing', job: close.job, stock: isStock };

            if (isStock) return { kind: 'stock' };

            return null; // bukan bagian dari 4 staf terpilih
        } catch {
            return null;
        }
    }, [config, user, todayStr]);

    if (!assignment) return null;
    const fmtToday = `${DAY_NAMES[today.getDay()]}, ${today.getDate()} ${MONTH_SHORT[today.getMonth()]}`;

    if (assignment.kind === 'off') {
        return (
            <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 mb-4">
                <div className="flex items-center gap-2">
                    <span>🏖️</span>
                    <div>
                        <p className="font-semibold text-sm text-gray-800 dark:text-gray-200">Jobdesk Dapur — {fmtToday}</p>
                        <p className="text-xs text-gray-500">Kamu libur hari ini — tidak ada tugas opening/closing 🎉</p>
                    </div>
                </div>
            </div>
        );
    }

    if (assignment.kind === 'stock') {
        return (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-xl p-4 mb-4">
                <div className="flex items-center gap-2">
                    <span>📋</span>
                    <div>
                        <p className="font-semibold text-sm text-gray-800 dark:text-gray-200">Jobdesk Dapur — {fmtToday}</p>
                        <p className="text-xs text-gray-500">Kamu <b>pengecek laporan stok DD9</b> hari ini (kerjakan di jam sepi sebelum closing).</p>
                    </div>
                </div>
            </div>
        );
    }

    const { shift, job, stock } = assignment;
    const color = shift === 'Opening' ? 'from-orange-600 to-red-600' : 'from-slate-700 to-gray-800';

    return (
        <div className={`bg-gradient-to-br ${color} text-white rounded-xl p-4 mb-4 shadow-lg`}>
            <div className="flex items-start justify-between">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg">{job.icon || '🍳'}</span>
                        <p className="font-bold text-sm">Jobdesk {shift} Hari Ini</p>
                    </div>
                    <p className="text-white/70 text-xs mb-2">{fmtToday}</p>
                    <p className="font-bold text-lg">{job.label}</p>
                    <ul className="mt-2 space-y-1">
                        {job.tasks.map((t, i) => (
                            <li key={i} className="text-sm text-white/90 flex items-center gap-1.5">
                                <span className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center text-xs">✓</span>{t}
                            </li>
                        ))}
                    </ul>
                    {stock && (
                        <p className="mt-3 text-xs bg-amber-400/20 border border-amber-300/40 rounded px-2 py-1">📋 Bonus: kamu juga pengecek laporan stok DD9 hari ini.</p>
                    )}
                </div>
            </div>
        </div>
    );
};

export default MyClosingJobdeskWidget;