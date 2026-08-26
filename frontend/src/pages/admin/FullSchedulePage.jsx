import { useState, useEffect, useMemo } from 'react';
import rotationService from '../../services/rotationService';
import BackupPanel from '../../components/admin/BackupPanel';

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
  if (!schedule || !schedule.schedules?.length) return { working: [], offDay: [], deployedElsewhere: [] };
  const all = schedule.schedules
    .filter(s => s.shiftNumber === shiftNum)
    .map(s => ({ name: s.user?.fullName || `User #${s.userId}`, userId: s.userId }));
  const deployedMap = new Map();
  backupsOnDay.forEach(b => {
    if (b.backupUserId && b.absentPositionId !== currentPositionId)
      deployedMap.set(b.backupUserId, b.absentPosition?.name || `Posisi #${b.absentPositionId}`);
  });
  const offDay            = all.filter(u => offDaySet.has(`${u.userId}_${dateISO}`));
  const deployedElsewhere = all
    .filter(u => !offDaySet.has(`${u.userId}_${dateISO}`) && deployedMap.has(u.userId))
    .map(u => ({ ...u, targetPositionName: deployedMap.get(u.userId) }));
  const working           = all.filter(u => !offDaySet.has(`${u.userId}_${dateISO}`) && !deployedMap.has(u.userId));
  return { working, offDay, deployedElsewhere };
}
export default function FullSchedulePage() {
  const [viewMode, setViewMode] = useState('week');
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
      setError(err?.response?.data?.message || 'Gagal memuat jadwal');
    } finally { setLoading(false); }
  };

  const fetchMonth = async () => {
    setLoading(true); setError(null);
    try {
      const res = await rotationService.getAllSchedulesMonth(monthView);
      setMonthData(res.data.data || null);
    } catch (err) {
      setError(err?.response?.data?.message || 'Gagal memuat jadwal bulanan');
    } finally { setLoading(false); }
  };

  const fetchOffDays = async (mon) => {
    try {
      const res = await rotationService.getManualOffDaysMonth(mon);
      const raw = res.data?.data || [];
      const set = new Set();
      raw.forEach(item => set.add(`${item.userId}_${new Date(item.date).toISOString().split('T')[0]}`));
      setOffDaySet(set);
    } catch { setOffDaySet(new Set()); }
  };

  const fetchBackupsForDates = async (dates) => {
    try {
      const results = await Promise.allSettled(dates.map(d => rotationService.listBackups(d)));
      setBackupsByDate(prev => {
        const map = new Map(prev);
        results.forEach((r, i) => { if (r.status === 'fulfilled') map.set(dates[i], r.value?.data?.data || []); });
        return map;
      });
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
      isToday: dateISO === new Date().toISOString().split('T')[0],
    };
  });

  const weekDates    = getWeekDates(weekStart);
  const dateLabels   = makeDateLabels(weekStart);
  const allPositions = viewMode === 'week'
    ? data.map(d => d.position).filter(Boolean)
    : (monthData?.weeks?.[0]?.positions || []).map(p => p.position).filter(Boolean);

  const openBackupPanel = (dateISO) => { setBackupDate(dateISO); setShowBackupPanel(true); };
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
                    <th key={dl.date} className={`px-3 py-2 text-left whitespace-nowrap ${dl.isToday ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' : '}`}>{dl.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[1, 2].map(shiftNum => (
                  <tr key={shiftNum} className="border-t border-gray-100 dark:border-gray-700">
                    <td className={`px-3 py-2 font-medium whitespace-nowrap text-sm ${shiftNum === 1 ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300' : 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'}`}>Shift {shiftNum}</td>
                    {dLabels.map(dl => {
                      const backupsOnDay = backupsByDate.get(dl.date) || [];
                      const { working, offDay, deployedElsewhere } = getUsersOnDayWithOffDay(schedule, dl.date, shiftNum, offDaySet, backupsOnDay, position.id);
                      return (
                        <td key={dl.date} className={`px-3 py-2 align-top ${dl.isToday ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}`}>
                          {working.length > 0 && <ul className="space-y-0.5 mb-1">{working.map((u,i) => <li key={i} className="whitespace-nowrap text-gray-600 dark:text-gray-300">{u.name}</li>)}</ul>}
                          {deployedElsewhere.length > 0 && <ul className="space-y-0.5 mb-1">{deployedElsewhere.map((u,i) => <li key={i} className="whitespace-nowrap text-purple-500 dark:text-purple-400 text-xs">&#128256; <span className="line-through">{u.name}</span> &rarr; {u.targetPositionName}</li>)}</ul>}
                          {offDay.length > 0 && <ul className="space-y-0.5">{offDay.map((u,i) => <li key={i} className="whitespace-nowrap text-orange-500 dark:text-orange-400 text-xs line-through">&#127958; {u.name}</li>)}</ul>}
                          {working.length === 0 && offDay.length === 0 && deployedElsewhere.length === 0 && <span className="text-gray-400 text-xs">&mdash;</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {wDates.some(dateISO => (schedule.schedules || []).some(s => offDaySet.has(`${s.userId}_${dateISO}`))) && (
                  <tr className="border-t border-orange-100 dark:border-orange-900/30 bg-orange-50/30 dark:bg-orange-900/10">
                    <td className="px-3 py-2 font-medium text-orange-600 dark:text-orange-400 whitespace-nowrap text-xs">&#127958; Libur</td>
                    {dLabels.map(dl => {
                      const offUsers = (schedule.schedules || []).filter(s => offDaySet.has(`${s.userId}_${dl.date}`)).map(s => s.user?.fullName || `User #${s.userId}`);
                      return (
                        <td key={dl.date} className={`px-3 py-2 text-xs ${dl.isToday ? 'bg-blue-50/30 dark:bg-blue-900/5' : ''}`}>
                          {offUsers.length > 0 ? <ul className="space-y-0.5">{offUsers.map((n,i) => <li key={i} className="text-orange-600 dark:text-orange-400 whitespace-nowrap">{n}</li>)}</ul> : <span className="text-gray-300 dark:text-gray-700">&mdash;</span>}
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
                {posSchedules.map(({ position, schedule }) => renderPositionTable(position, schedule, ws))}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="p-4 md:p-6 max-w-full">
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
    </div>
  );
}
