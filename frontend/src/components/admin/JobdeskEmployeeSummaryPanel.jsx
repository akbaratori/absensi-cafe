import { useCallback, useEffect, useState } from 'react';
import {
    ChevronDown, RefreshCw, AlertTriangle, Layers, Users,
    CalendarDays, Trophy, Info,
} from 'lucide-react';
import { getJobdeskSummary } from '../../services/scheduleService';

/**
 * Rangkuman Jobdesk Pegawai (admin) — jawaban untuk pertanyaan:
 * "pegawai ini bulan ini sudah mengerjakan jobdesk apa saja, dan berapa kali?"
 *
 * Sumber datanya SAMA dengan "Rekap Keadilan Jobdesk" dan rekap milik staff
 * sendiri (`user_schedules.kitchen_station` bulan terpilih, dihitung lewat
 * helper yang sama di backend), jadi ketiga tampilan tidak bisa berbeda angka.
 * Setiap nilai rangkap dihitung per jobdesk
 * ('Checker / Stock + Plating' = 1x Checker DAN 1x Plating).
 *
 * Bedanya dengan panel keadilan: panel itu membandingkan beban antar staff,
 * panel ini meringkas JUMLAH jobdesk per pegawai + sebaran tiap jobdesk.
 */

const ROLE_HEADER_CLS = {
    MAIN: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    SUPPORT: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
    CHECKER: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    PLATING: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
    RUNNER: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    HELPER: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
};

const roleHeaderCls = (key) => ROLE_HEADER_CLS[key] || ROLE_HEADER_CLS.HELPER;

const MONTH_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

const formatMonthLabel = (monthKey) => {
    const [y, m] = String(monthKey || '').split('-').map(Number);
    if (!y || !m) return monthKey || '';
    return `${MONTH_ID[m - 1]} ${y}`;
};

/** Kartu angka ringkas di bagian atas panel. */
const StatTile = ({ icon, label, value, sub, accent = 'text-gray-900 dark:text-white' }) => (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/60 p-3">
        <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {icon}
            <span className="truncate">{label}</span>
        </div>
        <div className={`mt-1.5 text-xl font-bold leading-none ${accent}`}>{value}</div>
        {sub && <div className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">{sub}</div>}
    </div>
);

/** Angka ringkas di bagian atas panel. */
const SummaryTiles = ({ summary }) => (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile
            icon={<Layers className="w-3.5 h-3.5" />}
            label="Total jobdesk"
            value={summary.totalJobdesk ?? 0}
            sub={`${summary.totalWorkDays ?? 0} hari kerja terisi`}
            accent="text-teal-700 dark:text-teal-300"
        />
        <StatTile
            icon={<Users className="w-3.5 h-3.5" />}
            label="Pegawai dapur"
            value={summary.staffCount ?? 0}
            sub={`rata-rata ${summary.avgJobdeskPerStaff ?? 0} jobdesk/pegawai`}
        />
        <StatTile
            icon={<CalendarDays className="w-3.5 h-3.5" />}
            label="Terbanyak"
            value={summary.maxJobdeskPerStaff ?? 0}
            sub={summary.topStaff ? summary.topStaff.fullName : '-'}
        />
        <StatTile
            icon={<AlertTriangle className="w-3.5 h-3.5" />}
            label="Hari tanpa jobdesk"
            value={summary.daysWithoutJobdesk ?? 0}
            sub={(summary.daysWithoutJobdesk ?? 0) > 0 ? 'perlu diisi admin' : 'semua terisi'}
            accent={(summary.daysWithoutJobdesk ?? 0) > 0
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-gray-900 dark:text-white'}
        />
    </div>
);

/** Baris header tabel pegawai × jobdesk. */
const StaffTableHead = ({ roles }) => (
    <thead>
        <tr className="bg-gray-50 dark:bg-gray-800">
            <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">Pegawai</th>
            <th className="px-3 py-3 text-center font-semibold text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700" title="Jumlah jobdesk yang dikerjakan bulan ini (nilai rangkap dihitung per jobdesk)">Total</th>
            <th className="px-3 py-3 text-center font-semibold text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700" title="Berapa jenis jobdesk berbeda yang pernah dipegang">Jenis</th>
            {roles.map((r) => (
                <th
                    key={r.key}
                    title={`${r.label} (beban ${r.weight})`}
                    className={`px-3 py-3 text-center font-semibold border-b border-gray-200 dark:border-gray-700 ${roleHeaderCls(r.key)}`}
                >
                    {r.short}
                </th>
            ))}
            <th className="px-3 py-3 text-center font-semibold text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700" title="Hari kerja dengan lebih dari satu jobdesk">Rangkap</th>
            <th className="px-3 py-3 text-center font-semibold text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">Hari kerja</th>
            <th className="px-3 py-3 text-center font-semibold text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700" title="Rata-rata bobot beban jobdesk per hari kerja (A=5 ... E=1)">Beban/hari</th>
        </tr>
    </thead>
);

/** Satu baris pegawai: total, jenis, rincian per jobdesk, rangkap, beban. */
const StaffTableRow = ({ emp, roles, maxByRole, idx }) => (
    <tr
        className={`
            border-b border-gray-100 dark:border-gray-700 last:border-0
            ${idx % 2 === 0 ? 'bg-white dark:bg-gray-900' : 'bg-gray-50/50 dark:bg-gray-800/30'}
            hover:bg-primary-50/40 dark:hover:bg-primary-900/10 transition-colors
        `}
    >
        <td className="px-4 py-3 font-medium text-gray-900 dark:text-white whitespace-nowrap">
            {emp.fullName}
            {emp.daysWithoutJobdesk > 0 && (
                <span className="ml-2 text-[10px] font-normal text-amber-600 dark:text-amber-400">
                    {emp.daysWithoutJobdesk} hari kosong
                </span>
            )}
        </td>
        <td className="px-3 py-3 text-center">
            <span className="inline-flex items-center justify-center min-w-[2.25rem] h-7 px-2 rounded-full text-xs font-bold bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300">
                {emp.totalJobdesk}
            </span>
        </td>
        <td className="px-3 py-3 text-center text-gray-600 dark:text-gray-300">{emp.jobdeskTypes}</td>
        {roles.map((r) => {
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
        <td className="px-3 py-3 text-center font-semibold text-gray-700 dark:text-gray-300">{emp.loadPerDay}</td>
    </tr>
);

/** Tabel sebaran tiap jobdesk ke seluruh pegawai. */
const JobdeskSpreadTable = ({ byJobdesk }) => (
    <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
        <table className="w-full text-sm">
            <thead>
                <tr className="bg-gray-50 dark:bg-gray-800">
                    <th className="px-4 py-2 text-left font-semibold text-gray-700 dark:text-gray-300">Sebaran per jobdesk</th>
                    <th className="px-3 py-2 text-center font-semibold text-gray-700 dark:text-gray-300">Total</th>
                    <th className="px-3 py-2 text-center font-semibold text-gray-700 dark:text-gray-300" title="Jumlah pegawai yang pernah memegang jobdesk ini">Pegawai</th>
                    <th className="px-3 py-2 text-center font-semibold text-gray-700 dark:text-gray-300">Paling banyak</th>
                    <th className="px-3 py-2 text-center font-semibold text-gray-700 dark:text-gray-300">Paling sedikit</th>
                    <th className="px-4 py-2 text-left font-semibold text-gray-700 dark:text-gray-300">Paling sering dapat</th>
                </tr>
            </thead>
            <tbody>
                {byJobdesk.map((j) => (
                    <tr key={j.key} className="border-b border-gray-100 dark:border-gray-700 last:border-0">
                        <td className="px-4 py-2 whitespace-nowrap">
                            <span className={`inline-flex items-center justify-center w-9 h-6 rounded text-xs font-bold mr-2 ${roleHeaderCls(j.key)}`}>
                                {j.short}
                            </span>
                            <span className="text-gray-700 dark:text-gray-300">{j.label}</span>
                        </td>
                        <td className="px-3 py-2 text-center font-semibold text-gray-700 dark:text-gray-300">{j.total}x</td>
                        <td className="px-3 py-2 text-center text-gray-600 dark:text-gray-300">{j.staffCount}</td>
                        <td className="px-3 py-2 text-center text-gray-700 dark:text-gray-300">{j.max}x</td>
                        <td className="px-3 py-2 text-center text-gray-700 dark:text-gray-300">{j.min}x</td>
                        <td className="px-4 py-2 text-gray-600 dark:text-gray-300 whitespace-nowrap">
                            {j.topStaff && j.topStaff.count > 0
                                ? <span><b className="text-gray-900 dark:text-white">{j.topStaff.fullName}</b> ({j.topStaff.count}x)</span>
                                : <span className="text-gray-300 dark:text-gray-600">&ndash;</span>}
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
);

/**
 * Isi panel: angka ringkas, tabel pegawai × jobdesk, lalu sebaran per jobdesk.
 * Dipisah dari bagian fetch agar tidak menumpuk dalam satu komponen.
 */
const JobdeskSummaryBody = ({ report }) => {
    const roles = report.roles || [];
    const staff = report.staff || [];
    const byJobdesk = report.byJobdesk || [];

    // Nilai tertinggi tiap kolom jobdesk → ditandai (paling sering dapat).
    const maxByRole = {};
    for (const r of roles) {
        maxByRole[r.key] = staff.length
            ? Math.max(...staff.map((s) => s.counts?.[r.key] || 0))
            : 0;
    }

    return (
        <>
            <SummaryTiles summary={report.summary || {}} />

            {staff.length === 0 ? (
                <div className="text-center py-8 text-gray-400 dark:text-gray-500 text-sm">
                    Belum ada hari kerja Dapur pada bulan ini.
                </div>
            ) : (
                <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                    <table className="w-full text-sm">
                        <StaffTableHead roles={roles} />
                        <tbody>
                            {staff.map((emp, idx) => (
                                <StaffTableRow key={emp.userId} emp={emp} roles={roles} maxByRole={maxByRole} idx={idx} />
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {byJobdesk.length > 0 && <JobdeskSpreadTable byJobdesk={byJobdesk} />}

            <p className="text-xs text-gray-400 dark:text-gray-500">
                &#128161; <b>Total</b> = berapa kali jobdesk dikerjakan bulan ini; nilai rangkap dihitung per jobdesk
                (mis. &ldquo;Checker / Stock + Plating&rdquo; = 1x Checker + 1x Plating). Angka ini sama dengan yang
                dilihat pegawai di halaman Jadwal Saya dan dengan panel Rekap Keadilan Jobdesk di atas.
            </p>
        </>
    );
};

const JobdeskEmployeeSummaryPanel = ({ month, onMonthChange }) => {
    const [report, setReport] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [expanded, setExpanded] = useState(false);

    const fetchReport = useCallback(async () => {
        if (!month) return;
        setLoading(true);
        setError(null);
        try {
            const res = await getJobdeskSummary(month);
            setReport(res?.data || null);
        } catch (err) {
            setError(
                err?.response?.data?.error?.message
                || err?.response?.data?.message
                || 'Gagal memuat rangkuman jobdesk pegawai'
            );
            setReport(null);
        } finally {
            setLoading(false);
        }
    }, [month]);

    useEffect(() => { fetchReport(); }, [fetchReport]);

    const summary = report?.summary;

    return (
        <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
            <button
                type="button"
                className="w-full flex items-center justify-between px-5 py-4 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
                onClick={() => setExpanded((v) => !v)}
            >
                <div className="flex items-center gap-2 flex-wrap">
                    <Trophy className="w-5 h-5 text-primary-500" />
                    <span className="font-semibold text-gray-900 dark:text-white">Rangkuman Jobdesk Pegawai</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                        {formatMonthLabel(month)} &middot; {summary?.totalJobdesk ?? 0} jobdesk &middot; {summary?.staffCount ?? 0} pegawai
                    </span>
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
                                onChange={(e) => (onMonthChange ? onMonthChange(e.target.value) : null)}
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
                        <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                            <Info className="w-3.5 h-3.5" />
                            Jobdesk diambil dari jadwal bulan ini &mdash; sama dengan tabel jadwal di bawah.
                        </span>
                    </div>

                    {error && (
                        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-300 rounded-lg p-3 text-sm">
                            {error}
                        </div>
                    )}

                    {loading && !report ? (
                        <div className="flex items-center justify-center py-10 text-gray-400">
                            <RefreshCw className="w-5 h-5 animate-spin mr-2" />
                            Memuat rangkuman...
                        </div>
                    ) : !report ? null : (
                        <JobdeskSummaryBody report={report} />
                    )}
                </div>
            )}
        </div>
    );
};

export default JobdeskEmployeeSummaryPanel;

