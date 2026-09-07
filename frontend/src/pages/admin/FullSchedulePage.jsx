import { useState, useEffect, useMemo, useRef } from 'react';
import html2canvas from 'html2canvas';
import { Clock, Calendar, ChefHat, User, Check, X, Edit2, AlertCircle } from 'lucide-react';
import rotationService from '../../services/rotationService';
import { getAllShifts } from '../../services/shiftService';
import { updateUserScheduleCell } from '../../services/scheduleService';
import BackupPanel from '../../components/admin/BackupPanel';
import Modal from '../../components/shared/Modal';
import Button from '../../components/shared/Button';
import { showSuccess, showError } from '../../hooks/useToast';

function LoadingSpinner() {
  return (
    <div className="flex justify-center items-center py-16">
      <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function getMondayISO(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().split('T')[0];
}

function toISO(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getWeekDates(ws) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(`${ws}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    return toISO(d);
  });
}

function getMondaysInMonth(mon) {
  const [year, m] = mon.split('-').map(Number);
  const mondays = [];
  const lastDay = new Date(Date.UTC(year, m, 0));
  const cursor = new Date(Date.UTC(year, m - 1, 1));
  const dow = cursor.getUTCDay();
  cursor.setUTCDate(cursor.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
  while (cursor <= lastDay) {
    mondays.push(toISO(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }
  return mondays;
}

function getUsersOnDayWithOffDay(schedule, dateISO, shiftNum, offDaySet, backupsOnDay = [], currentPositionId = null) {
  if (!schedule || !schedule.schedules?.length) return { working: [], offDay: [], deployedElsewhere: [], movedToOtherShift: [], absent: [] };
  
  const all = [];
  for (const s of schedule.schedules) {
    if (s.isBackupOnly) continue;

    const userSched = s.userSchedulesByDate?.[dateISO];
    const isOff = offDaySet.has(`${s.userId}_${dateISO}`) || Boolean(userSched?.isOffDay);

    // Effective shift for this day (prioritize manual override from userSchedule)
    let effectiveShift = s.shiftNumber;
    if (userSched?.shiftNumber != null) {
      effectiveShift = userSched.shiftNumber;
    }

    if (effectiveShift === shiftNum) {
      all.push({
        ...s,
        name: s.user?.fullName || `User #${s.userId}`,
        userId: s.userId,
        // Jobdesk hari ini (rotasi harian atau manual override). null jika posisi tidak punya jobdesk.
        jobdesk: userSched?.kitchenStation || s.jobdesksByDate?.[dateISO] || null,
        // Info tukar shift (swap APPROVED) di tanggal ini, jika ada
        swapInfo: s.swapsByDate?.[dateISO] || null,
        _isOff: isOff,
      });
    }
  }

  const deployedMap = new Map();
  // Peta user yang dipindah ke SHIFT LAIN di posisi yang sama
  // (backup yang absentPositionId-nya = posisi ini). shiftNumber pada backup
  // menunjukkan shift TUJUAN. Jika baris ini shift 1 dan backup.shiftNumber = 2,
  // berarti user dipindahkan Shift 1 → Shift 2, sehingga baris Shift 1 juga
  // harus diberi tanda (bukan hanya baris Backup).
  const movedShiftMap = new Map();
  backupsOnDay.forEach(b => {
    if (!b.backupUserId) return;
    if (b.absentPositionId !== currentPositionId) {
      deployedMap.set(b.backupUserId, b.absentPosition?.name || `Posisi #${b.absentPositionId}`);
    } else {
      const targetShift = b.shiftNumber || null;
      if (targetShift && targetShift !== shiftNum) movedShiftMap.set(b.backupUserId, targetShift);
    }
  });
  // Karyawan yang absen hari ini dan digantikan oleh backup
  // (absentPositionId = posisi ini → posisi asal karyawan tersebut).
  const absentMap = new Map();
  backupsOnDay.forEach(b => {
    if (b.absentUserId && b.absentPositionId === currentPositionId)
      absentMap.set(b.absentUserId, b.backupUser?.fullName || (b.backupUserId ? `#${b.backupUserId}` : null));
  });
  const offDay            = all.filter(u => u._isOff);
  const deployedElsewhere = all
    .filter(u => !u._isOff && deployedMap.has(u.userId))
    .map(u => ({ ...u, targetPositionName: deployedMap.get(u.userId) }));
  const movedToOtherShift = all
    .filter(u => !u._isOff && movedShiftMap.has(u.userId))
    .map(u => ({ ...u, targetShift: movedShiftMap.get(u.userId) }));
  const absent            = all
    .filter(u => !u._isOff && absentMap.has(u.userId))
    .map(u => ({ ...u, backupName: absentMap.get(u.userId) }));
  const working           = all.filter(u => !u._isOff && !deployedMap.has(u.userId) && !movedShiftMap.has(u.userId) && !absentMap.has(u.userId));
  return { working, offDay, deployedElsewhere, movedToOtherShift, absent };
}
export default function FullSchedulePage() {
  const [viewMode, setViewMode] = useState('week');
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);
  const exportRef = useRef(null);
  const [weekStart, setWeekStart] = useState(() => getMondayISO(new Date().toISOString().split('T')[0]));
  const [monthView, setMonthView] = useState(() => {
    const t = new Date();
    return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`;
  });
  const [data, setData]               = useState([]);
  const [monthData, setMonthData]     = useState(null);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState(null);
  const [offDaySet, setOffDaySet]     = useState(new Set());
  const [backupsByDate, setBackupsByDate] = useState(new Map());
  const [backupDate, setBackupDate]   = useState(null);
  const [showBackupPanel, setShowBackupPanel] = useState(false);

  // Quick cell edit modal state
  const [allShifts, setAllShifts] = useState([]);
  const [showEditCellModal, setShowEditCellModal] = useState(false);
  const [editCellData, setEditCellData] = useState({
    userId: null,
    userName: '',
    dateISO: '',
    positionId: null,
    positionName: '',
    currentShiftId: null,
    currentJobdesk: '',
    isOff: false,
    temporaryDepartment: '',
    jobdesksList: [],
  });
  const [saveLoading, setSaveLoading] = useState(false);

  useEffect(() => {
    getAllShifts().then(res => {
      setAllShifts(res.data?.shifts || []);
    }).catch(() => {});
  }, []);

  const activeMonth = useMemo(() => {
    if (viewMode === 'month') return monthView;
    const d = new Date(`${weekStart}T00:00:00Z`);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  }, [viewMode, weekStart, monthView]);

  useEffect(() => {
    if (viewMode === 'week') {
      fetchWeek();
      fetchBackupsForDates(getWeekDates(weekStart));
    } else {
      fetchMonth();
      fetchBackupsForDates(getMondaysInMonth(monthView).flatMap(ws => getWeekDates(ws)));
    }
  }, [viewMode, weekStart, monthView]); // eslint-disable-line

  useEffect(() => { fetchOffDays(activeMonth); }, [activeMonth]); // eslint-disable-line

  const fetchWeek = async () => {
    setLoading(true); setError(null);
    try {
      const res = await rotationService.getAllSchedules(weekStart);
      setData(res.data.data || []);
    } catch (err) {
      console.error('[FullSchedule] fetchWeek failed:', err?.response?.status, err?.response?.data || err?.message);
      setError(err?.response?.data?.message || 'Gagal memuat jadwal');
    } finally { setLoading(false); }
  };

  const fetchMonth = async () => {
    setLoading(true); setError(null);
    try {
      const res = await rotationService.getAllSchedulesMonth(monthView);
      setMonthData(res.data.data || null);
    } catch (err) {
      // Log full details so the real cause (401/403/500/network) is visible in the console.
      console.error('[FullSchedule] fetchMonth failed:', err?.response?.status, err?.response?.data || err?.message);
      setError(err?.response?.data?.message || 'Gagal memuat jadwal bulanan');
    } finally { setLoading(false); }
  };

  const fetchOffDays = async (mon) => {
    try {
      // Pakai union SEMUA sumber libur (cuti, tukar libur, libur mingguan,
      // libur nasional, manual) agar konsisten dengan logika generate jadwal.
      const res = await rotationService.getAllOffDaysMonth(mon);
      const raw = res.data?.data || [];
      const set = new Set();
      raw.forEach(item => set.add(`${item.userId}_${String(item.date).slice(0, 10)}`));
      setOffDaySet(set);
    } catch {
      // Fallback: kalau endpoint union gagal, pakai manual off-day saja.
      try {
        const res = await rotationService.getManualOffDaysMonth(mon);
        const raw = res.data?.data || [];
        const set = new Set();
        raw.forEach(item => set.add(`${item.userId}_${String(item.date).slice(0, 10)}`));
        setOffDaySet(set);
      } catch { setOffDaySet(new Set()); }
    }
  };

  // Batch requests to avoid flooding the backend / exhausting the DB connection pool.
  // In month mode this can be ~28-31 dates; firing them all at once (Promise.all)
  // can trigger "Too many connections" / timeouts. Run them in small chunks.
  const fetchBackupsForDates = async (dates, chunkSize = 5) => {
    try {
      const map = new Map();
      for (let i = 0; i < dates.length; i += chunkSize) {
        const chunk = dates.slice(i, i + chunkSize);
        const results = await Promise.allSettled(chunk.map(d => rotationService.listBackups(d)));
        results.forEach((r, j) => { if (r.status === 'fulfilled') map.set(chunk[j], r.value?.data?.data || []); });
      }
      setBackupsByDate(prev => new Map([...prev, ...map]));
    } catch { /* non-critical */ }
  };

  const prevWeek  = () => { const d = new Date(`${weekStart}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 7); setWeekStart(toISO(d)); };
  const nextWeek  = () => { const d = new Date(`${weekStart}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 7); setWeekStart(toISO(d)); };
  const prevMonth = () => { const [y, m] = monthView.split('-').map(Number); const d = new Date(Date.UTC(y, m - 2, 1)); setMonthView(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`); };
  const nextMonth = () => { const [y, m] = monthView.split('-').map(Number); const d = new Date(Date.UTC(y, m, 1));     setMonthView(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`); };

  const makeDateLabels = (ws) => getWeekDates(ws).map(dateISO => {
    const d = new Date(`${dateISO}T00:00:00Z`);
    return {
      date: dateISO,
      label: d.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }),
      isToday: dateISO === (() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`; })(),
    };
  });

  const weekDates    = getWeekDates(weekStart);
  const dateLabels   = makeDateLabels(weekStart);
  const allPositions = viewMode === 'week'
    ? data.map(d => d.position).filter(Boolean)
    : (monthData?.weeks?.[0]?.positions || []).map(p => p.position).filter(Boolean);

  const handleCellClick = (userObj, dateISO, position, defaultShiftNum) => {
    const userSched = userObj.userSchedulesByDate?.[dateISO];
    const isCurrentlyOff = offDaySet.has(`${userObj.userId}_${dateISO}`) || userSched?.isOffDay;
    
    // Pick active shift: user override shiftId -> shift matching defaultShiftNum -> default fallback
    let foundShiftId = userSched?.shiftId;
    if (!foundShiftId && defaultShiftNum && allShifts.length > 0) {
      const match = allShifts.find(s => s.name.includes(String(defaultShiftNum)));
      if (match) foundShiftId = match.id;
    }
    if (!foundShiftId && allShifts.length > 0) {
      foundShiftId = allShifts[0].id;
    }

    setEditCellData({
      userId: userObj.userId,
      userName: userObj.user?.fullName || `User #${userObj.userId}`,
      dateISO,
      positionId: position.id,
      positionName: position.name,
      currentShiftId: foundShiftId || '',
      currentJobdesk: userObj.jobdesksByDate?.[dateISO] || '',
      isOff: Boolean(isCurrentlyOff),
      temporaryDepartment: userSched?.temporaryDepartment || '',
      jobdesksList: position.jobdesks || [],
    });
    setShowEditCellModal(true);
  };

  const handleSaveCell = async (e) => {
    e.preventDefault();
    setSaveLoading(true);
    try {
      await updateUserScheduleCell({
        userId: editCellData.userId,
        date: editCellData.dateISO,
        shiftId: editCellData.isOff ? null : (editCellData.currentShiftId ? parseInt(editCellData.currentShiftId) : null),
        isOffDay: editCellData.isOff,
        kitchenStation: editCellData.isOff ? null : (editCellData.currentJobdesk || null),
        temporaryDepartment: editCellData.temporaryDepartment || null,
      });

      showSuccess(`Jadwal ${editCellData.userName} tanggal ${editCellData.dateISO} berhasil diperbarui`);
      setShowEditCellModal(false);

      // Refresh schedule views
      if (viewMode === 'week') fetchWeek(); else fetchMonth();
      fetchOffDays(activeMonth);
    } catch (err) {
      console.error('[FullSchedule] Save cell failed:', err);
      showError(err?.response?.data?.message || 'Gagal menyimpan perubahan jadwal');
    } finally {
      setSaveLoading(false);
    }
  };
  // Backup bar
  const BackupBar = ({ ws }) => (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-3 mb-4 overflow-x-auto">
      <div className="flex gap-2 min-w-max">
        <div className="w-28 flex-shrink-0 text-xs font-semibold text-gray-500 dark:text-gray-400 flex items-center">Kelola Backup</div>
        {makeDateLabels(ws).map(dl => {
          const dateBackups = backupsByDate.get(dl.date) || [];
          const hasBackup = dateBackups.length > 0;
          return (
            <button key={dl.date} onClick={() => openBackupPanel(dl.date)}
              className={`flex-1 min-w-[90px] text-xs px-2 py-1.5 rounded-lg border transition-colors ${
                dl.isToday ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-semibold'
                : hasBackup ? 'border-green-400 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                : 'border-gray-200 dark:border-gray-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-gray-600 dark:text-gray-300'}`}>
              <div>{dl.label}</div>
              {hasBackup
                ? <div className="text-green-600 dark:text-green-400 mt-0.5 font-semibold">&#10003; {dateBackups.length} backup</div>
                : <div className="text-blue-500 mt-0.5">+ Backup</div>}
            </button>
          );
        })}
      </div>
    </div>
  );

  const renderPositionTable = (position, schedule, ws) => {
    const wDates  = getWeekDates(ws);
    const dLabels = makeDateLabels(ws);
    return (
      <div key={`${position.id}-${ws}`} className="bg-white dark:bg-gray-800 rounded-xl shadow overflow-hidden">
        <div className="px-4 py-3 bg-blue-600 text-white flex items-center justify-between">
          <h2 className="font-semibold text-base">{position.name}</h2>
          <span className="text-xs opacity-80">Shift 1: {position.shift1Capacity} orang &middot; Shift 2: {position.shift2Capacity} orang</span>
        </div>
        {!schedule || !schedule.schedules?.length ? (
          <div className="px-4 py-6 text-center text-gray-400 text-sm">
            Jadwal belum di-generate untuk minggu ini.{' '}
            <a href="/admin/rotation" className="text-blue-500 hover:underline">Generate di Posisi &amp; Rotasi</a>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                  <th className="px-3 py-2 text-left w-24">Shift</th>
                  {dLabels.map(dl => (
                    <th key={dl.date} className={`px-3 py-2 text-left whitespace-nowrap ${dl.isToday ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' : ''}`}>{dl.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[1, 2].map(shiftNum => (
                  <tr key={shiftNum} className="border-t border-gray-100 dark:border-gray-700">
                    <td className={`px-3 py-2 font-medium whitespace-nowrap text-sm ${shiftNum === 1 ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300' : 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'}`}>Shift {shiftNum}</td>
                    {dLabels.map(dl => {
                      const backupsOnDay = backupsByDate.get(dl.date) || [];
                      const { working, offDay, deployedElsewhere, movedToOtherShift, absent } = getUsersOnDayWithOffDay(schedule, dl.date, shiftNum, offDaySet, backupsOnDay, position.id);
                      return (
                        <td key={dl.date} className={`px-3 py-2 align-top ${dl.isToday ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}`}>
                          {working.length > 0 && <ul className="space-y-0.5 mb-1">{working.map((u,i) => (
                            <li key={i}
                              onClick={() => handleCellClick(u, dl.date, position, shiftNum)}
                              className="whitespace-nowrap text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 cursor-pointer rounded px-1 -mx-1 transition-colors flex items-center justify-between group/cell"
                              title="Klik untuk edit jadwal/stasiun ini"
                            >
                              <span>
                                {u.name}
                                {u.jobdesk && <span className="ml-1 inline-block px-1 py-px rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-[10px] font-medium align-middle">{u.jobdesk}</span>}
                                {u.swapInfo && (
                                  <span className="ml-1 inline-flex items-center gap-0.5 px-1 py-px rounded bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 text-[10px] font-medium align-middle">
                                    ⇄ {u.swapInfo.withUserName}
                                  </span>
                                )}
                              </span>
                              <Edit2 className="w-3 h-3 opacity-0 group-hover/cell:opacity-100 text-blue-500 ml-1 flex-shrink-0" />
                            </li>
                          ))}</ul>}
                          {movedToOtherShift.length > 0 && <ul className="space-y-0.5 mb-1">{movedToOtherShift.map((u,i) => (
                            <li key={i} className="whitespace-nowrap text-xs">
                              <span className="text-red-500 dark:text-red-400 line-through">{u.name}</span>
                              <span className="text-gray-400 mx-1">&rarr;</span>
                              <span className="inline-block px-1 py-px rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-medium">Shift {u.targetShift}</span>
                            </li>
                          ))}</ul>}
                          {deployedElsewhere.length > 0 && <ul className="space-y-0.5 mb-1">{deployedElsewhere.map((u,i) => <li key={i} className="whitespace-nowrap text-purple-500 dark:text-purple-400 text-xs">&#128256; <span className="line-through">{u.name}</span> &rarr; {u.targetPositionName}</li>)}</ul>}
                          {absent.length > 0 && <ul className="space-y-0.5 mb-1">{absent.map((u,i) => (
                            <li key={i} className="whitespace-nowrap text-xs">
                              <span className="text-red-500 dark:text-red-400 line-through">{u.name}</span>
                              {u.backupName && (<><span className="text-gray-400 mx-1">&rarr;</span><span className="text-green-700 dark:text-green-400 font-medium">{u.backupName}</span></>)}
                            </li>
                          ))}</ul>}
                          {offDay.length > 0 && <ul className="space-y-0.5">{offDay.map((u,i) => (
                            <li key={i}
                              onClick={() => handleCellClick(u, dl.date, position, shiftNum)}
                              className="whitespace-nowrap text-orange-500 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 hover:bg-orange-100/50 dark:hover:bg-orange-900/30 cursor-pointer rounded px-1 -mx-1 transition-colors text-xs line-through flex items-center justify-between group/cell"
                              title="Klik untuk ubah jadwal (masuk / tukar shift)"
                            >
                              <span>&#127958; {u.name}</span>
                              <Edit2 className="w-3 h-3 opacity-0 group-hover/cell:opacity-100 text-orange-600 ml-1 flex-shrink-0" />
                            </li>
                          ))}</ul>}
                          {working.length === 0 && offDay.length === 0 && deployedElsewhere.length === 0 && movedToOtherShift.length === 0 && absent.length === 0 && <span className="text-gray-400 text-xs">&mdash;</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {wDates.some(dateISO => (schedule.schedules || []).some(s => offDaySet.has(`${s.userId}_${dateISO}`) || Boolean(s.userSchedulesByDate?.[dateISO]?.isOffDay))) && (
                  <tr className="border-t border-orange-100 dark:border-orange-900/30 bg-orange-50/30 dark:bg-orange-900/10">
                    <td className="px-3 py-2 font-medium text-orange-600 dark:text-orange-400 whitespace-nowrap text-xs">&#127958; Libur</td>
                    {dLabels.map(dl => {
                      const offScheds = (schedule.schedules || []).filter(s => !s.isBackupOnly && (offDaySet.has(`${s.userId}_${dl.date}`) || Boolean(s.userSchedulesByDate?.[dl.date]?.isOffDay)));
                      return (
                        <td key={dl.date} className={`px-3 py-2 text-xs ${dl.isToday ? 'bg-blue-50/30 dark:bg-blue-900/5' : ''}`}>
                          {offScheds.length > 0 ? (
                            <ul className="space-y-0.5">
                              {offScheds.map((s,i) => (
                                <li key={i}
                                  onClick={() => handleCellClick(s, dl.date, position, s.shiftNumber || 1)}
                                  className="whitespace-nowrap text-orange-600 dark:text-orange-400 hover:text-orange-800 dark:hover:text-orange-200 hover:bg-orange-100/60 dark:hover:bg-orange-900/40 cursor-pointer rounded px-1 -mx-1 transition-colors flex items-center justify-between group/libur"
                                  title="Klik untuk ubah jadwal karyawan ini (buka libur / ubah shift)"
                                >
                                  <span>{s.user?.fullName || `User #${s.userId}`}</span>
                                  <Edit2 className="w-3 h-3 opacity-0 group-hover/libur:opacity-100 text-orange-700 ml-1 flex-shrink-0" />
                                </li>
                              ))}
                            </ul>
                          ) : <span className="text-gray-300 dark:text-gray-700">&mdash;</span>}
                        </td>
                      );
                    })}
                  </tr>
                )}
                {wDates.some(dateISO => (backupsByDate.get(dateISO) || []).some(b => b.absentPositionId === position.id || b.backupPositionId === position.id)) && (
                  <tr className="border-t border-purple-100 dark:border-purple-900/30 bg-purple-50/30 dark:bg-purple-900/10">
                    <td className="px-3 py-2 font-medium text-purple-600 dark:text-purple-400 whitespace-nowrap text-xs">&#128256; Backup</td>
                    {dLabels.map(dl => {
                      const dayBackups = (backupsByDate.get(dl.date) || []).filter(b => b.absentPositionId === position.id || b.backupPositionId === position.id);
                      return (
                        <td key={dl.date} className={`px-3 py-2 text-xs align-top ${dl.isToday ? 'bg-blue-50/30 dark:bg-blue-900/5' : ''}`}>
                          {dayBackups.length > 0 ? (
                            <ul className="space-y-1">{dayBackups.map((b,i) => (
                              <li key={i} className="whitespace-nowrap">
                                <span className="text-orange-500 dark:text-orange-400 line-through">{b.absentUser?.fullName || `#${b.absentUserId}`}</span>
                                <span className="text-gray-400 mx-1">&rarr;</span>
                                <span className="text-green-700 dark:text-green-400 font-medium">{b.backupUser?.fullName || `#${b.backupUserId}`}</span>
                                {(() => {
                                  // Jobdesk yang dicover backup: kitchenStation UserSchedule
                                  // (absent/backup) di tanggal itu, fallback jobdesk rotasi.
                                  // userSchedulesByDate.kitchenStation = jobdesk yang ditempelkan
                                  // _assignBackupJobdesk saat backup dibuat.
                                  const rowOf = (uid) => (schedule.schedules || []).find(s => s.userId === uid);
                                  const jd = rowOf(b.absentUserId)?.userSchedulesByDate?.[dl.date]?.kitchenStation
                                    || rowOf(b.backupUserId)?.userSchedulesByDate?.[dl.date]?.kitchenStation
                                    || rowOf(b.absentUserId)?.jobdesksByDate?.[dl.date]
                                    || rowOf(b.backupUserId)?.jobdesksByDate?.[dl.date]
                                    || null;
                                  return jd ? <span className="ml-1 inline-block px-1 py-px rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-[10px] font-medium align-middle">{jd}</span> : null;
                                })()}
                              </li>
                            ))}</ul>
                          ) : <span className="text-gray-300 dark:text-gray-700">&mdash;</span>}
                        </td>
                      );
                    })}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };
  const renderMonthView = () => {
    if (!monthData?.weeks?.length) {
      return (
        <div className="text-center py-16 text-gray-500">
          <p className="text-lg mb-2">Belum ada jadwal untuk bulan ini</p>
          <p className="text-sm">Generate jadwal bulanan di halaman Posisi &amp; Rotasi terlebih dahulu.</p>
        </div>
      );
    }
    return (
      <div className="space-y-10">
        {monthData.weeks.map(({ weekStart: ws, positions: posSchedules }) => {
          const wStart = new Date(`${ws}T00:00:00Z`);
          const wEnd   = new Date(`${ws}T00:00:00Z`);
          wEnd.setUTCDate(wEnd.getUTCDate() + 6);
          const fmt = (d) => d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', timeZone: 'UTC' });
          return (
            <div key={ws}>
              <div className="flex items-center gap-3 mb-3">
                <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
                <span className="text-sm font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap">Minggu {fmt(wStart)} &ndash; {fmt(wEnd)}</span>
                <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
              </div>
              <BackupBar ws={ws} />
              <div className="space-y-4">
                {(Array.isArray(posSchedules) ? posSchedules : []).map(({ position, schedule }) => renderPositionTable(position, schedule, ws))}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // Build a clean, WhatsApp-friendly text of the current schedule.
  // Format: per-posisi, per-hari, dengan sekat yang jelas agar mudah dibaca.
  const buildShareText = () => {
    const fmtDay = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' });
    const fmtShort = (d) => d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', timeZone: 'UTC' });

    const SEP  = '━━━━━━━━━━━━━━';
    const SEP2 = '────────────────';

    // Satu blok posisi untuk satu minggu
    const renderPosition = (position, schedule, ws) => {
      const out = [];
      out.push(`📌 *${position.name.toUpperCase()}*`);
      if (!schedule || !schedule.schedules?.length) {
        out.push('   (belum ada jadwal)');
        return out;
      }
      getWeekDates(ws).forEach((dateISO) => {
        const backups = backupsByDate.get(dateISO) || [];
        const { working: s1, movedToOtherShift: mv1, absent: ab1 } = getUsersOnDayWithOffDay(schedule, dateISO, 1, offDaySet, backups, position.id);
        const { working: s2, movedToOtherShift: mv2, absent: ab2 } = getUsersOnDayWithOffDay(schedule, dateISO, 2, offDaySet, backups, position.id);

        const fmtMove = (u) => `~${u.name}~ → Shift ${u.targetShift}`;
        const fmtAbsent = (u) => `~${u.name}~${u.backupName ? ` → ${u.backupName}` : ''}`;
        const fmtWork = (u) => u.jobdesk ? `${u.name} (${u.jobdesk})` : u.name;

        const s1Names = [...s1.map(fmtWork), ...mv1.map(fmtMove), ...ab1.map(fmtAbsent)];
        const s2Names = [...s2.map(fmtWork), ...mv2.map(fmtMove), ...ab2.map(fmtAbsent)];

        out.push(`*${fmtDay(dateISO)}*`);
        out.push(`• Shift 1: ${s1Names.length ? s1Names.join(', ') : '—'}`);
        out.push(`• Shift 2: ${s2Names.length ? s2Names.join(', ') : '—'}`);
      });
      // Info libur minggu ini (gabungan semua hari)
      const offNames = new Map(); // name -> [tgl]
      getWeekDates(ws).forEach((dateISO) => {
        [1, 2].forEach((shiftNum) => {
          const { offDay } = getUsersOnDayWithOffDay(schedule, dateISO, shiftNum, offDaySet, backupsByDate.get(dateISO) || [], position.id);
          offDay.forEach((u) => {
            if (!offNames.has(u.name)) offNames.set(u.name, []);
            offNames.get(u.name).push(new Date(`${dateISO}T00:00:00Z`).getUTCDate());
          });
        });
      });
      if (offNames.size) {
        const txt = [...offNames.entries()].map(([n, tgl]) => `${n} (tgl ${[...new Set(tgl)].sort((a,b)=>a-b).join(', ')})`).join(', ');
        out.push(`🏖️ Libur: ${txt}`);
      }
      return out;
    };

    const lines = [];
    if (viewMode === 'week') {
      const ws = weekStart;
      const wEnd = new Date(`${ws}T00:00:00Z`); wEnd.setUTCDate(wEnd.getUTCDate() + 6);
      lines.push(`🗓️ *JADWAL MINGGUAN*`);
      lines.push(`${fmtShort(new Date(`${ws}T00:00:00Z`))} – ${fmtShort(wEnd)}`);
      lines.push(SEP);
      lines.push('');
      data.forEach(({ position, schedule }, i) => {
        lines.push(...renderPosition(position, schedule, ws));
        if (i < data.length - 1) lines.push('', SEP2, '');
      });
    } else {
      lines.push(`🗓️ *JADWAL BULANAN*`);
      lines.push(`Bulan ${new Date(`${monthView}-01T00:00:00Z`).toLocaleDateString('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' })}`);
      lines.push(SEP);
      lines.push('');
      monthData?.weeks?.forEach(({ weekStart: ws, positions: posSchedules }, wi) => {
        const wStart = new Date(`${ws}T00:00:00Z`);
        const wEnd = new Date(`${ws}T00:00:00Z`); wEnd.setUTCDate(wEnd.getUTCDate() + 6);
        if (wi > 0) lines.push(SEP, '');
        lines.push(`🗓️ *MINGGU ${fmtShort(wStart)} – ${fmtShort(wEnd)}*`);
        lines.push('');
        posSchedules.forEach(({ position, schedule }, i) => {
          lines.push(...renderPosition(position, schedule, ws));
          if (i < posSchedules.length - 1) lines.push('', SEP2, '');
        });
        lines.push('');
      });
    }
    lines.push(SEP);
    lines.push('_Dicetak dari Absensi Cafe_');
    return lines.join('\n');
  };

  const handleCopyShare = async () => {
    try {
      const text = buildShareText();
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert('Gagal menyalin. Browser mungkin memblokir akses clipboard.');
    }
  };

  // Download jadwal sebagai gambar PNG kualitas HD (2x scale), seluruh konten
  // dirender tanpa terpotong dan dipaksa mode terang agar mudah dibaca.
  const handleDownloadImage = async () => {
    if (exporting) return;
    const el = exportRef.current;
    if (!el) return;
    setExporting(true);
    const root = document.documentElement;
    const hadDark = root.classList.contains('dark');
    try {
      // Paksa mode terang selama proses capture
      if (hadDark) root.classList.remove('dark');
      // Tunggu 2 frame agar React/browser sempat me-render ulang tanpa dark class
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

      const canvas = await html2canvas(el, {
        scale: 2, // HD 2x
        useCORS: true,
        backgroundColor: '#ffffff',
        windowWidth: el.scrollWidth,
        width: el.scrollWidth,
        height: el.scrollHeight,
        scrollX: 0,
        scrollY: -window.scrollY,
      });

      const filename = viewMode === 'week'
        ? `jadwal-minggu-${weekStart}.png`
        : `jadwal-bulan-${monthView}.png`;

      await new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (!blob) return reject(new Error('Gagal membuat gambar'));
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 5000);
          resolve();
        }, 'image/png');
      });
    } catch (err) {
      console.error('[FullSchedule] export image failed:', err);
      alert('Gagal membuat gambar jadwal. Coba lagi.');
    } finally {
      if (hadDark) root.classList.add('dark');
      setExporting(false);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-full min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Jadwal Lengkap Semua Posisi</h1>
        <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
          {['week', 'month'].map(mode => (
            <button key={mode} onClick={() => setViewMode(mode)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                viewMode === mode ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>
              {mode === 'week' ? 'Mingguan' : 'Bulanan'}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 mb-2 print:hidden">
        <button onClick={handleCopyShare}
          className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium shadow-sm transition-colors">
          {copied ? '✓ Tersalin!' : '📋 Salin Teks (Bagikan)'}
        </button>
        <button onClick={() => window.print()}
          className="px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 text-sm font-medium transition-colors">
          🖨️ Cetak / Simpan PDF
        </button>
        <button onClick={handleDownloadImage} disabled={exporting || loading}
          className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium shadow-sm transition-colors">
          {exporting ? '⏳ Membuat gambar...' : '🖼️ Download Gambar HD'}
        </button>
      </div>
      <div className="flex items-center gap-2 mb-6">
        {viewMode === 'week' ? (
          <>
            <button onClick={prevWeek} className="px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 text-sm">&larr; Minggu Lalu</button>
            <input type="date" value={weekStart} onChange={e => setWeekStart(getMondayISO(e.target.value))} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100" />
            <button onClick={nextWeek} className="px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 text-sm">Minggu Depan &rarr;</button>
          </>
        ) : (
          <>
            <button onClick={prevMonth} className="px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 text-sm">&larr; Bulan Lalu</button>
            <input type="month" value={monthView} onChange={e => setMonthView(e.target.value)} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100" />
            <button onClick={nextMonth} className="px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 text-sm">Bulan Depan &rarr;</button>
          </>
        )}
      </div>
      <div ref={exportRef} className="bg-gray-50 dark:bg-transparent p-1 rounded-lg">
        {viewMode === 'week' && !loading && data.length > 0 && <BackupBar ws={weekStart} />}
        {error && <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-300 rounded-lg p-4 mb-4 text-sm">{error}</div>}
        {loading ? (
          <LoadingSpinner />
        ) : viewMode === 'week' ? (
          data.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              <p className="text-lg mb-2">Belum ada posisi yang dibuat</p>
              <p className="text-sm">Buat posisi di halaman Posisi &amp; Rotasi terlebih dahulu.</p>
            </div>
          ) : (
            <div className="space-y-8">{data.map(({ position, schedule }) => renderPositionTable(position, schedule, weekStart))}</div>
          )
        ) : (
          renderMonthView()
        )}
      </div>
      {showBackupPanel && backupDate && (
        <BackupPanel
          date={backupDate}
          positions={allPositions}
          onClose={() => {
            setShowBackupPanel(false);
            setBackupDate(null);
            const dates = viewMode === 'week'
              ? getWeekDates(weekStart)
              : getMondaysInMonth(monthView).flatMap(ws => getWeekDates(ws));
            fetchBackupsForDates(dates);
          }}
        />
      )}

      {/* Modal Quick Edit Cell Schedule */}
      <Modal
        isOpen={showEditCellModal}
        onClose={() => setShowEditCellModal(false)}
        title={`Edit Jadwal & Stasiun (${editCellData.positionName})`}
      >
        <form onSubmit={handleSaveCell} className="space-y-4">
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-sm">
            <div className="font-semibold text-blue-900 dark:text-blue-200">{editCellData.userName}</div>
            <div className="text-blue-700 dark:text-blue-300 text-xs mt-0.5">
              Tanggal: <span className="font-mono font-medium">{editCellData.dateISO}</span> &middot; Posisi: <span className="font-medium">{editCellData.positionName}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isOffCell"
              checked={editCellData.isOff}
              onChange={(e) => setEditCellData({ ...editCellData, isOff: e.target.checked })}
              className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 h-4 w-4"
            />
            <label htmlFor="isOffCell" className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
              Set status Libur (OFF) pada tanggal ini
            </label>
          </div>

          {!editCellData.isOff && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Pilih Shift Jam Kerja
                </label>
                <select
                  value={editCellData.currentShiftId}
                  onChange={(e) => setEditCellData({ ...editCellData, currentShiftId: e.target.value })}
                  className="w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 focus:border-blue-500 focus:ring-blue-500 text-sm"
                  required
                >
                  <option value="">-- Pilih Shift --</option>
                  {allShifts.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.startTime} - {s.endTime})
                    </option>
                  ))}
                </select>
              </div>

              {editCellData.jobdesksList.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Jobdesk / Stasiun Kerja <span className="text-gray-400 font-normal">(opsional)</span>
                  </label>
                  <select
                    value={editCellData.currentJobdesk}
                    onChange={(e) => setEditCellData({ ...editCellData, currentJobdesk: e.target.value })}
                    className="w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 focus:border-blue-500 focus:ring-blue-500 text-sm"
                  >
                    <option value="">-- Tidak Ada --</option>
                    {editCellData.jobdesksList.map((jd) => (
                      <option key={jd.id || jd.name} value={jd.name}>
                        {jd.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </>
          )}

          <div className="border-t border-dashed border-amber-300 dark:border-amber-700 pt-3">
            <label className="block text-sm font-medium text-amber-700 dark:text-amber-400 mb-1">
              🔄 Penugasan Departemen Sementara (Cross-dept)
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
              Hanya berlaku 1 hari ini. Departemen asli karyawan tetap tidak berubah.
            </p>
            <select
              value={editCellData.temporaryDepartment}
              onChange={(e) => setEditCellData({ ...editCellData, temporaryDepartment: e.target.value })}
              className="w-full rounded-md border-amber-300 dark:border-amber-700 focus:border-amber-500 focus:ring-amber-500 bg-amber-50 dark:bg-gray-700 text-sm"
            >
              <option value="">-- Gunakan Dept Asli Karyawan --</option>
              <option value="BAR">BAR</option>
              <option value="KITCHEN">KITCHEN</option>
            </select>
          </div>

          <div className="pt-4 flex justify-end gap-2 border-t border-gray-200 dark:border-gray-700">
            <Button variant="outline" type="button" onClick={() => setShowEditCellModal(false)}>
              Batal
            </Button>
            <Button type="submit" loading={saveLoading}>
              Simpan Perubahan
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
