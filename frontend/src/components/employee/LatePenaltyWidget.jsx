import { useState, useEffect } from 'react';
import { getMyPenalty } from '../../services/attendanceService';
import { AlertTriangle, CheckCircle, ChevronDown, ChevronUp } from 'lucide-react';

const MONTHS_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

const formatRp = (n) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);

const formatDate = (dateStr) => {
    const d = new Date(dateStr + 'T00:00:00');
    return `${d.getDate()} ${MONTHS_ID[d.getMonth()]}`;
};

const formatTime = (isoStr) => {
    if (!isoStr) return '-';
    const d = new Date(isoStr);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/**
 * Widget denda keterlambatan bertingkat:
 *   - 15–30 menit terlambat → penaltyLow  (Rp 7.500)
 *   - > 30 menit terlambat  → penaltyHigh (Rp 15.000)
 * @param {string} month   - YYYY-MM (opsional, default bulan ini)
 * @param {boolean} compact - Tampilan singkat untuk dashboard
 */
const LatePenaltyWidget = ({ month, compact = false }) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [showDetail, setShowDetail] = useState(false);

    const now = new Date();
    const targetMonth = month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const [y, m] = targetMonth.split('-').map(Number);
    const monthLabel = `${MONTHS_ID[m - 1]} ${y}`;

    useEffect(() => {
        setLoading(true);
        getMyPenalty(targetMonth)
            .then(res => setData(res.data))
            .catch(() => setData(null))
            .finally(() => setLoading(false));
    }, [targetMonth]);

    if (loading) return <div className="animate-pulse bg-gray-100 dark:bg-gray-800 rounded-xl h-20" />;
    if (!data) return null;

    const isGood = data.lateCount === 0;

    // ── COMPACT (dashboard) ────────────────────────────────────────────────
    if (compact) {
        return (
            <div className={`rounded-xl p-4 flex items-center gap-3 h-full ${isGood
                ? 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800'
                : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'}`}>
                {isGood
                    ? <CheckCircle className="w-8 h-8 text-emerald-500 flex-shrink-0" />
                    : <AlertTriangle className="w-8 h-8 text-red-500 flex-shrink-0" />}
                <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-500 dark:text-gray-400">{monthLabel}</p>
                    <p className={`font-bold text-sm ${isGood ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}`}>
                        {isGood
                            ? '✅ Tidak ada keterlambatan'
                            : `Terlambat ${data.lateCount}x — Potongan ${formatRp(data.totalDeduction)}`}
                    </p>
                    {!isGood && (
                        <p className="text-xs text-gray-400 mt-0.5">
                            15–30 mnt: {formatRp(data.penaltyLow)} · &gt;30 mnt: {formatRp(data.penaltyHigh)}
                        </p>
                    )}
                </div>
            </div>
        );
    }

    // ── FULL (halaman absensi) ─────────────────────────────────────────────
    return (
        <div className={`rounded-xl border overflow-hidden ${isGood
            ? 'border-emerald-200 dark:border-emerald-800'
            : 'border-red-200 dark:border-red-800'}`}>

            {/* Header */}
            <div className={`px-5 py-4 flex items-center justify-between ${isGood
                ? 'bg-emerald-50 dark:bg-emerald-900/20'
                : 'bg-red-50 dark:bg-red-900/20'}`}>
                <div className="flex items-center gap-3">
                    {isGood
                        ? <CheckCircle className="w-6 h-6 text-emerald-500 flex-shrink-0" />
                        : <AlertTriangle className="w-6 h-6 text-red-500 flex-shrink-0" />}
                    <div>
                        <p className="font-semibold text-gray-800 dark:text-gray-100 text-sm">
                            Potongan Keterlambatan — {monthLabel}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                            15–30 mnt: {formatRp(data.penaltyLow)} &nbsp;·&nbsp; &gt;30 mnt: {formatRp(data.penaltyHigh)}
                        </p>
                    </div>
                </div>
                <div className="text-right ml-4">
                    <p className={`text-xl font-bold ${isGood ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                        {isGood ? 'Rp 0' : formatRp(data.totalDeduction)}
                    </p>
                    <p className="text-xs text-gray-500">{data.lateCount}x terlambat</p>
                </div>
            </div>

            {/* Detail toggle */}
            {!isGood && (
                <>
                    <button
                        onClick={() => setShowDetail(v => !v)}
                        className="w-full px-5 py-2.5 flex items-center justify-between text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors border-t border-red-100 dark:border-red-900"
                    >
                        <span>{showDetail ? 'Sembunyikan detail' : 'Lihat detail keterlambatan'}</span>
                        {showDetail ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>

                    {showDetail && (
                        <div className="divide-y divide-gray-100 dark:divide-gray-800 bg-white dark:bg-gray-900">
                            {data.records.map((r, i) => (
                                <div key={r.id} className="px-5 py-3 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <span className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center flex-shrink-0 ${r.tier === 'high'
                                            ? 'bg-red-200 dark:bg-red-900/60 text-red-700 dark:text-red-300'
                                            : 'bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400'}`}>
                                            {i + 1}
                                        </span>
                                        <div>
                                            <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                                                {formatDate(r.date)}
                                                <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${r.tier === 'high'
                                                    ? 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400'
                                                    : 'bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-400'}`}>
                                                    {r.minutesLate} mnt
                                                </span>
                                            </p>
                                            <p className="text-xs text-gray-500">Masuk jam {formatTime(r.clockIn)}</p>
                                        </div>
                                    </div>
                                    <span className="text-sm font-semibold text-red-600 dark:text-red-400">
                                        -{formatRp(r.penalty)}
                                    </span>
                                </div>
                            ))}
                            <div className="px-5 py-3 flex justify-between bg-red-50 dark:bg-red-900/10">
                                <span className="text-sm font-bold text-gray-700 dark:text-gray-300">Total Potongan</span>
                                <span className="text-sm font-bold text-red-600 dark:text-red-400">{formatRp(data.totalDeduction)}</span>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default LatePenaltyWidget;
