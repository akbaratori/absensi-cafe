import { useState, useEffect } from 'react';
import { Calendar as CalendarIcon, Filter, ChevronLeft, ChevronRight, Edit2 } from 'lucide-react';
import { getAllSchedules, updateSchedule } from '../../services/scheduleService';
import { getAllShifts } from '../../services/shiftService';
import Card from '../shared/Card';
import Avatar from '../shared/Avatar';
import Modal from '../shared/Modal';
import Button from '../shared/Button';
import { showSuccess, showError } from '../../hooks/useToast';

const ScheduleCalendar = () => {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [schedules, setSchedules] = useState([]);
    const [loading, setLoading] = useState(true);
    const [departmentFilter, setDepartmentFilter] = useState('ALL');
    const [selectedSchedule, setSelectedSchedule] = useState(null);
    const [showEditModal, setShowEditModal] = useState(false);
    const [editForm, setEditForm] = useState({ shiftId: '', isOffDay: false });
    const [updateLoading, setUpdateLoading] = useState(false);
    const [allShifts, setAllShifts] = useState([]);

    useEffect(() => {
        fetchSchedules();
    }, [currentDate, departmentFilter]);

    useEffect(() => {
        getAllShifts().then(res => {
            setAllShifts(res.data?.shifts || []);
        }).catch(() => { });
    }, []);

    // Helper to format date as YYYY-MM-DD in local time
    const formatDateKey = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const fetchSchedules = async () => {
        setLoading(true);
        try {
            // Get first and last day of current month
            const year = currentDate.getFullYear();
            const month = currentDate.getMonth();

            const startDate = formatDateKey(new Date(year, month, 1));
            const endDate = formatDateKey(new Date(year, month + 1, 0));

            const response = await getAllSchedules({
                startDate,
                endDate,
                department: departmentFilter
            });
            setSchedules(response.data.data);
        } catch (error) {
            console.error('Failed to fetch schedules:', error);
        } finally {
            setLoading(false);
        }
    };

    const nextMonth = () => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    };

    const prevMonth = () => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    };

    const isToday = (date) => {
        const today = new Date();
        return date.getDate() === today.getDate() &&
            date.getMonth() === today.getMonth() &&
            date.getFullYear() === today.getFullYear();
    };



    // Helper to group schedules by date
    const getSchedulesForDate = (day) => {
        const dateKey = formatDateKey(new Date(currentDate.getFullYear(), currentDate.getMonth(), day));
        return schedules.filter(s => s.date.startsWith(dateKey));
    };

    const getShiftColor = (shiftId) => {
        if (!shiftId) return 'bg-gray-200 text-gray-600 border-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600 font-bold'; // Off
        if (shiftId === 1) return 'bg-blue-600 text-white border-blue-700 dark:bg-blue-700 dark:border-blue-800'; // Shift 1 - Pagi
        if (shiftId === 2) return 'bg-amber-600 text-white border-amber-700 dark:bg-amber-700 dark:border-amber-800'; // Shift 2 - Siang
        // All other shifts (Ramadhan, etc) — dark indigo
        return 'bg-indigo-700 text-white border-indigo-800 dark:bg-indigo-800 dark:border-indigo-900';
    };

    const handleScheduleClick = (schedule) => {
        setSelectedSchedule(schedule);
        setEditForm({
            shiftId: schedule.shiftId || '',
            isOffDay: schedule.isOffDay
        });
        setShowEditModal(true);
    };

    const handleUpdateSchedule = async (e) => {
        e.preventDefault();
        if (!selectedSchedule) return;

        setUpdateLoading(true);
        try {
            await updateSchedule(selectedSchedule.id, {
                shiftId: editForm.isOffDay ? null : parseInt(editForm.shiftId),
                isOffDay: editForm.isOffDay
            });

            showSuccess('Jadwal berhasil diperbarui');
            setShowEditModal(false);
            fetchSchedules(); // Refresh data
        } catch (error) {
            showError('Gagal memperbarui jadwal');
            console.error(error);
        } finally {
            setUpdateLoading(false);
        }
    };

    // Render calendar grid
    const renderCalendar = () => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const firstDayOfMonth = new Date(year, month, 1).getDay(); // 0 = Sun

        const blanks = Array(firstDayOfMonth).fill(null);
        const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

        const allSlots = [...blanks, ...days];

        return (
            <div className="grid grid-cols-7 gap-px bg-gray-200 dark:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                {['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'].map(day => (
                    <div key={day} className="bg-gray-50 dark:bg-gray-800 p-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                        {day}
                    </div>
                ))}

                {allSlots.map((day, index) => {
                    if (!day) return <div key={`blank-${index}`} className="bg-white dark:bg-gray-900 min-h-[120px]" />;

                    const daysSchedules = getSchedulesForDate(day);
                    const isCurrentDay = isToday(new Date(year, month, day));

                    return (
                        <div key={day} className={`bg-white dark:bg-gray-900 min-h-[120px] p-2 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${isCurrentDay ? 'ring-2 ring-inset ring-primary-500' : ''}`}>
                            <div className="flex justify-between items-start mb-2">
                                <span className={`text-sm font-medium ${isCurrentDay ? 'text-primary-600 dark:text-primary-400' : 'text-gray-900 dark:text-gray-100'}`}>
                                    {day}
                                </span>
                                <span className="text-xs text-gray-400">
                                    {daysSchedules.length} Staf
                                </span>
                            </div>

                            <div className="space-y-1">
                                {daysSchedules
                                    .sort((a, b) => {
                                        // Sort by Shift ID (1=Morning, 2=Afternoon, others/null last)
                                        const shiftA = a.shiftId || 99;
                                        const shiftB = b.shiftId || 99;
                                        return shiftA - shiftB;
                                    })
                                    .map((schedule) => (
                                        <div
                                            key={schedule.id}
                                            className={`text-xs p-1 rounded border mb-1 flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity ${getShiftColor(schedule.shiftId)}`}
                                            title={`${schedule.user.fullName} - ${schedule.isOffDay ? 'OFF' : schedule.shift?.name} (Klik untuk edit)`}
                                            onClick={() => handleScheduleClick(schedule)}
                                        >
                                            <div className="w-1.5 h-1.5 rounded-full bg-current opacity-50 flex-shrink-0" />
                                            <span className="font-medium break-words leading-tight">
                                                {schedule.user.fullName}
                                                <span className="text-[10px] opacity-60 ml-1">
                                                    ({schedule.user.department?.substring(0, 3)})
                                                </span>
                                                {schedule.kitchenStation && !schedule.isOffDay && (
                                                    <span className="block mt-0.5 text-[10px] text-white/80 font-bold italic whitespace-pre-line">
                                                        {schedule.kitchenStation.split(' + ')[0]}
                                                        {/* LOCKED SLOT INDICATOR for Role C (Admin View) */}
                                                        {schedule.kitchenStation.startsWith('C') && (
                                                            <span className="block mt-0.5 text-[8px] font-extrabold text-red-200 bg-red-700 px-1 rounded border border-red-600 w-fit">
                                                                LOCK 14:00
                                                            </span>
                                                        )}
                                                    </span>
                                                )}

                                                {/* Control Badge (Strict: Max 1) */}
                                                {!schedule.isOffDay && (
                                                    schedule.isInventoryController ? (
                                                        <span className="block mt-0.5 text-[9px] font-bold text-white bg-green-600 px-1 py-0.5 rounded w-fit">
                                                            [PIC STOK]
                                                        </span>
                                                    ) : schedule.isShiftPic ? (
                                                        <span className="block mt-0.5 text-[9px] font-bold text-white bg-blue-600 px-1 py-0.5 rounded w-fit">
                                                            [SHIFT PIC]
                                                        </span>
                                                    ) : schedule.isSanitationLead ? (
                                                        <span className="block mt-0.5 text-[9px] font-bold text-white bg-teal-600 px-1 py-0.5 rounded w-fit">
                                                            [SANITATION {schedule.shiftId === 1 ? 'OPEN' : 'CLOSE'} - PRIORITY]
                                                        </span>
                                                    ) : null
                                                )}

                                                {/* Dishwasher Badge for Role D & E (Admin View) */}
                                                {!schedule.isOffDay && schedule.kitchenStation && (schedule.kitchenStation.startsWith('D') || schedule.kitchenStation.startsWith('E')) && (
                                                    <span className="block mt-0.5 text-[9px] font-bold text-white bg-gray-600 px-1 py-0.5 rounded border border-gray-500 w-fit">
                                                        [DISHWASHER]
                                                    </span>
                                                )}


                                            </span>

                                            {schedule.isOffDay ? (
                                                <span className="opacity-75 text-[10px] uppercase font-bold ml-auto">OFF</span>
                                            ) : (
                                                <span className="opacity-75 text-[10px] ml-auto">
                                                    {schedule.shiftId === 1 ? 'Pagi' : 'Siang'}
                                                </span>
                                            )}
                                        </div>
                                    ))}
                                {daysSchedules.length === 0 && (
                                    <div className="text-xs text-center text-gray-300 dark:text-gray-600 py-4 italic">
                                        Kosong
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };

    const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

    return (
        <div className="space-y-4">
            {/* Area specifically for Image Export */}
            <div id="print-area-calendar" className="space-y-4 bg-white dark:bg-gray-800 p-2 rounded-lg">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
                            <span className="px-4 font-bold text-xl text-gray-900 dark:text-white min-w-[200px] text-center">
                                {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <Filter className="w-4 h-4 text-gray-400" />
                        <select
                            className="text-sm border-gray-300 dark:border-gray-600 dark:bg-gray-700 rounded-md focus:ring-primary-500 focus:border-primary-500"
                            value={departmentFilter}
                            onChange={(e) => setDepartmentFilter(e.target.value)}
                        >
                            <option value="ALL">Semua Departemen</option>
                            <option value="BAR">Bar</option>
                            <option value="KITCHEN">Kitchen</option>
                        </select>
                    </div>
                </div>

                {/* Legend */}
                <div className="flex flex-wrap gap-4 text-xs px-2">
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded bg-blue-600 border border-blue-700"></div>
                        <span className="text-gray-600 dark:text-gray-400">Shift Pagi</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded bg-amber-600 border border-amber-700"></div>
                        <span className="text-gray-600 dark:text-gray-400">Shift Siang</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded bg-indigo-700 border border-indigo-800"></div>
                        <span className="text-gray-600 dark:text-gray-400">Shift Lainnya</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded bg-gray-300 border border-gray-400"></div>
                        <span className="text-gray-600 dark:text-gray-400">Libur (OFF)</span>
                    </div>
                </div>

                {/* Calendar Grid */}
                {loading ? (
                    <div className="h-96 flex items-center justify-center bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                    </div>
                ) : (
                    renderCalendar()
                )}
            </div>

            {/* Navigation Controls (Outside Print Area to avoid clutter) */}
            <div className="flex justify-between px-4">
                <Button variant="outline" size="sm" onClick={prevMonth}>
                    <ChevronLeft className="w-4 h-4 mr-1" /> Bulan Sebelumnya
                </Button>
                <Button variant="outline" size="sm" onClick={nextMonth}>
                    Bulan Berikutnya <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
            </div>

            {/* Monthly Shift Summary */}
            <Card>
                <div className="p-4">
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">Ringkasan Shift Bulanan</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {Object.values(schedules.reduce((acc, curr) => {
                            if (!acc[curr.userId]) {
                                acc[curr.userId] = {
                                    id: curr.userId,
                                    name: curr.user.fullName,
                                    department: curr.user.department,
                                    shift1: 0,
                                    shift2: 0,
                                    off: 0
                                };
                            }
                            if (curr.isOffDay) {
                                acc[curr.userId].off++;
                            } else if (curr.shiftId === 1) {
                                acc[curr.userId].shift1++;
                            } else if (curr.shiftId === 2) {
                                acc[curr.userId].shift2++;
                            }
                            return acc;
                        }, {})).sort((a, b) => a.department.localeCompare(b.department) || a.name.localeCompare(b.name)).map(stat => (
                            <div key={stat.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg border border-gray-100 dark:border-gray-700">
                                <div>
                                    <p className="font-medium text-sm text-gray-900 dark:text-white">{stat.name}</p>
                                    <span className="text-xs text-gray-500">{stat.department}</span>
                                </div>
                                <div className="flex gap-2 text-xs font-medium">
                                    <div className="flex flex-col items-center p-1 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded min-w-[3rem]">
                                        <span>Pagi</span>
                                        <span className="text-sm font-bold">{stat.shift1}</span>
                                    </div>
                                    <div className="flex flex-col items-center p-1 bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300 rounded min-w-[3rem]">
                                        <span>Siang</span>
                                        <span className="text-sm font-bold">{stat.shift2}</span>
                                    </div>
                                    <div className="flex flex-col items-center p-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded min-w-[3rem]">
                                        <span>OFF</span>
                                        <span className="text-sm font-bold">{stat.off}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </Card>

            {/* Edit Schedule Modal */}
            <Modal
                isOpen={showEditModal}
                onClose={() => setShowEditModal(false)}
                title="Edit Jadwal Pegawai"
            >
                <form onSubmit={handleUpdateSchedule} className="space-y-4">
                    {selectedSchedule && (
                        <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-100 dark:border-gray-700">
                            <p className="text-sm text-gray-600 dark:text-gray-400">Pegawai</p>
                            <p className="font-medium text-gray-900 dark:text-white">{selectedSchedule.user.fullName}</p>
                            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">Tanggal</p>
                            <p className="font-medium text-gray-900 dark:text-white">
                                {new Date(selectedSchedule.date).toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                            </p>
                        </div>
                    )}

                    <div className="space-y-3">
                        <div className="flex items-center">
                            <input
                                type="checkbox"
                                id="isOffDay"
                                className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                                checked={editForm.isOffDay}
                                onChange={(e) => setEditForm({ ...editForm, isOffDay: e.target.checked })}
                            />
                            <label htmlFor="isOffDay" className="ml-2 block text-sm font-medium text-gray-900 dark:text-gray-300">
                                Set sebagai Libur (OFF)
                            </label>
                        </div>

                        {!editForm.isOffDay && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Pilih Shift
                                </label>
                                <select
                                    className="w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 focus:border-primary-500 focus:ring-primary-500"
                                    value={editForm.shiftId}
                                    onChange={(e) => setEditForm({ ...editForm, shiftId: e.target.value })}
                                    required={!editForm.isOffDay}
                                >
                                    <option value="">Pilih Shift</option>
                                    {allShifts.map(s => (
                                        <option key={s.id} value={s.id}>
                                            {s.name} ({s.startTime} - {s.endTime})
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}
                    </div>

                    <div className="pt-4 flex justify-end gap-3">
                        <Button variant="outline" type="button" onClick={() => setShowEditModal(false)}>
                            Batal
                        </Button>
                        <Button type="submit" loading={updateLoading}>
                            Simpan Perubahan
                        </Button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default ScheduleCalendar;
