import { useState, useEffect } from 'react';
import { getPublicSchedule } from '../../services/publicService';
import { Calendar, Clock, User, Coffee } from 'lucide-react';

const PublicScheduleWidget = () => {
    const [schedules, setSchedules] = useState([]);
    const [loading, setLoading] = useState(true);
    const [dateFilter, setDateFilter] = useState('today'); // 'today' | 'tomorrow'

    useEffect(() => {
        fetchSchedule();
    }, [dateFilter]);

    const fetchSchedule = async () => {
        setLoading(true);
        try {
            const today = new Date();
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);

            const dateToFetch = dateFilter === 'today' ? today : tomorrow;
            const dateStr = dateToFetch.toISOString().split('T')[0];

            const response = await getPublicSchedule(dateStr, dateStr);
            setSchedules(response.data?.data || []);
        } catch (error) {
            console.error("Failed to fetch public schedule:", error);
        } finally {
            setLoading(false);
        }
    };

    // Group by Shift
    const groupedSchedules = schedules.reduce((acc, curr) => {
        const key = curr.shiftName;
        if (!acc[key]) acc[key] = [];
        acc[key].push(curr);
        return acc;
    }, {});

    const shiftOrder = ['Shift 1', 'Shift 2', 'Shift 3', 'OFF'];

    return (
        <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-2xl p-6 shadow-xl border border-gray-100 dark:border-gray-700 h-full flex flex-col">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-2xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
                        <Coffee className="w-6 h-6 text-primary-600" />
                        Jadwal Cafe
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        {new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </p>
                </div>

                <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
                    <button
                        onClick={() => setDateFilter('today')}
                        className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${dateFilter === 'today'
                                ? 'bg-white dark:bg-gray-600 text-primary-600 shadow-sm'
                                : 'text-gray-500 dark:text-gray-400 hover:text-gray-800'
                            }`}
                    >
                        Hari Ini
                    </button>
                    <button
                        onClick={() => setDateFilter('tomorrow')}
                        className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${dateFilter === 'tomorrow'
                                ? 'bg-white dark:bg-gray-600 text-primary-600 shadow-sm'
                                : 'text-gray-500 dark:text-gray-400 hover:text-gray-800'
                            }`}
                    >
                        Besok
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 space-y-4 custom-scrollbar">
                {loading ? (
                    <div className="flex items-center justify-center h-40">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                    </div>
                ) : schedules.length === 0 ? (
                    <div className="text-center py-10 text-gray-500">
                        Belum ada jadwal dirilis.
                    </div>
                ) : (
                    shiftOrder.map(shiftName => {
                        const employees = groupedSchedules[shiftName];
                        if (!employees || employees.length === 0) return null;

                        const isOff = shiftName === 'OFF';
                        const startTime = employees[0].startTime ? employees[0].startTime.slice(0, 5) : '';
                        const endTime = employees[0].endTime ? employees[0].endTime.slice(0, 5) : '';

                        return (
                            <div key={shiftName} className={`rounded-xl p-4 border ${isOff ? 'bg-gray-50 border-gray-200 dark:bg-gray-800/50 dark:border-gray-700' : 'bg-blue-50/50 border-blue-100 dark:bg-blue-900/10 dark:border-blue-800/30'}`}>
                                <div className="flex justify-between items-center mb-3">
                                    <h3 className={`font-semibold ${isOff ? 'text-gray-600 dark:text-gray-400' : 'text-primary-700 dark:text-primary-300'}`}>
                                        {shiftName}
                                    </h3>
                                    {!isOff && (
                                        <span className="text-xs font-medium px-2 py-1 bg-white dark:bg-gray-700 rounded-lg text-gray-600 dark:text-gray-300 flex items-center gap-1">
                                            <Clock className="w-3 h-3" />
                                            {startTime} - {endTime}
                                        </span>
                                    )}
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    {employees.map(emp => (
                                        <div key={emp.id} className="flex items-center gap-2 p-2 rounded-lg bg-white dark:bg-gray-800 shadow-sm">
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold
                                                ${emp.department === 'KITCHEN' ? 'bg-orange-100 text-orange-600' : 'bg-purple-100 text-purple-600'}
                                            `}>
                                                {emp.employeeName.charAt(0)}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                                    {emp.employeeName}
                                                </p>
                                                <p className="text-[10px] text-gray-500 uppercase tracking-wide">
                                                    {emp.department}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
};

export default PublicScheduleWidget;
