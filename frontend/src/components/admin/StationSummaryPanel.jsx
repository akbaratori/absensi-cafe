import { useState, useEffect, useCallback } from 'react';
import { BarChart2, ChevronDown, RefreshCw } from 'lucide-react';
import api from '../../services/api';

const STATIONS = [
    'A - Main Cook',
    'B - Support Cook / Snack',
    'C - Checker / Stock',
    'D - Runner / Area',
    'E - Helper / Floating',
];

const STATION_SHORT = {
    'A - Main Cook': 'A',
    'B - Support Cook / Snack': 'B',
    'C - Checker / Stock': 'C',
    'D - Runner / Area': 'D',
    'E - Helper / Floating': 'E',
};

const STATION_COLORS = {
    'A - Main Cook': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    'B - Support Cook / Snack': 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
    'C - Checker / Stock': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    'D - Runner / Area': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    'E - Helper / Floating': 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
};

const StationSummaryPanel = () => {
    const now = new Date();
    const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const [month, setMonth] = useState(defaultMonth);
    const [summary, setSummary] = useState([]);
    const [loading, setLoading] = useState(false);
    const [expanded, setExpanded] = useState(true);

    const fetchSummary = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get(`/schedules/station-summary?month=${month}`);
            setSummary(res.data.data || []);
        } catch (err) {
            console.error('Failed to fetch station summary', err);
        } finally {
            setLoading(false);
        }
    }, [month]);

    useEffect(() => {
        fetchSummary();
    }, [fetchSummary]);

    // Find the max count for heat coloring
    const getHeat = (count, max) => {
        if (!count || !max) return '';
        const ratio = count / max;
        if (ratio >= 0.8) return 'font-bold text-red-600 dark:text-red-400';
        if (ratio >= 0.5) return 'font-semibold text-amber-600 dark:text-amber-400';
        return 'text-gray-700 dark:text-gray-300';
    };

    return (
        <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
            {/* Header */}
            <button
                className="w-full flex items-center justify-between px-5 py-4 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
                onClick={() => setExpanded(v => !v)}
            >
                <div className="flex items-center gap-2">
                    <BarChart2 className="w-5 h-5 text-primary-500" />
                    <span className="font-semibold text-gray-900 dark:text-white">
                        Ringkasan Jobdesk Bulan Ini
                    </span>
                    {summary.length > 0 && (
                        <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">
                            ({summary.length} karyawan Kitchen)
                        </span>
                    )}
                </div>
                <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${expanded ? 'rotate-180' : ''}`} />
            </button>

            {expanded && (
                <div className="p-4 space-y-4">
                    {/* Controls */}
                    <div className="flex items-center gap-3 flex-wrap">
                        <div className="flex items-center gap-2">
                            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Bulan:</label>
                            <input
                                type="month"
                                className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-1.5 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                value={month}
                                onChange={e => setMonth(e.target.value)}
                            />
                        </div>
                        <button
                            onClick={fetchSummary}
                            disabled={loading}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm bg-primary-50 hover:bg-primary-100 dark:bg-primary-900/20 dark:hover:bg-primary-900/40 text-primary-700 dark:text-primary-300 border border-primary-200 dark:border-primary-800 transition-colors disabled:opacity-50"
                        >
                            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                            Refresh
                        </button>
                    </div>

                    {/* Legend */}
                    <div className="flex flex-wrap gap-2">
                        {STATIONS.map(s => (
                            <span key={s} className={`text-xs px-2 py-1 rounded-full ${STATION_COLORS[s]}`}>
                                {STATION_SHORT[s]} – {s.split(' - ')[1]}
                            </span>
                        ))}
                    </div>

                    {/* Table */}
                    {loading ? (
                        <div className="flex items-center justify-center py-10 text-gray-400">
                            <RefreshCw className="w-5 h-5 animate-spin mr-2" />
                            Memuat data...
                        </div>
                    ) : summary.length === 0 ? (
                        <div className="text-center py-8 text-gray-400 dark:text-gray-500 text-sm">
                            Belum ada data jobdesk untuk bulan ini.
                            <br />
                            <span className="text-xs">Pastikan sudah generate rotasi role (A-E) untuk bulan ini.</span>
                        </div>
                    ) : (
                        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-gray-50 dark:bg-gray-800">
                                        <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">
                                            Nama
                                        </th>
                                        {STATIONS.map(s => (
                                            <th key={s} className={`px-3 py-3 text-center font-semibold border-b border-gray-200 dark:border-gray-700 ${STATION_COLORS[s]}`}>
                                                {STATION_SHORT[s]}
                                            </th>
                                        ))}
                                        <th className="px-3 py-3 text-center font-semibold text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">
                                            PIC 📦
                                        </th>
                                        <th className="px-3 py-3 text-center font-semibold text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">
                                            Shift PIC 🎯
                                        </th>
                                        <th className="px-3 py-3 text-center font-semibold text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">
                                            Sanitasi 🧹
                                        </th>
                                        <th className="px-3 py-3 text-center font-semibold text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">
                                            Total Masuk
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {summary.map((emp, idx) => {
                                        // Find max count across all stations for heat coloring
                                        const counts = STATIONS.map(s => emp.stations[s] || 0);
                                        const maxCount = Math.max(...counts, 1);

                                        return (
                                            <tr
                                                key={emp.userId}
                                                className={`
                                                    border-b border-gray-100 dark:border-gray-700 last:border-0
                                                    ${idx % 2 === 0 ? 'bg-white dark:bg-gray-900' : 'bg-gray-50/50 dark:bg-gray-800/30'}
                                                    hover:bg-primary-50/40 dark:hover:bg-primary-900/10 transition-colors
                                                `}
                                            >
                                                <td className="px-4 py-3 font-medium text-gray-900 dark:text-white whitespace-nowrap">
                                                    {emp.fullName}
                                                </td>
                                                {STATIONS.map(s => {
                                                    const count = emp.stations[s] || 0;
                                                    return (
                                                        <td key={s} className="px-3 py-3 text-center">
                                                            {count > 0 ? (
                                                                <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm ${count > 0 ? STATION_COLORS[s] : ''} ${getHeat(count, maxCount)}`}>
                                                                    {count}x
                                                                </span>
                                                            ) : (
                                                                <span className="text-gray-300 dark:text-gray-600">–</span>
                                                            )}
                                                        </td>
                                                    );
                                                })}
                                                <td className="px-3 py-3 text-center text-amber-700 dark:text-amber-400 font-medium">
                                                    {emp.picStokCount > 0 ? `${emp.picStokCount}x` : <span className="text-gray-300 dark:text-gray-600">–</span>}
                                                </td>
                                                <td className="px-3 py-3 text-center text-blue-700 dark:text-blue-400 font-medium">
                                                    {emp.shiftPicCount > 0 ? `${emp.shiftPicCount}x` : <span className="text-gray-300 dark:text-gray-600">–</span>}
                                                </td>
                                                <td className="px-3 py-3 text-center text-green-700 dark:text-green-400 font-medium">
                                                    {emp.sanitationCount > 0 ? `${emp.sanitationCount}x` : <span className="text-gray-300 dark:text-gray-600">–</span>}
                                                </td>
                                                <td className="px-3 py-3 text-center text-gray-500 dark:text-gray-400 text-xs font-semibold">
                                                    {emp.totalWorkDays}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}

                    <p className="text-xs text-gray-400 dark:text-gray-500">
                        💡 Angka merah = paling sering mendapat jobdesk tersebut bulan ini. Gunakan sebagai acuan agar distribusi lebih merata.
                    </p>
                </div>
            )}
        </div>
    );
};

export default StationSummaryPanel;
