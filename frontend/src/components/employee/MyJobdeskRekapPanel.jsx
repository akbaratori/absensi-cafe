import { useCallback, useEffect, useState } from 'react';
import {
    BarChart2, ChevronDown, RefreshCw, AlertTriangle, CheckCircle2, Info,
    CalendarDays, Layers, Scale, CalendarX2,
} from 'lucide-react';
import { getMyJobdeskSummary } from '../../services/scheduleService';

/**
 * "Rekap Jobdesk Saya" — jawaban untuk pertanyaan staff:
 * "bulan ini saya kebagian jobdesk apa saja, dan berapa banyak?"
 *
 * Sumber datanya SAMA PERSIS dengan rekap yang dilihat admin
 * (`user_schedules.kitchen_station` bulan terpilih), jadi angka di sini tidak
 * akan pernah beda dengan yang dilihat admin. Setiap nilai rangkap dihitung per
 * jobdesk ('Checker / Stock + Plating' = 1x Checker DAN 1x Plating).
 *
 * Yang sengaja TIDAK ditampilkan: jobdesk rekan kerja. Untuk pembanding hanya
 * dipakai angka agregat tim (rata-rata beban harian), supaya halaman ini tidak
 * berubah jadi ajang saling mengintip jadwal orang lain.
 *
 * Beban/hari = rata-rata bobot jobdesk per hari kerja (A=5 … E=1). Ini
 * pembanding yang adil karena jumlah hari kerja tiap orang tidak sama.
 */

const ROLE_STYLE = {
    MAIN: { chip: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300', bar: 'bg-red-500' },
    SUPPORT: { chip: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300', bar: 'bg-orange-500' },
    CHECKER: { chip: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300', bar: 'bg-blue-500' },
    PLATING: { chip: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300', bar: 'bg-indigo-500' },
    RUNNER: { chip: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300', bar: 'bg-green-500' },
    HELPER: { chip: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300', bar: 'bg-purple-500' },
};

const roleStyle = (key) => ROLE_STYLE[key] || ROLE_STYLE.HELPER;

const VERDICT_STYLE = {
    success: {
        box: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200',
        icon: <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />,
    },
    warning: {
        box: 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-200',
        icon: <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />,
    },
    info: {
        box: 'bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-200',
        icon: <Info className="w-4 h-4 shrink-0 mt-0.5" />,
    },
};

const MONTH_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

const formatMonthLabel = (monthKey) => {
    const [y, m] = String(monthKey || '').split('-').map(Number);
    if (!y || !m) return monthKey || '';
    return `${MONTH_ID[m - 1]} ${y}`;
};

/** Kartu angka ringkas di bagian atas. */
const StatTile = ({ icon, label, value, sub, accent = 'text-gray-900 dark:text-white' }) => (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/60 p-3 sm:p-4">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {icon}
            <span className="truncate">{label}</span>
        </div>
        <div className={`mt-2 text-2xl font-bold leading-none ${accent}`}>{value}</div>
        {sub && <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{sub}</div>}
    </div>
);

const MyJobdeskRekapPanel = ({ month }) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [expanded, setExpanded] = useState(true);

    const fetchData = useCallback(async () => {
        if (!month) return;
        setLoading(true);
        setError(null);
        try {
            const res = await getMyJobdeskSummary(month);
            setData(res?.data || null);
        } catch (err) {
            setError(
                err?.response?.data?.error?.message
                || err?.response?.data?.message
                || 'Gagal memuat rekap jobdesk'
            );
            setData(null);
        } finally {
            setLoading(false);
        }
    }, [month]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const roles = data?.roles || [];
    const days = data?.days || {};
    // Pekerjaan yang benar-benar dipegang bulan ini (jumlah > 0), terberat dulu.
    const held = roles
        .map((r) => ({ ...r, count: days[r.key] || 0 }))
        .filter((r) => r.count > 0)
        .sort((a, b) => b.weight - a.weight || b.count - a.count);
    const maxCount = held.length ? Math.max(...held.map((r) => r.count)) : 0;
    const totalJobdeskDays = held.reduce((sum, r) => sum + r.count, 0);
    const monthLabel = formatMonthLabel(data?.month || month);
    const verdict = data?.verdict;
    const verdictStyle = VERDICT_STYLE[verdict?.tone] || VERDICT_STYLE.info;
    const comparison = data?.comparison;

    // Hari kerja yang belum tercatat jobdesk-nya — biasanya ini yang bikin staff
    // merasa "kok saya tidak dapat jobdesk?". Ditampilkan sebagai jumlah saja,
    // karena halaman ini sengaja hanya menyajikan rekap bulanan.
    const missingDays = (data?.byDate || []).filter((d) => !d.jobdesks.length);

    return (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm overflow-hidden">
            {/* ── Header ─────────────────────────────────────────────────── */}
            <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <button
                    type="button"
                    onClick={() => setExpanded((v) => !v)}
                    className="flex items-center gap-3 text-left min-w-0"
                >
                    <span className="p-2 rounded-lg bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300 shrink-0">
                        <BarChart2 className="w-5 h-5" />
                    </span>
                    <span className="min-w-0">
                        <span className="block font-semibold text-gray-900 dark:text-white">Rekap Jobdesk Saya</span>
                        <span className="block text-xs text-gray-500 dark:text-gray-400 truncate">
                            Berapa kali kamu pegang tiap jobdesk &mdash; {monthLabel}
                        </span>
                    </span>
                    <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ${expanded ? 'rotate-180' : ''}`} />
                </button>

                <button
                    type="button"
                    onClick={fetchData}
                    disabled={loading}
                    className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700 disabled:opacity-50 shrink-0"
                    title="Muat ulang rekap"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {expanded && (
                <div className="p-4 sm:p-6 space-y-4">
                    {loading && !data && (
                        <div className="text-center py-8 text-gray-400 dark:text-gray-500 text-sm">Memuat rekap jobdesk...</div>
                    )}

                    {error && (
                        <div className="flex items-start gap-2 text-sm border rounded-lg px-3 py-2 bg-red-50 border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200">
                            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                            <span>{error}</span>
                        </div>
                    )}

                    {!loading && !error && !data && (
                        <div className="text-center py-8 text-gray-400 dark:text-gray-500 text-sm">
                            Rekap jobdesk tidak tersedia untuk bulan ini.
                        </div>
                    )}

                    {!error && data && (
                        <>
                            {/* ── Verdict: satu kalimat kesimpulan ─────────────── */}
                            {verdict && (
                                <div className={`flex items-start gap-2 text-sm border rounded-lg px-3 py-2.5 ${verdictStyle.box}`}>
                                    {verdictStyle.icon}
                                    <span>
                                        <b>{verdict.label}.</b> {verdict.message}
                                    </span>
                                </div>
                            )}
                            {/* ── Angka utama ──────────────────────────────────── */}
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                                <StatTile
                                    icon={<CalendarDays className="w-3.5 h-3.5" />}
                                    label="Hari kerja"
                                    value={data.daysWorked}
                                    sub={data.multiJobdeskDays > 0
                                        ? `${data.multiJobdeskDays} hari rangkap jobdesk`
                                        : 'tanpa rangkap jobdesk'}
                                />
                                <StatTile
                                    icon={<Layers className="w-3.5 h-3.5" />}
                                    label="Total jobdesk"
                                    value={totalJobdeskDays}
                                    sub={`${held.length} jenis jobdesk`}
                                />
                                <StatTile
                                    icon={<Scale className="w-3.5 h-3.5" />}
                                    label="Beban / hari"
                                    value={data.loadPerDay}
                                    sub={`total beban ${data.loadTotal} poin`}
                                    accent="text-teal-700 dark:text-teal-300"
                                />
                                <StatTile
                                    icon={<CalendarX2 className="w-3.5 h-3.5" />}
                                    label="Tanpa jobdesk"
                                    value={data.daysWithoutJobdesk}
                                    sub={data.daysWithoutJobdesk > 0 ? 'perlu dilaporkan' : 'semua tercatat'}
                                    accent={data.daysWithoutJobdesk > 0
                                        ? 'text-amber-600 dark:text-amber-400'
                                        : 'text-gray-900 dark:text-white'}
                                />
                            </div>

                            {/* ── Rekap sebulan: berapa kali tiap jobdesk ──────── */}
                            <div>
                                <div className="flex items-baseline justify-between gap-2 flex-wrap">
                                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                                        Berapa kali kamu pegang tiap jobdesk
                                    </h3>
                                    <span className="text-xs text-gray-500 dark:text-gray-400">
                                        {monthLabel} &middot; {data.daysWorked} hari kerja
                                    </span>
                                </div>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                    Dihitung per jobdesk: nilai rangkap seperti &ldquo;Checker / Stock + Plating&rdquo;
                                    dihitung 1x Checker dan 1x Plating.
                                </p>
                            </div>
                            {held.length === 0 ? (
                                <div className="text-center py-6 text-sm text-gray-400 dark:text-gray-500">
                                    Belum ada jobdesk tercatat untukmu di {monthLabel}.
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {held.map((r) => {
                                        const style = roleStyle(r.key);
                                        const pct = maxCount ? Math.round((r.count / maxCount) * 100) : 0;
                                        return (
                                            <div key={r.key} className="flex items-center gap-3">
                                                <span className={`inline-flex items-center justify-center w-9 h-6 rounded text-xs font-bold shrink-0 ${style.chip}`}>
                                                    {r.short}
                                                </span>
                                                <span className="w-32 sm:w-40 shrink-0 text-sm text-gray-700 dark:text-gray-300 truncate" title={r.label}>
                                                    {r.label}
                                                </span>
                                                <span className="flex-1 h-2.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                                                    <span className={`block h-full rounded-full ${style.bar}`} style={{ width: `${pct}%` }} />
                                                </span>
                                                <span className="w-24 shrink-0 text-right text-sm">
                                                    <b className="text-gray-900 dark:text-white">{r.count}</b>
                                                    <span className="text-gray-400 dark:text-gray-500"> kali</span>
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                            {/* ── Perbandingan tim (agregat saja) ─────────────── */}
                            {comparison && comparison.teamStaffCount > 1 && (
                                <div className="rounded-lg bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 px-3 py-2.5 text-xs text-gray-600 dark:text-gray-300">
                                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                                        <span>
                                            Beban/hari kamu <b className="text-gray-900 dark:text-white">{data.loadPerDay}</b>
                                        </span>
                                        <span>
                                            Rata-rata tim <b className="text-gray-900 dark:text-white">{comparison.teamAvgLoadPerDay}</b>
                                        </span>
                                        <span className={
                                            comparison.diff > 0 ? 'text-amber-600 dark:text-amber-400'
                                                : comparison.diff < 0 ? 'text-blue-600 dark:text-blue-400'
                                                    : 'text-green-600 dark:text-green-400'
                                        }>
                                            {comparison.diff > 0 ? `+${comparison.diff} di atas rata-rata`
                                                : comparison.diff < 0 ? `${Math.abs(comparison.diff)} di bawah rata-rata`
                                                    : 'sama dengan rata-rata'}
                                        </span>
                                    </div>
                                    <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">
                                        Pembandingnya beban per hari kerja (A=5 &hellip; E=1), karena jumlah hari kerja tiap orang tidak sama.
                                        Rekap rinci per orang hanya bisa dilihat admin.
                                    </p>
                                </div>
                            )}

                            {/* ── Hari kerja yang belum tercatat jobdesk ──────── */}
                            {missingDays.length > 0 && (
                                <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-2.5">
                                    <div className="text-xs font-medium text-amber-800 dark:text-amber-200">
                                        {missingDays.length} hari kerja bulan ini belum tercatat jobdesk-nya
                                    </div>
                                    <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">
                                        Laporkan ke admin supaya jobdesk hari tersebut ikut dihitung.
                                    </p>
                                </div>
                            )}

                            <p className="text-[11px] text-gray-400 dark:text-gray-500 border-t border-gray-100 dark:border-gray-700 pt-3">
                                Sumber data sama dengan rekap yang dipakai admin, jadi angkanya selalu cocok.
                                Nilai rangkap dihitung per jobdesk &mdash; mis. &ldquo;Checker / Stock + Plating&rdquo; dihitung 1x Checker dan 1x Plating.
                            </p>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

export default MyJobdeskRekapPanel;
