import { useCallback, useEffect, useState } from 'react';
import { BarChart2, ChevronDown, RefreshCw, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { getJobdeskFairness } from '../../services/scheduleService';

/**
 * Rekap Keadilan Jobdesk — "staff A sudah berapa kali dapat jobdesk A/B/C/D/E".
 *
 * Satu-satunya tempat rekap jobdesk dapur (sebelumnya ada di Manajemen Jadwal,
 * dipindah ke sini agar tidak ada dua tampilan yang bisa berbeda).
 *
 * Sumber data: `user_schedules.kitchen_station` bulan terpilih — sumber yang
 * SAMA dengan tabel jadwal di halaman ini, jadi rekap pasti cocok dengan yang
 * terlihat di kalender. Setiap nilai rangkap dihitung per jobdesk
 * ('Checker / Stock + Plating' = 1x Checker DAN 1x Plating).
 *
 * `Beban/hari` = rata-rata bobot beban jobdesk per hari kerja (A=5 … E=1).
 * Inilah angka pembanding keadilan yang sebenarnya, karena jumlah hari kerja
 * tiap staff tidak sama.
 */
/**
 * Isi rekap: sorotan, tabel staff × jobdesk, dan baris ringkasan per jobdesk.
 * Dipisah dari panel agar bagian fetch dan bagian tampilan tidak menumpuk.
 */
const JobdeskFairnessBody = ({ report, roles, staff, summary, maxByRole, maxLoad, highlightStyle, highlightIcon }) => {
    const byJobdesk = report.byJobdesk || [];

    // Warna kolom mengikuti tingkat beban: A merah (terberat) → E ungu.
    const roleHeaderCls = (key) => {
        if (key === 'MAIN') return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300';
        if (key === 'SUPPORT') return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300';
        if (key === 'CHECKER') return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
        if (key === 'PLATING') return 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300';
        if (key === 'RUNNER') return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300';
        return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300';
    };

    return (
        <>
            <div className="space-y-2">
                {(report.highlights || []).map((h, i) => (
                    <div key={i} className={`flex items-start gap-2 text-sm border rounded-lg px-3 py-2 ${highlightStyle(h.type)}`}>
                        {highlightIcon(h.type)}
                        <span>{h.message}</span>
                    </div>
                ))}
            </div>
            <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="bg-gray-50 dark:bg-gray-800">
                            <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">Nama</th>
                            {roles.map(r => (
                                <th
                                    key={r.key}
                                    title={`${r.label} (beban ${r.weight})`}
                                    className={`px-3 py-3 text-center font-semibold border-b border-gray-200 dark:border-gray-700 ${roleHeaderCls(r.key)}`}
                                >
                                    {r.short}
                                </th>
                            ))}
                            <th className="px-3 py-3 text-center font-semibold text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700" title="Hari kerja dengan lebih dari satu jobdesk">Rangkap</th>
                            <th className="px-3 py-3 text-center font-semibold text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">Hari Kerja</th>
                            <th className="px-3 py-3 text-center font-semibold text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700" title="Rata-rata bobot beban jobdesk per hari kerja (A=5 ... E=1)">Beban/hari</th>
                        </tr>
                    </thead>
                    <tbody>
                        {staff.map((emp, idx) => (
                            <tr
                                key={emp.userId}
                                className={`
                                    border-b border-gray-100 dark:border-gray-700 last:border-0
                                    ${idx % 2 === 0 ? 'bg-white dark:bg-gray-900' : 'bg-gray-50/50 dark:bg-gray-800/30'}
                                    hover:bg-primary-50/40 dark:hover:bg-primary-900/10 transition-colors
                                `}
                            >
                                <td className="px-4 py-3 font-medium text-gray-900 dark:text-white whitespace-nowrap">{emp.fullName}</td>
                                {roles.map(r => {
                                    const count = emp.counts?.[r.key] || 0;
                                    const isMax = count > 0 && count === maxByRole[r.key];
                                    return (
                                        <td key={r.key} className="px-3 py-3 text-center">
                                            {count > 0 ? (
                                                <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm ${roleHeaderCls(r.key)} ${isMax ? 'font-bold ring-2 ring-red-400 dark:ring-red-500' : ''}`}>
                                                    {count}x
                                                </span>
                                            ) : (
                                                <span className="text-gray-300 dark:text-gray-600">&ndash;</span>
                                            )}
                                        </td>
                                    );
                                })}
                                <td className="px-3 py-3 text-center text-gray-500 dark:text-gray-400 text-xs">
                                    {emp.multiJobdeskDays > 0 ? emp.multiJobdeskDays : <span className="text-gray-300 dark:text-gray-600">&ndash;</span>}
                                </td>
                                <td className="px-3 py-3 text-center text-gray-600 dark:text-gray-300 font-semibold">{emp.daysWorked}</td>
                                <td className={`px-3 py-3 text-center font-semibold ${emp.loadPerDay === maxLoad ? 'text-red-600 dark:text-red-400' : 'text-gray-700 dark:text-gray-300'}`}>
                                    {emp.loadPerDay}
                                    {emp.daysWithoutJobdesk > 0 && (
                                        <span className="block text-[10px] font-normal text-amber-600 dark:text-amber-400" title="Hari kerja tanpa jobdesk">
                                            {emp.daysWithoutJobdesk} hari kosong
                                        </span>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="bg-gray-50 dark:bg-gray-800">
                            <th className="px-4 py-2 text-left font-semibold text-gray-700 dark:text-gray-300">Sebaran per jobdesk</th>
                            {byJobdesk.map(j => (
                                <th key={j.key} className={`px-3 py-2 text-center font-semibold ${roleHeaderCls(j.key)}`} title={j.label}>{j.short}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        <tr className="border-b border-gray-100 dark:border-gray-700">
                            <td className="px-4 py-2 text-gray-600 dark:text-gray-300">Total hari</td>
                            {byJobdesk.map(j => (
                                <td key={j.key} className="px-3 py-2 text-center text-gray-700 dark:text-gray-300">{j.total}</td>
                            ))}
                        </tr>
                        <tr className="border-b border-gray-100 dark:border-gray-700">
                            <td className="px-4 py-2 text-gray-600 dark:text-gray-300">Paling banyak &ndash; paling sedikit</td>
                            {byJobdesk.map(j => (
                                <td key={j.key} className={`px-3 py-2 text-center ${j.isUneven ? 'text-amber-700 dark:text-amber-400 font-semibold' : 'text-gray-700 dark:text-gray-300'}`}>
                                    {j.max}x &ndash; {j.min}x
                                    {j.isUneven && <span className="block text-[10px]">selisih {j.spread}</span>}
                                </td>
                            ))}
                        </tr>
                    </tbody>
                </table>
            </div>

            {summary && (
                <div className="text-xs text-gray-500 dark:text-gray-400 flex flex-wrap gap-x-4 gap-y-1">
                    <span>Rata-rata beban/hari dapur: <b>{summary.loadAvg}</b></span>
                    <span>Terberat: <b>{summary.loadMax}</b></span>
                    <span>Terringan: <b>{summary.loadMin}</b></span>
                    <span>Selisih: <b>{summary.loadSpread}</b></span>
                    <span>Total hari kerja: <b>{summary.totalWorkDays}</b></span>
                </div>
            )}

            <p className="text-xs text-gray-400 dark:text-gray-500">
                &#128161; <b>Beban/hari</b> = rata-rata bobot jobdesk per hari kerja (A Main Cook = 5 paling berat, E Helper = 1 paling ringan).
                Angka inilah pembanding keadilan yang sah &mdash; <b>bukan</b> jumlah hari, karena tiap staff jumlah hari kerjanya berbeda.
                Lingkaran bergaris merah = paling sering mendapat jobdesk tersebut. Sebuah jobdesk ditandai <b>timpang</b> bila selisih
                antar staff lebih dari {summary?.gapThreshold ?? 3} hari (JOB_DESK_KITCHEN.md &sect;4.4).
            </p>

        </>
    );
};

const JobdeskFairnessPanel = ({ month, onMonthChange }) => {
    const [report, setReport] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [expanded, setExpanded] = useState(true);

    const fetchReport = useCallback(async () => {
        if (!month) return;
        setLoading(true);
        setError(null);
        try {
            const res = await getJobdeskFairness(month);
            setReport(res?.data || null);
        } catch (err) {
            setError(
                err?.response?.data?.error?.message
                || err?.response?.data?.message
                || 'Gagal memuat rekap jobdesk'
            );
            setReport(null);
        } finally {
            setLoading(false);
        }
    }, [month]);

    useEffect(() => { fetchReport(); }, [fetchReport]);

    const roles = report?.roles || [];
    const staff = report?.staff || [];
    const summary = report?.summary;

    // Nilai tertinggi tiap kolom jobdesk → ditandai merah (paling sering dapat).
    const maxByRole = {};
    for (const r of roles) {
        maxByRole[r.key] = staff.length ? Math.max(...staff.map(s => s.counts?.[r.key] || 0)) : 0;
    }
    // Beban harian tertinggi → ditandai agar yang paling berat langsung terlihat.
    const maxLoad = staff.length ? Math.max(...staff.map(s => s.loadPerDay || 0)) : 0;

    const highlightStyle = (type) => {
        if (type === 'success') return 'bg-green-50 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800';
        if (type === 'info') return 'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800';
        return 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800';
    };

    const highlightIcon = (type) => {
        if (type === 'success') return <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />;
        if (type === 'info') return <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />;
        return <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />;
    };

    const verdict = !summary
        ? null
        : (summary.isLoadUneven || summary.unevenJobdeskCount > 0 || summary.daysWithoutJobdesk > 0)
            ? { label: 'Belum merata', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' }
            : { label: 'Sudah merata', cls: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' };

    return (
        <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
            <button
                type="button"
                className="w-full flex items-center justify-between px-5 py-4 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
                onClick={() => setExpanded(v => !v)}
            >
                <div className="flex items-center gap-2 flex-wrap">
                    <BarChart2 className="w-5 h-5 text-primary-500" />
                    <span className="font-semibold text-gray-900 dark:text-white">Rekap Keadilan Jobdesk</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                        {month} · {staff.length} staff Dapur
                    </span>
                    {verdict && (
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${verdict.cls}`}>
                            {verdict.label}
                        </span>
                    )}
                </div>
                <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${expanded ? 'rotate-180' : ''}`} />
            </button>

            {expanded && (
                <div className="p-4 space-y-4">
                    <div className="flex items-center gap-3 flex-wrap">
                        <div className="flex items-center gap-2">
                            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Bulan:</label>
                            <input
                                type="month"
                                className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-1.5 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                value={month || ''}
                                onChange={e => (onMonthChange ? onMonthChange(e.target.value) : null)}
                                disabled={!onMonthChange}
                            />
                        </div>
                        <button
                            type="button"
                            onClick={fetchReport}
                            disabled={loading}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm bg-primary-50 hover:bg-primary-100 dark:bg-primary-900/20 dark:hover:bg-primary-900/40 text-primary-700 dark:text-primary-300 border border-primary-200 dark:border-primary-800 transition-colors disabled:opacity-50"
                        >
                            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                            Refresh
                        </button>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                            Jobdesk diambil dari jadwal bulan ini — sama dengan tabel jadwal di bawah.
                        </span>
                    </div>

                    {error && (
                        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-300 rounded-lg p-3 text-sm">
                            {error}
                        </div>
                    )}

                    {loading ? (
                        <div className="flex items-center justify-center py-10 text-gray-400">
                            <RefreshCw className="w-5 h-5 animate-spin mr-2" />
                            Memuat rekap...
                        </div>
                    ) : !report ? null : staff.length === 0 ? (
                        <div className="text-center py-8 text-gray-400 dark:text-gray-500 text-sm">
                            Belum ada hari kerja Dapur pada bulan ini.
                        </div>
                    ) : (
                        <JobdeskFairnessBody
                            report={report}
                            roles={roles}
                            staff={staff}
                            summary={summary}
                            maxByRole={maxByRole}
                            maxLoad={maxLoad}
                            highlightStyle={highlightStyle}
                            highlightIcon={highlightIcon}
                        />
                    )}
                </div>
            )}
        </div>
    );
};

export default JobdeskFairnessPanel;
