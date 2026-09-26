import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import {
    CalendarRange, RefreshCw, AlertTriangle, Users, Clock, Timer,
    TrendingUp, CalendarDays, Download, ArrowUpDown, Info, Ban,
    ChevronDown, CalendarCheck,
} from 'lucide-react';
import { getAttendanceRecap } from '../../services/attendanceService';

/**
 * Rekap Absensi Seluruh Pegawai (admin) — periode FLEKSIBEL.
 *
 * Menjawab: "dalam rentang tanggal ini, tiap pegawai masuk berapa hari, telat
 * berapa kali, total jam berapa — dan tanggal mana yang paling ramai/sepi?"
 *
 * Periode bisa dipilih 5 cara (hari ini, 7 hari, bulan ini, bulan lalu, rentang
 * bebas). Semua cara itu akhirnya jadi SATU rentang `start..end` yang sama untuk
 * kartu ringkasan, tabel pegawai, dan sebaran harian — dan backend menjumlahkan
 * ringkasan dari baris pegawai yang sama yang dikirim ke UI, jadi angka di kartu
 * dan tabel tidak mungkin berbeda.
 */

const MONTH_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const DAY_ID = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

const pad2 = (n) => String(n).padStart(2, '0');

/** "YYYY-MM-DD" hari ini menurut WITA (UTC+8) — bukan zona waktu browser. */
const todayWITA = () => new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);

/** "YYYY-MM-DD" -> "12 Agu 2026" (di-parse sebagai UTC agar tidak geser sehari). */
const formatDayShort = (dateStr) => {
    if (!dateStr) return '-';
    const d = new Date(`${String(dateStr).slice(0, 10)}T00:00:00.000Z`);
    if (Number.isNaN(d.getTime())) return dateStr;
    return `${d.getUTCDate()} ${MONTH_ID[d.getUTCMonth()].slice(0, 3)} ${d.getUTCFullYear()}`;
};

/** Label periode yang enak dibaca: "1–26 Sep 2026" / "12 Agu 2026". */
const formatPeriodLabel = (period) => {
    if (!period) return '';
    if (period.start === period.end) return formatDayShort(period.start);
    const sameMonth = String(period.start).slice(0, 7) === String(period.end).slice(0, 7);
    if (sameMonth) {
        const [, m] = String(period.start).split('-').map(Number);
        return `${Number(String(period.start).slice(8, 10))}–${Number(String(period.end).slice(8, 10))} ${MONTH_ID[m - 1]} ${String(period.start).slice(0, 4)}`;
    }
    return `${formatDayShort(period.start)} – ${formatDayShort(period.end)}`;
};

const num = (v) => (typeof v === 'number' ? v.toLocaleString('id-ID') : '0');
const dec = (v, digits = 1) => (typeof v === 'number' ? v.toLocaleString('id-ID', { maximumFractionDigits: digits }) : '0');

/** Kartu angka ringkas di bagian atas panel. */
const StatTile = ({ icon, label, value, sub, accent = 'text-gray-900 dark:text-white', border = 'border-gray-200 dark:border-gray-700' }) => (
    <div className={`rounded-xl border ${border} bg-white dark:bg-gray-800/60 p-3`}>
        <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {icon}
            <span className="truncate">{label}</span>
        </div>
        <p className={`mt-1 text-xl font-bold ${accent}`}>{value}</p>
        {sub && <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{sub}</p>}
    </div>
);

/** Satu baris "label : nilai" di rincian pegawai. */
const Metric = ({ label, value, className = '' }) => (
    <div className="flex items-center justify-between gap-3 text-xs">
        <span className="text-gray-500 dark:text-gray-400">{label}</span>
        <span className={`font-semibold text-gray-800 dark:text-gray-200 ${className}`}>{value}</span>
    </div>
);

const RANGE_PRESETS = [
    { key: 'today', label: 'Hari ini' },
    { key: 'week', label: '7 hari' },
    { key: 'month', label: 'Bulan ini' },
    { key: 'lastMonth', label: 'Bulan lalu' },
    { key: 'custom', label: 'Rentang bebas' },
];

/** Kolom tabel per-pegawai: [key data, judul]. */
const EMPLOYEE_COLUMNS = [
    ['fullName', 'Nama'],
    ['department', 'Departemen'],
    ['presentDays', 'Hari Masuk'],
    ['present', 'Hadir'],
    ['late', 'Telat'],
    ['halfDay', '½ Hari'],
    ['absent', 'Absen'],
    ['onLeaveDays', 'Cuti'],
    ['totalHours', 'Jam Kerja'],
    ['attendanceRate', 'Kehadiran'],
];

/** Kolom tabel sebaran harian. */
const DAILY_COLUMNS = ['Tanggal', 'Hari', 'Pegawai Hadir', 'Total Absensi', 'Hadir', 'Telat', '½ Hari', 'Absen', 'Jam Kerja', 'Sebaran'];

const inputCls = 'px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100';
const btnCls = 'inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50';
const AttendanceRecapPanel = () => {
    const today = todayWITA();
    const thisMonth = today.slice(0, 7);

    const [preset, setPreset] = useState('month');
    const [customStart, setCustomStart] = useState(`${thisMonth}-01`);
    const [customEnd, setCustomEnd] = useState(today);
    const [department, setDepartment] = useState('');
    const [userId, setUserId] = useState('');

    const [report, setReport] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [sortKey, setSortKey] = useState('presentDays');
    const [sortDir, setSortDir] = useState('desc');
    const [expandedId, setExpandedId] = useState(null);
    const [showAllDaily, setShowAllDaily] = useState(false);
    // Opsi dropdown "diingat": respons yang sudah difilter hanya berisi
    // departemen/pegawai yang lolos filter, sehingga tanpa penggabungan ini
    // pilihan lain akan hilang dan admin tidak bisa kembali memilihnya.
    const [deptOptions, setDeptOptions] = useState([]);
    const [staffOptions, setStaffOptions] = useState([]);

    /** Terjemahkan preset + filter jadi query untuk backend. */
    const buildParams = useCallback(() => {
        const base = {};
        if (department) base.department = department;
        if (userId) base.userId = userId;

        const nowWita = todayWITA();

        if (preset === 'today') return { ...base, date: nowWita };

        if (preset === 'week') {
            const startMs = new Date(`${nowWita}T00:00:00.000Z`).getTime() - 6 * 86400000;
            return { ...base, start: new Date(startMs).toISOString().slice(0, 10), end: nowWita };
        }

        if (preset === 'month') return { ...base, month: nowWita.slice(0, 7) };

        if (preset === 'lastMonth') {
            const [y, m] = nowWita.slice(0, 7).split('-').map(Number);
            return { ...base, month: m === 1 ? `${y - 1}-12` : `${y}-${pad2(m - 1)}` };
        }

        // Rentang bebas: kalau kebetulan pas satu bulan penuh, kirim `month`
        // supaya backend tidak perlu menghitung rentang panjang.
        if (customStart && customEnd) {
            const sameMonth = customStart.slice(0, 7) === customEnd.slice(0, 7);
            if (sameMonth && customStart.endsWith('-01')) {
                const [y, m] = customStart.slice(0, 7).split('-').map(Number);
                const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
                if (Number(customEnd.slice(8, 10)) === lastDay) return { ...base, month: customStart.slice(0, 7) };
            }
            return { ...base, start: customStart, end: customEnd };
        }

        return { ...base, month: nowWita.slice(0, 7) };
    }, [preset, customStart, customEnd, department, userId]);

    const fetchRecap = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await getAttendanceRecap(buildParams());
            setReport(data);
            const freshDepts = data?.departments || [];
            const freshStaff = data?.staffOptions || [];
            if (freshDepts.length) setDeptOptions((prev) => [...new Set([...prev, ...freshDepts])].sort());
            if (freshStaff.length) {
                setStaffOptions((prev) => {
                    const byId = new Map(prev.map((s) => [s.userId, s]));
                    freshStaff.forEach((s) => byId.set(s.userId, s));
                    return [...byId.values()].sort((a, b) => a.fullName.localeCompare(b.fullName));
                });
            }
        } catch (err) {
            setReport(null);
            setError(
                err?.response?.data?.error?.message
                || err?.response?.data?.message
                || 'Gagal memuat rekap absensi. Coba lagi.'
            );
        } finally {
            setLoading(false);
        }
    }, [buildParams]);

    // Ambil ulang setiap periode/filter berubah. Rentang bebas yang belum lengkap
    // (salah satu tanggal kosong) tidak dipanggil supaya tidak menembak API sia-sia.
    useEffect(() => {
        if (preset === 'custom' && (!customStart || !customEnd)) return;
        fetchRecap();
    }, [preset, customStart, customEnd, department, userId, fetchRecap]);

    /** Baris pegawai terurut sesuai kolom yang diklik. */
    const employees = useMemo(() => {
        const rows = report?.employees || [];
        const dir = sortDir === 'asc' ? 1 : -1;
        return [...rows].sort((a, b) => {
            const av = a[sortKey];
            const bv = b[sortKey];
            if (typeof av === 'string' || typeof bv === 'string') {
                return String(av ?? '').localeCompare(String(bv ?? '')) * dir;
            }
            return ((av ?? 0) - (bv ?? 0)) * dir;
        });
    }, [report, sortKey, sortDir]);

    const summary = report?.summary;
    const daily = report?.daily || [];
    const visibleDaily = showAllDaily ? daily : daily.slice(-14);

    const toggleSort = (key) => {
        if (sortKey === key) {
            setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortKey(key);
            setSortDir(key === 'fullName' || key === 'department' ? 'asc' : 'desc');
        }
    };

    /** CSV dari tabel yang sedang tampil — angkanya persis yang dilihat admin. */
    const handleExportCsv = () => {
        if (!employees.length || !report) return;
        const header = [
            'Nama', 'ID Pegawai', 'Departemen', 'Hadir', 'Telat', 'Setengah Hari',
            'Absen', 'Hari Masuk', 'Hari Cuti', 'Jam Kerja', 'Rata-rata Jam/Hari',
            'Menit Telat', 'Belum Absen Pulang', 'Persentase Kehadiran',
        ];
        const lines = employees.map((r) => [
            r.fullName, r.employeeId, r.department, r.present, r.late, r.halfDay, r.absent,
            r.presentDays, r.onLeaveDays, r.totalHours, r.avgHoursPerPresentDay,
            r.lateMinutes, r.daysWithoutClockOut,
            r.attendanceRate === null ? '' : `${r.attendanceRate}%`,
        ].map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','));

        const csv = [
            `"Rekap Absensi ${formatPeriodLabel(report.period)}"`,
            `"Total pegawai: ${summary.totalEmployees}; Total jam kerja: ${summary.totalHours}"`,
            '',
            header.map((h) => `"${h}"`).join(','),
            ...lines,
        ].join('\n');

        const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `rekap-absensi_${report.period.start}_${report.period.end}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const sortIcon = (key) => (
        <ArrowUpDown className={`inline w-3 h-3 ml-1 ${sortKey === key ? 'text-primary-600 dark:text-primary-400' : 'text-gray-300 dark:text-gray-600'}`} />
    );

    /** Satu baris pegawai + baris rincian yang bisa dibuka. */
    const renderEmployeeRow = (r) => {
        const open = expandedId === r.userId;
        return (
            <Fragment key={r.userId}>
                <tr
                    onClick={() => setExpandedId(open ? null : r.userId)}
                    className="hover:bg-gray-50 dark:hover:bg-gray-700/40 cursor-pointer"
                >
                    <td className="px-3 py-2.5 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                            <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${open ? '' : '-rotate-90'}`} />
                            <span className="font-medium text-gray-900 dark:text-gray-100">{r.fullName}</span>
                            {!r.isActive && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300">nonaktif</span>
                            )}
                        </div>
                        {r.employeeId && <span className="text-[11px] text-gray-400 ml-5">{r.employeeId}</span>}
                    </td>
                    <td className="px-3 py-2.5 text-gray-600 dark:text-gray-300 whitespace-nowrap">{r.department || '-'}</td>
                    <td className="px-3 py-2.5 font-semibold text-gray-900 dark:text-gray-100">{num(r.presentDays)}</td>
                    <td className="px-3 py-2.5 text-emerald-600 dark:text-emerald-400">{num(r.present)}</td>
                    <td className="px-3 py-2.5 text-amber-600 dark:text-amber-400">
                        {r.late ? `${num(r.late)}${r.lateMinutes ? ` (${num(r.lateMinutes)}m)` : ''}` : '0'}
                    </td>
                    <td className="px-3 py-2.5 text-sky-600 dark:text-sky-400">{num(r.halfDay)}</td>
                    <td className="px-3 py-2.5 text-red-600 dark:text-red-400">{num(r.absent)}</td>
                    <td className="px-3 py-2.5 text-gray-600 dark:text-gray-300">{num(r.onLeaveDays)}</td>
                    <td className="px-3 py-2.5 text-indigo-600 dark:text-indigo-400 font-medium">{dec(r.totalHours)} j</td>
                    <td className="px-3 py-2.5">
                        {r.attendanceRate === null ? (
                            <span className="text-gray-400">-</span>
                        ) : (
                            <div className="flex items-center gap-2">
                                <div className="w-14 h-1.5 rounded-full bg-gray-200 dark:bg-gray-600 overflow-hidden">
                                    <div
                                        className={`h-full rounded-full ${r.attendanceRate >= 90 ? 'bg-emerald-500' : r.attendanceRate >= 70 ? 'bg-amber-500' : 'bg-red-500'}`}
                                        style={{ width: `${Math.min(100, r.attendanceRate)}%` }}
                                    />
                                </div>
                                <span className="text-xs text-gray-600 dark:text-gray-300">{dec(r.attendanceRate)}%</span>
                            </div>
                        )}
                    </td>
                </tr>
                {open && (
                    <tr className="bg-gray-50 dark:bg-gray-900/40">
                        <td colSpan={EMPLOYEE_COLUMNS.length} className="px-4 py-3">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <Metric label="Total record absensi" value={num(r.totalRecords)} />
                                <Metric label="Rata-rata jam / hari masuk" value={`${dec(r.avgHoursPerPresentDay)} jam`} />
                                <Metric label="Total menit telat" value={`${num(r.lateMinutes)} menit`} />
                                <Metric
                                    label="Belum absen pulang"
                                    value={`${num(r.daysWithoutClockOut)} hari`}
                                    className={r.daysWithoutClockOut > 0 ? 'text-amber-600 dark:text-amber-400' : ''}
                                />
                                <Metric label="Hari masuk (tanggal unik)" value={`${num(r.presentDays)} hari`} />
                                <Metric label="Hari cuti disetujui" value={`${num(r.onLeaveDays)} hari`} />
                                <Metric label="Persentase kehadiran" value={r.attendanceRate === null ? '-' : `${dec(r.attendanceRate)}%`} />
                                <Metric label="ID pegawai" value={r.employeeId || '-'} />
                            </div>
                        </td>
                    </tr>
                )}
            </Fragment>
        );
    };

    return (
        <div className="space-y-6">
            {/* ── Judul + aksi ────────────────────────────────────────── */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                    <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                        <CalendarRange className="w-5 h-5 text-primary-600" />
                        Rekap Absensi Seluruh Pegawai
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                        Pilih periode bebas — hari ini, seminggu, sebulan, atau rentang tanggal sendiri.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={fetchRecap} disabled={loading} className={btnCls}>
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        Muat ulang
                    </button>
                    <button onClick={handleExportCsv} disabled={!employees.length} className={btnCls}>
                        <Download className="w-4 h-4" />
                        CSV
                    </button>
                </div>
            </div>

            {/* ── Kontrol periode ─────────────────────────────────────── */}
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                    {RANGE_PRESETS.map((p) => (
                        <button
                            key={p.key}
                            onClick={() => setPreset(p.key)}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${preset === p.key
                                ? 'bg-primary-600 border-primary-600 text-white'
                                : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
                                }`}
                        >
                            {p.label}
                        </button>
                    ))}
                </div>

                {preset === 'custom' && (
                    <div className="flex flex-wrap items-end gap-3">
                        <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
                            Dari tanggal
                            <input
                                type="date"
                                value={customStart}
                                max={customEnd || undefined}
                                onChange={(e) => setCustomStart(e.target.value)}
                                className={inputCls}
                            />
                        </label>
                        <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
                            Sampai tanggal
                            <input
                                type="date"
                                value={customEnd}
                                min={customStart || undefined}
                                onChange={(e) => setCustomEnd(e.target.value)}
                                className={inputCls}
                            />
                        </label>
                        <p className="text-xs text-gray-400 dark:text-gray-500 pb-2">Maksimal 366 hari per rekap.</p>
                    </div>
                )}

                <div className="flex flex-wrap items-end gap-3">
                    <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
                        Departemen
                        <select value={department} onChange={(e) => setDepartment(e.target.value)} className={`${inputCls} min-w-[150px]`}>
                            <option value="">Semua departemen</option>
                            {deptOptions.map((d) => <option key={d} value={d}>{d}</option>)}
                        </select>
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
                        Pegawai
                        <select value={userId} onChange={(e) => setUserId(e.target.value)} className={`${inputCls} min-w-[180px]`}>
                            <option value="">Semua pegawai</option>
                            {staffOptions.map((s) => <option key={s.userId} value={s.userId}>{s.fullName}</option>)}
                        </select>
                    </label>
                    {report?.period && (
                        <div className="ml-auto text-xs text-gray-500 dark:text-gray-400 pb-2">
                            <span className="font-semibold text-gray-700 dark:text-gray-200">{formatPeriodLabel(report.period)}</span>
                            {' · '}{report.period.days} hari
                        </div>
                    )}
                </div>
            </div>

            {error && (
                <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-300 rounded-lg p-3 text-sm flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>{error}</span>
                </div>
            )}
            {loading && !report ? (
                <div className="flex items-center justify-center py-14 text-gray-400">
                    <RefreshCw className="w-5 h-5 animate-spin mr-2" />
                    Memuat rekap absensi...
                </div>
            ) : !report ? null : (
                <>
                    {/* ── Kartu ringkasan ─────────────────────────────── */}
                    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                        <StatTile
                            icon={<Users className="w-3.5 h-3.5" />}
                            label="Pegawai"
                            value={num(summary.totalEmployees)}
                            sub={`${num(summary.activeEmployees)} aktif · ${num(summary.staffWithRecord)} ada absensi`}
                        />
                        <StatTile
                            icon={<CalendarCheck className="w-3.5 h-3.5" />}
                            label="Hadir"
                            value={num(summary.present)}
                            sub={`${num(summary.late)} telat · ${num(summary.halfDay)} setengah hari`}
                            accent="text-emerald-600 dark:text-emerald-400"
                            border="border-emerald-200 dark:border-emerald-800"
                        />
                        <StatTile
                            icon={<Ban className="w-3.5 h-3.5" />}
                            label="Absen"
                            value={num(summary.absent)}
                            sub={`${num(summary.onLeaveDays)} hari cuti disetujui`}
                            accent={summary.absent > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}
                            border={summary.absent > 0 ? 'border-red-200 dark:border-red-800' : 'border-gray-200 dark:border-gray-700'}
                        />
                        <StatTile
                            icon={<Clock className="w-3.5 h-3.5" />}
                            label="Total jam"
                            value={`${dec(summary.totalHours)} j`}
                            sub={`rata-rata ${dec(summary.avgHoursPerPresentDay)} j per hari hadir`}
                            accent="text-indigo-600 dark:text-indigo-400"
                            border="border-indigo-200 dark:border-indigo-800"
                        />
                        <StatTile
                            icon={<Timer className="w-3.5 h-3.5" />}
                            label="Total telat"
                            value={`${num(summary.totalLateMinutes)} mnt`}
                            sub={`rata-rata ${dec(summary.avgPresentDaysPerStaff)} hari masuk / pegawai`}
                            accent="text-amber-600 dark:text-amber-400"
                            border="border-amber-200 dark:border-amber-800"
                        />
                        <StatTile
                            icon={<CalendarDays className="w-3.5 h-3.5" />}
                            label="Hari ada aktivitas"
                            value={`${num(summary.activeDays)}/${num(summary.activeDays + summary.emptyDays)}`}
                            sub={summary.holidayCount ? `${num(summary.holidayCount)} hari libur nasional` : 'tanpa libur nasional'}
                            accent="text-purple-600 dark:text-purple-400"
                            border="border-purple-200 dark:border-purple-800"
                        />
                    </div>
                    {/* ── Sorotan & yang perlu ditindak ───────────────── */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 space-y-2">
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                                <TrendingUp className="w-4 h-4 text-primary-600" /> Sorotan periode
                            </h3>
                            {summary.topHours ? (
                                <p className="text-sm text-gray-600 dark:text-gray-300">
                                    Jam kerja terbanyak: <span className="font-semibold text-gray-900 dark:text-gray-100">{summary.topHours.fullName}</span> ({dec(summary.topHours.hours)} jam)
                                </p>
                            ) : (
                                <p className="text-sm text-gray-400">Belum ada jam kerja tercatat.</p>
                            )}
                            {summary.topLate && (
                                <p className="text-sm text-gray-600 dark:text-gray-300">
                                    Paling sering telat: <span className="font-semibold text-amber-600 dark:text-amber-400">{summary.topLate.fullName}</span> ({num(summary.topLate.count)}x)
                                </p>
                            )}
                            {summary.daysWithoutClockOut > 0 && (
                                <p className="text-sm text-amber-600 dark:text-amber-400">
                                    {num(summary.daysWithoutClockOut)} absensi belum absen pulang — jam kerjanya tidak dihitung.
                                </p>
                            )}
                        </div>

                        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 space-y-2">
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                                <Info className="w-4 h-4 text-gray-400" /> Perlu ditindak
                            </h3>
                            {summary.staffWithoutRecord === 0 ? (
                                <p className="text-sm text-emerald-600 dark:text-emerald-400">
                                    Semua pegawai punya minimal satu absensi di periode ini.
                                </p>
                            ) : (
                                <>
                                    <p className="text-sm text-gray-600 dark:text-gray-300">
                                        <span className="font-semibold text-red-600 dark:text-red-400">{num(summary.staffWithoutRecord)}</span> pegawai tanpa absensi sama sekali:
                                    </p>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">
                                        {summary.neverClockedIn.map((r) => r.fullName).join(', ')}
                                        {summary.staffWithoutRecord > summary.neverClockedIn.length
                                            && ` +${summary.staffWithoutRecord - summary.neverClockedIn.length} lainnya`}
                                    </p>
                                </>
                            )}
                            <p className="text-xs text-gray-400 dark:text-gray-500 pt-1">
                                Persentase kehadiran = hari ada absensi ÷ (hari ada absensi + hari cuti disetujui).
                                Hari libur jadwal tidak punya baris absensi, jadi tidak menurunkan persentase.
                            </p>
                        </div>
                    </div>
                    {/* ── Tabel per pegawai ───────────────────────────── */}
                    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
                        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between gap-2 flex-wrap">
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                                Rekap per pegawai ({num(employees.length)})
                            </h3>
                            <span className="text-xs text-gray-400 dark:text-gray-500">
                                Klik baris untuk rincian · klik judul kolom untuk urutkan
                            </span>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
                                <thead className="bg-gray-50 dark:bg-gray-700/50">
                                    <tr>
                                        {EMPLOYEE_COLUMNS.map(([key, label]) => (
                                            <th
                                                key={key}
                                                onClick={() => toggleSort(key)}
                                                className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 cursor-pointer select-none whitespace-nowrap hover:text-gray-700 dark:hover:text-gray-200"
                                            >
                                                {label}{sortIcon(key)}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                    {!employees.length ? (
                                        <tr>
                                            <td colSpan={EMPLOYEE_COLUMNS.length} className="text-center py-10 text-gray-400">
                                                Tidak ada pegawai yang cocok dengan filter ini.
                                            </td>
                                        </tr>
                                    ) : employees.map((r) => renderEmployeeRow(r))}
                                </tbody>
                                {employees.length > 0 && (
                                    <tfoot className="bg-gray-50 dark:bg-gray-700/50 font-semibold text-gray-800 dark:text-gray-100">
                                        <tr>
                                            <td className="px-3 py-2.5" colSpan={2}>TOTAL ({num(employees.length)} pegawai)</td>
                                            <td className="px-3 py-2.5">{num(summary.present + summary.late + summary.halfDay + summary.absent)}</td>
                                            <td className="px-3 py-2.5 text-emerald-600 dark:text-emerald-400">{num(summary.present)}</td>
                                            <td className="px-3 py-2.5 text-amber-600 dark:text-amber-400">{num(summary.late)}</td>
                                            <td className="px-3 py-2.5 text-sky-600 dark:text-sky-400">{num(summary.halfDay)}</td>
                                            <td className="px-3 py-2.5 text-red-600 dark:text-red-400">{num(summary.absent)}</td>
                                            <td className="px-3 py-2.5">{num(summary.onLeaveDays)}</td>
                                            <td className="px-3 py-2.5 text-indigo-600 dark:text-indigo-400">{dec(summary.totalHours)} j</td>
                                            <td className="px-3 py-2.5 text-[11px] font-normal text-gray-500 dark:text-gray-400">
                                                kolom total = jumlah absensi
                                            </td>
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        </div>
                    </div>
                    {/* ── Sebaran harian ──────────────────────────────── */}
                    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
                        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between gap-2 flex-wrap">
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                                Sebaran harian ({num(visibleDaily.length)} dari {num(daily.length)} tanggal)
                            </h3>
                            {daily.length > 14 && (
                                <button
                                    onClick={() => setShowAllDaily((v) => !v)}
                                    className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline"
                                >
                                    {showAllDaily ? 'Tampilkan 14 tanggal terakhir' : `Tampilkan semua ${num(daily.length)} tanggal`}
                                </button>
                            )}
                        </div>

                        {!daily.length ? (
                            <p className="px-4 py-8 text-center text-sm text-gray-400">Tidak ada tanggal dalam rentang ini.</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
                                    <thead className="bg-gray-50 dark:bg-gray-700/50">
                                        <tr>
                                            {DAILY_COLUMNS.map((h) => (
                                                <th key={h} className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 whitespace-nowrap">{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                        {visibleDaily.map((d) => {
                                            const dow = new Date(`${d.date}T00:00:00.000Z`).getUTCDay();
                                            return (
                                                <tr key={d.date} className={d.isHoliday ? 'bg-purple-50/60 dark:bg-purple-900/20' : ''}>
                                                    <td className="px-3 py-2 whitespace-nowrap text-gray-900 dark:text-gray-100">
                                                        {formatDayShort(d.date)}
                                                        {d.isHoliday && (
                                                            <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300">
                                                                {d.holidayName}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className={`px-3 py-2 ${dow === 0 ? 'text-red-500' : 'text-gray-500 dark:text-gray-400'}`}>{DAY_ID[dow]}</td>
                                                    <td className="px-3 py-2 font-semibold text-gray-900 dark:text-gray-100">{num(d.uniqueStaff)}</td>
                                                    <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{num(d.total)}</td>
                                                    <td className="px-3 py-2 text-emerald-600 dark:text-emerald-400">{num(d.present)}</td>
                                                    <td className="px-3 py-2 text-amber-600 dark:text-amber-400">{num(d.late)}</td>
                                                    <td className="px-3 py-2 text-sky-600 dark:text-sky-400">{num(d.halfDay)}</td>
                                                    <td className="px-3 py-2 text-red-600 dark:text-red-400">{num(d.absent)}</td>
                                                    <td className="px-3 py-2 text-indigo-600 dark:text-indigo-400">{dec(d.totalHours)} j</td>
                                                    <td className="px-3 py-2 w-[160px]">
                                                        <div className="flex h-2 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-600">
                                                            {d.total > 0 && (
                                                                <>
                                                                    <div className="bg-emerald-500" style={{ width: `${(d.present / d.total) * 100}%` }} title={`Hadir ${d.present}`} />
                                                                    <div className="bg-amber-500" style={{ width: `${(d.late / d.total) * 100}%` }} title={`Telat ${d.late}`} />
                                                                    <div className="bg-sky-500" style={{ width: `${(d.halfDay / d.total) * 100}%` }} title={`Setengah hari ${d.halfDay}`} />
                                                                    <div className="bg-red-500" style={{ width: `${(d.absent / d.total) * 100}%` }} title={`Absen ${d.absent}`} />
                                                                </>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </>
            )}

        </div>
    );
};

export default AttendanceRecapPanel;

