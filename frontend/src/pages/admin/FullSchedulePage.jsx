import { useState, useEffect, useMemo, useRef } from 'react';
import html2canvas from 'html2canvas';
import { Clock, Calendar, ChefHat, User, Check, X, Edit2, AlertCircle, AlertTriangle, Layers, Trash2 } from 'lucide-react';
import rotationService from '../../services/rotationService';
import { getAllShifts } from '../../services/shiftService';
import { updateUserScheduleCell, bulkUpdateUserScheduleCells } from '../../services/scheduleService';
import { getUsers } from '../../services/adminService';
import BackupPanel from '../../components/admin/BackupPanel';
import JobdeskFairnessPanel from '../../components/admin/JobdeskFairnessPanel';
import JobdeskEmployeeSummaryPanel from '../../components/admin/JobdeskEmployeeSummaryPanel';
import EmployeeShiftEditor from '../../components/admin/EmployeeShiftEditor';
import Modal from '../../components/shared/Modal';
import Button from '../../components/shared/Button';
import { showSuccess, showError } from '../../hooks/useToast';
import { stationLetterLabel, stationLetterOf } from '../../utils/kitchenStations';

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

/**
 * Kunci antrean draft: `userId|YYYY-MM-DD`.
 *
 * Satu pegawai satu tanggal = SATU entri. Perubahan berikutnya pada sel yang
 * sama menimpa entri lama (bukan menambah duplikat), supaya satu sel tidak
 * pernah terkirim dua kali dengan nilai berbeda saat "Simpan Semua".
 */
function draftKey(userId, dateISO) {
  return `${userId}|${dateISO}`;
}

/**
 * Nomor shift (1, 2, ...) untuk satu shiftId — meniru pemetaan backend
 * (`rotationService`: ambil angka dari nama shift, fallback urutan id).
 *
 * Dibutuhkan agar pratinjau draft bisa memindahkan pegawai ke baris "Shift 1 /
 * Shift 2" yang benar SEBELUM datanya benar-benar disimpan.
 */
function shiftNumberOf(shiftId, shifts) {
  if (shiftId == null || shiftId === '') return null;
  const sorted = [...(shifts || [])].sort((a, b) => a.id - b.id);
  const idx = sorted.findIndex((s) => Number(s.id) === Number(shiftId));
  if (idx === -1) return null;
  const match = String(sorted[idx].name || '').match(/\d+/);
  return match ? parseInt(match[0], 10) : idx + 1;
}

/**
 * Terapkan draft yang BELUM disimpan ke satu objek jadwal (satu posisi, satu
 * minggu) supaya tabel menampilkan pratinjau tanpa reload.
 *
 * Bentuk hasilnya dibuat sama persis dengan respons API — `userSchedulesByDate`
 * + `jobdesksByDate` — sehingga `getUsersOnDayWithOffDay` dan seluruh logika
 * render (termasuk baris "Libur" dan jobdesk backup) ikut tanpa diubah.
 *
 * `isManualOverride` ikut diset saat draft menandai MASUK karena backend juga
 * menyetel flag itu di `upsertSingleSchedule`, termasuk saat membatalkan hari
 * libur manual. Tanpa itu, pratinjau masih menampilkan orangnya libur.
 *
 * Draft milik pegawai yang tidak ada di tabel ini dilewati (tidak ada barisnya)
 * — tetap masuk antrean dan baru terlihat setelah disimpan.
 */
function applyDraftsToSchedule(schedule, drafts) {
  if (!schedule?.schedules?.length || !drafts || drafts.size === 0) return schedule;

  const byUser = new Map();
  drafts.forEach((d) => {
    if (!byUser.has(d.userId)) byUser.set(d.userId, []);
    byUser.get(d.userId).push(d);
  });

  let touched = false;
  const schedules = schedule.schedules.map((row) => {
    const mine = byUser.get(row.userId);
    if (!mine) return row;
    const userSchedulesByDate = { ...(row.userSchedulesByDate || {}) };
    const jobdesksByDate = { ...(row.jobdesksByDate || {}) };
    mine.forEach((d) => {
      const base = userSchedulesByDate[d.date] || {};
      userSchedulesByDate[d.date] = {
        ...base,
        shiftId: d.payload.shiftId ?? null,
        shiftNumber: d.payload.isOffDay ? (base.shiftNumber ?? null) : (d.shiftNumber ?? base.shiftNumber ?? null),
        isOffDay: Boolean(d.payload.isOffDay),
        isManualOverride: d.payload.isOffDay ? Boolean(base.isManualOverride) : true,
        kitchenStation: d.payload.kitchenStation ?? null,
        temporaryDepartment: d.payload.temporaryDepartment ?? null,
      };
      jobdesksByDate[d.date] = d.payload.isOffDay ? null : (d.payload.kitchenStation || null);
    });
    touched = true;
    return { ...row, userSchedulesByDate, jobdesksByDate };
  });

  return touched ? { ...schedule, schedules } : schedule;
}

function getUsersOnDayWithOffDay(schedule, dateISO, shiftNum, offDaySet, backupsOnDay = [], currentPositionId = null) {
  if (!schedule || !schedule.schedules?.length) return { working: [], offDay: [], deployedElsewhere: [], movedToOtherShift: [], absent: [] };
  
  const all = [];
  for (const s of schedule.schedules) {
    if (s.isBackupOnly) continue;

    const userSched = s.userSchedulesByDate?.[dateISO];
    const swapInfo = s.swapsByDate?.[dateISO];
    const hasSwap = Boolean(swapInfo);
    // Jika UserSchedule.isManualOverride=true dan isOffDay=false (KOMPENSASI SAKIT),
    // atau jika user memiliki swap APPROVED (tukar shift/libur),
    // paksa bukan libur jika userSched.isOffDay = false / ada swap aktif yang bekerja.
    const forcedWork = Boolean((userSched?.isManualOverride && !userSched?.isOffDay) || (hasSwap && (!userSched || !userSched.isOffDay)));
    const isOff = !forcedWork && (offDaySet.has(`${s.userId}_${dateISO}`) || Boolean(userSched?.isOffDay));

    // Effective shift for this day (prioritize manual override from userSchedule, then swap target shift)
    let effectiveShift = s.shiftNumber;
    if (userSched?.shiftNumber != null) {
      // Map shift 3 (DB id 3 / shift 2) or custom shift numbers to valid table rows (1 or 2)
      // If userSched has shiftId / shiftNumber, use it; if shiftNumber > 2 or mismatch, fallback to weekly shiftNumber
      effectiveShift = userSched.shiftNumber > 2 ? 2 : userSched.shiftNumber;
    } else if (hasSwap && swapInfo?.withUserId) {
      // Fallback jika userSched belum tersinkron shiftId: gunakan shift lawan swap di roster
      const partnerSched = schedule.schedules.find(p => p.userId === swapInfo.withUserId);
      if (partnerSched?.shiftNumber) {
        effectiveShift = partnerSched.shiftNumber;
      }
    }

    if (effectiveShift === shiftNum) {
      // Cari jobdesk hari ini (dari userSched, rotasi mingguan, atau jika swap ambil dari partner swap jika sendiri null)
      let resolvedJobdesk = userSched?.kitchenStation || s.jobdesksByDate?.[dateISO] || null;
      if (!resolvedJobdesk && hasSwap && swapInfo?.withUserId) {
        const partnerSched = schedule.schedules.find(p => p.userId === swapInfo.withUserId);
        resolvedJobdesk = partnerSched?.userSchedulesByDate?.[dateISO]?.kitchenStation || partnerSched?.jobdesksByDate?.[dateISO] || null;
      }

      all.push({
        ...s,
        name: s.user?.fullName || `User #${s.userId}`,
        userId: s.userId,
        // Jobdesk hari ini (rotasi harian, manual override, atau swap)
        jobdesk: resolvedJobdesk,
        // Info tukar shift (swap APPROVED) di tanggal ini, jika ada
        swapInfo: swapInfo || null,
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
  // Cakupan stasiun dapur A–D per tanggal (source: API coverage, pool sama
  // dengan generator) — dipakai untuk badge "stasiun kosong" di header tanggal.
  const [coverage, setCoverage]       = useState({});
  const [coverageReload, setCoverageReload] = useState(0);
  const [backupsByDate, setBackupsByDate] = useState(new Map());
  const [backupDate, setBackupDate]   = useState(null);
  const [showBackupPanel, setShowBackupPanel] = useState(false);

  // Quick cell edit modal state
  const [allShifts, setAllShifts] = useState([]);
  const [showEditCellModal, setShowEditCellModal] = useState(false);
  // Dipakai dropdown "Pegawai" saat modal dibuka dari sel kosong. Di-fetch saat
  // modal pertama kali dibuka, bukan saat halaman dimuat, supaya tidak menambah
  // beban halaman jadwal.
  const [employees, setEmployees] = useState([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);
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

  // Antrean perubahan (draft) jadwal — admin menumpuk banyak perubahan lalu
  // mengirim semuanya sekaligus lewat tombol "Simpan Semua", bukan langsung
  // tersimpan per sel + reload per perubahan.
  const [drafts, setDrafts] = useState(new Map());   // key "userId|date" → draft
  const [savingAll, setSavingAll] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);

  useEffect(() => {
    getAllShifts().then(res => {
      setAllShifts(res.data?.shifts || []);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!showEditCellModal || editCellData.userId || employees.length) return;
    setEmployeesLoading(true);
    getUsers({ limit: 500, status: 'active', role: 'EMPLOYEE' })
      .then(res => setEmployees(res?.data?.users || []))
      .catch(() => showError('Gagal memuat daftar pegawai'))
      .finally(() => setEmployeesLoading(false));
  }, [showEditCellModal, editCellData.userId, employees.length]);

  const activeMonth = useMemo(() => {
    if (viewMode === 'month') return monthView;
    const d = new Date(`${weekStart}T00:00:00Z`);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  }, [viewMode, weekStart, monthView]);

  /**
   * Rentang tanggal yang sedang tampil — dipakai sebagai nilai awal form
   * "Ubah Shift Pegawai". Mingguan = Senin s/d Minggu, bulanan = tanggal 1 s/d
   * akhir bulan. Dihitung UTC supaya sama dengan grid jadwal.
   */
  const visibleRange = useMemo(() => {
    if (viewMode === 'week') {
      const dates = getWeekDates(weekStart);
      return { start: dates[0], end: dates[dates.length - 1] };
    }
    const [y, m] = monthView.split('-').map(Number);
    if (!y || !m) return { start: '', end: '' };
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return {
      start: `${monthView}-01`,
      end: `${monthView}-${String(lastDay).padStart(2, '0')}`,
    };
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

  /**
   * Cakupan stasiun dapur untuk rentang yang sedang tampil (minggu / bulan).
   * Hanya menampilkan informasi, bukan mengubah jadwal. Dipanggil ulang setelah
   * simpan sel jadwal supaya badge stasiun kosong ikut diperbarui.
   */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!visibleRange.start || !visibleRange.end) return;
      try {
        const res = await rotationService.getKitchenStationCoverage(visibleRange.start, visibleRange.end);
        if (!cancelled) setCoverage(res?.data?.data?.days || {});
      } catch (err) {
        console.error('[FullSchedule] kitchen coverage failed:', err?.response?.data?.message || err?.message);
        if (!cancelled) setCoverage({});
      }
    })();
    return () => { cancelled = true; };
  }, [visibleRange.start, visibleRange.end, coverageReload]); // eslint-disable-line

  /** Tanggal-tanggal terlihat yang punya stasiun dapur kosong. */
  const gapDays = useMemo(() => {
    const out = [];
    if (!visibleRange.start || !visibleRange.end) return out;
    const [sy, sm, sd] = visibleRange.start.split('-').map(Number);
    const [ey, em, ed] = visibleRange.end.split('-').map(Number);
    let cur = new Date(Date.UTC(sy, sm - 1, sd));
    const end = new Date(Date.UTC(ey, em - 1, ed));
    while (cur <= end) {
      const key = cur.toISOString().slice(0, 10);
      const day = coverage[key];
      if (day && Array.isArray(day.missing) && day.missing.length > 0) {
        out.push({ date: key, missing: day.missing });
      }
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    return out;
  }, [coverage, visibleRange.start, visibleRange.end]);

  /**
   * Jadwal yang DIRENDER = data server + pratinjau draft yang belum disimpan.
   * Efeknya admin langsung melihat consequences perubahannya (stasiun baru,
   * pindah baris shift, status libur) tanpa menunggu reload — dan begitu
   * "Simpan Semua" ditekan, tabel kembali ke data server apa adanya.
   */
  const displayData = useMemo(
    () => data.map((row) => ({ ...row, schedule: applyDraftsToSchedule(row.schedule, drafts) })),
    [data, drafts]
  );
  const displayMonthData = useMemo(() => {
    if (!monthData?.weeks?.length) return monthData;
    return {
      ...monthData,
      weeks: monthData.weeks.map((w) => ({
        ...w,
        positions: (w.positions || []).map((p) => ({ ...p, schedule: applyDraftsToSchedule(p.schedule, drafts) })),
      })),
    };
  }, [monthData, drafts]);

  /** Draft aktif untuk satu sel (dipakai untuk menandai sel "belum disimpan"). */
  const draftFor = (userId, dateISO) => drafts.get(draftKey(userId, dateISO));

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

  const openBackupPanel = (date) => {
    setBackupDate(date);
    setShowBackupPanel(true);
  };


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
      // Nilai sebelum diedit — ditampilkan di daftar tinjauan ("A → B").
      prev: {
        shiftId: userSched?.shiftId ?? null,
        isOffDay: Boolean(isCurrentlyOff),
        kitchenStation: userObj.jobdesksByDate?.[dateISO] || null,
        temporaryDepartment: userSched?.temporaryDepartment || null,
      },
    });
    setShowEditCellModal(true);
  };

  /**
   * Buka modal tambah jadwal dari sel KOSONG.
   *
   * Klik pada nama pegawai (`handleCellClick`) selalu tahu shift-nya karena
   * pegawai itu sudah punya baris jadwal. Di sel kosong tidak ada baris apa pun,
   * jadi shift diisi dari jumlah slot posisi: posisi dengan 2 kapasitas (atau
   * tanpa formasi) mengikuti baris "Shift {n}" yang diklik, selebihnya memakai
   * shift default pegawai sesuai formasi rotasi posisi ini.
   */
  const openAddCellModal = (dateISO, position, shiftNum) => {
    const rosterSize = position.rosters?.length || 0;
    const defaultShiftNum = rosterSize === 0 || rosterSize === 2 ? shiftNum : null;
    let foundShiftId = '';

    if (defaultShiftNum && allShifts.length > 0) {
      const match = allShifts.find(s => s.name.includes(String(defaultShiftNum)));
      if (match) foundShiftId = match.id;
    }
    if (!foundShiftId && allShifts.length > 0) foundShiftId = allShifts[0].id;

    setEditCellData({
      userId: null,
      userName: 'Belum dipilih',
      dateISO,
      positionId: position.id,
      positionName: position.name,
      currentShiftId: foundShiftId || '',
      currentJobdesk: '',
      isOff: false,
      temporaryDepartment: '',
      jobdesksList: position.jobdesks || [],
    });
    setShowEditCellModal(true);
  };

  /**
   * Submit modal sel: perubahan TIDAK langsung dikirim ke server, hanya masuk
   * antrean (draft). Tabel sudah menampilkan hasilnya lewat pratinjau
   * (`displayData`), jadi admin bisa lanjut mengubah sel lain tanpa menunggu
   * reload. Seluruh antrean dikirim sekali jalan lewat "Simpan Semua".
   */
  const stageCellChange = (data) => {
    const key = draftKey(data.userId, data.dateISO);
    // `prev` asli dipertahankan bila sel ini sudah pernah masuk antrean,
    // supaya daftar tinjauan tetap menampilkan nilai SEBELUM admin menyentuhnya.
    const prev = drafts.get(key)?.prev || data.prev || null;
    const draft = {
      key,
      userId: Number(data.userId),
      date: data.dateISO,
      userName: data.userName,
      positionName: data.positionName,
      prev,
      shiftNumber: data.isOff ? null : shiftNumberOf(data.currentShiftId, allShifts),
      payload: {
        userId: Number(data.userId),
        date: data.dateISO,
        shiftId: data.isOff ? null : (data.currentShiftId ? parseInt(data.currentShiftId) : null),
        isOffDay: Boolean(data.isOff),
        kitchenStation: data.isOff ? null : (data.currentJobdesk || null),
        temporaryDepartment: data.temporaryDepartment || null,
      },
    };
    setDrafts((prevMap) => {
      const next = new Map(prevMap);
      next.set(key, draft);
      return next;
    });
    setShowEditCellModal(false);
    showSuccess(`${data.userName} · ${data.dateISO} masuk antrean (${drafts.size + 1} belum disimpan)`);
  };

  /**
   * Simpan satu sel LANGSUNG ke server (jalur lama) — dipakai tombol
   * "Simpan Sekarang" di modal untuk admin yang memang cuma mengubah satu hal.
   * Draft sel ini dibuang lebih dulu supaya tidak ikut tersimpan dua kali.
   */
  const saveCellNow = async () => {
    if (!editCellData.userId) { showError('Pilih pegawai terlebih dahulu'); return; }
    const key = draftKey(editCellData.userId, editCellData.dateISO);
    const payload = {
      userId: Number(editCellData.userId),
      date: editCellData.dateISO,
      shiftId: editCellData.isOff ? null : (editCellData.currentShiftId ? parseInt(editCellData.currentShiftId) : null),
      isOffDay: Boolean(editCellData.isOff),
      kitchenStation: editCellData.isOff ? null : (editCellData.currentJobdesk || null),
      temporaryDepartment: editCellData.temporaryDepartment || null,
    };
    setSaveLoading(true);
    try {
      await updateUserScheduleCell(payload);
      setDrafts((prevMap) => {
        if (!prevMap.has(key)) return prevMap;
        const next = new Map(prevMap);
        next.delete(key);
        return next;
      });
      showSuccess(`Jadwal ${editCellData.userName} tanggal ${editCellData.dateISO} berhasil diperbarui`);
      setShowEditCellModal(false);
      await refreshAfterCommit();
    } catch (err) {
      console.error('[FullSchedule] Save cell failed:', err);
      showError(err?.response?.data?.message || 'Gagal menyimpan perubahan jadwal');
    } finally {
      setSaveLoading(false);
    }
  };

  /** Submit form modal sel → masuk antrean (tidak langsung simpan). */
  const handleSaveCell = (e) => {
    e.preventDefault();
    if (!editCellData.userId) { showError('Pilih pegawai terlebih dahulu'); return; }
    stageCellChange(editCellData);
  };

  /** Muat ulang data server SEKALI (jadwal + libur + cakupan stasiun dapur). */
  const refreshAfterCommit = () => {
    if (viewMode === 'week') fetchWeek(); else fetchMonth();
    fetchOffDays(activeMonth);
    setCoverageReload((n) => n + 1);
  };

  /**
   * Kirim seluruh isi antrean dalam SATU request, lalu reload sekali.
   *
   * Sel yang gagal (mis. user tidak ada) TETAP tinggal di antrean supaya admin
   * cukup menekan "Simpan Semua" lagi, tanpa mengulang perubahan yang sudah
   * berhasil tersimpan.
   */
  const commitAllDrafts = async () => {
    const list = [...drafts.values()];
    if (list.length === 0 || savingAll) return;
    setSavingAll(true);
    setShowReviewModal(false);
    try {
      const res = await bulkUpdateUserScheduleCells(list.map((d) => d.payload));
      const failed = res?.data?.failed || [];
      const savedCount = res?.data?.saved ?? (list.length - failed.length);
      if (failed.length > 0) {
        const failedKeys = new Set(failed.map((f) => draftKey(f.userId, f.date)));
        setDrafts((prevMap) => {
          const next = new Map();
          prevMap.forEach((d, k) => { if (failedKeys.has(k)) next.set(k, d); });
          return next;
        });
        showError(`${savedCount} perubahan tersimpan, ${failed.length} gagal: ${failed[0]?.message || 'coba lagi'}`);
      } else {
        setDrafts(new Map());
        showSuccess(`${savedCount} perubahan jadwal tersimpan`);
      }
      refreshAfterCommit();
    } catch (err) {
      console.error('[FullSchedule] Bulk save failed:', err);
      showError(err?.response?.data?.message || 'Gagal menyimpan perubahan jadwal');
    } finally {
      setSavingAll(false);
    }
  };

  const discardDraft = (key) => {
    setDrafts((prevMap) => {
      const next = new Map(prevMap);
      next.delete(key);
      return next;
    });
  };

  const discardAllDrafts = () => {
    setDrafts(new Map());
    setShowReviewModal(false);
    showSuccess('Antrean dibuang — jadwal tetap seperti tersimpan di server');
  };

  /**
   * Ringkas nilai draft untuk daftar tinjauan: "A" / "—" (tanpa stasiun) / "libur".
   * `kitchenStation` berisi NAMA jobdesk ("Main Cook"), sedangkan tabel hanya
   * menampilkan HURUF kolom rekap — jadi konversi nama→huruf via
   * `stationLetterOf`, bukan `stationLetterLabel` (argumennya huruf).
   */
  const draftStationLabel = (cell) => (cell?.kitchenStation ? (stationLetterOf(cell.kitchenStation) || '—') : '—');

  /** "A → B" untuk satu draft, supaya perubahannya terbaca sekilas. */
  const draftChangeText = (d) => {
    const before = d.prev ? draftStationLabel({ kitchenStation: d.prev.isOffDay ? null : d.prev.kitchenStation }) : '(baru)';
    const after = d.payload.isOffDay ? 'LIBUR' : draftStationLabel(d.payload);
    return `${before} → ${after}`;
  };

  // Peringatan tutup tab selama antrean belum dikirim (draft hanya hidup di
  // memory browser, jadi refresh = hilang).
  useEffect(() => {
    if (drafts.size === 0) return undefined;
    const onBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [drafts.size]);
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
    // Badge "stasiun dapur kosong" hanya relevan untuk posisi Kitchen/Dapur.
    const isKitchenPosition = /dapur|kitchen/i.test(position?.name || '');
    return (
      <div key={`${position.id}-${ws}`} className="bg-white dark:bg-gray-800 rounded-xl shadow overflow-hidden">
        <div className="px-4 py-3 bg-blue-600 text-white flex items-center justify-between">
          <h2 className="font-semibold text-base">{position.name}</h2>
          <span className="text-xs opacity-80">
            {position.scheduleAllWorking
              ? `Formasi otomatis (${position.rosters?.length ?? '?'} staff)`
              : `Shift 1: ${position.shift1Capacity} orang · Shift 2: ${position.shift2Capacity} orang`}
          </span>
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
                  {dLabels.map(dl => {
                    const dayCoverage = coverage[dl.date];
                    const missing = (isKitchenPosition && dayCoverage?.missing) || [];
                    return (
                      <th
                        key={dl.date}
                        className={`px-3 py-2 text-left whitespace-nowrap ${dl.isToday ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' : ''}`}
                      >
                        <span className={missing.length > 0 ? 'text-red-600 dark:text-red-400' : ''}>{dl.label}</span>
                        {missing.length > 0 && (
                          <span className="block mt-0.5">
                            <span
                              title={`Stasiun dapur kosong: ${missing.map(stationLetterLabel).join(', ')}`}
                              className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase px-1 py-0.5 rounded bg-red-100 text-red-700 border border-red-300 dark:bg-red-900/40 dark:text-red-300 dark:border-red-700"
                            >
                              <AlertTriangle className="w-2.5 h-2.5" />
                              {missing.join('')} kosong
                            </span>
                          </span>
                        )}
                      </th>
                    );
                  })}
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
                          {working.length > 0 && <ul className="space-y-0.5 mb-1">{working.map((u,i) => {
                            const pending = draftFor(u.userId, dl.date);
                            return (
                            <li key={i}
                              onClick={() => handleCellClick(u, dl.date, position, shiftNum)}
                              className={`whitespace-nowrap text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 cursor-pointer rounded px-1 -mx-1 transition-colors flex items-center justify-between group/cell ${pending ? 'ring-1 ring-amber-400 dark:ring-amber-500 bg-amber-50/70 dark:bg-amber-900/20' : ''}`}
                              title={pending ? `Belum disimpan: ${draftChangeText(pending)}` : 'Klik untuk edit jadwal/stasiun ini'}
                            >
                              <span>
                                {u.name}
                                {u.jobdesk && <span className="ml-1 inline-block px-1 py-px rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-[10px] font-medium align-middle">{u.jobdesk}</span>}
                                {pending && <span className="ml-1 inline-block px-1 py-px rounded bg-yellow-200 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-200 text-[10px] font-bold align-middle">BELUM DISIMPAN</span>}
                                {u.swapInfo && (
                                  <span className="ml-1 inline-flex items-center gap-0.5 px-1 py-px rounded bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 text-[10px] font-medium align-middle">
                                    ⇄ {u.swapInfo.withUserName}
                                  </span>
                                )}
                              </span>
                              <Edit2 className="w-3 h-3 opacity-0 group-hover/cell:opacity-100 text-blue-500 ml-1 flex-shrink-0" />
                            </li>
                            );
                          })}</ul>}
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
                          {offDay.length > 0 && <ul className="space-y-0.5">{offDay.map((u,i) => {
                            const pending = draftFor(u.userId, dl.date);
                            return (
                            <li key={i}
                              onClick={() => handleCellClick(u, dl.date, position, shiftNum)}
                              className={`whitespace-nowrap text-orange-500 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 hover:bg-orange-100/50 dark:hover:bg-orange-900/30 cursor-pointer rounded px-1 -mx-1 transition-colors text-xs line-through flex items-center justify-between group/cell ${pending ? 'ring-1 ring-amber-400 dark:ring-amber-500 bg-amber-50/70 dark:bg-amber-900/20' : ''}`}
                              title={pending ? `Belum disimpan: ${draftChangeText(pending)}` : 'Klik untuk ubah jadwal (masuk / tukar shift)'}
                            >
                              <span>&#127958; {u.name}{pending && <span className="ml-1 px-1 py-px rounded bg-yellow-200 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-200 text-[10px] font-bold no-underline align-middle">BARU</span>}</span>
                              <Edit2 className="w-3 h-3 opacity-0 group-hover/cell:opacity-100 text-orange-600 ml-1 flex-shrink-0" />
                            </li>
                            );
                          })}</ul>}
                          {working.length === 0 && offDay.length === 0 && deployedElsewhere.length === 0 && movedToOtherShift.length === 0 && absent.length === 0 && (
                            <button
                              type="button"
                              onClick={() => openAddCellModal(dl.date, position, shiftNum)}
                              className="w-full text-left text-gray-300 dark:text-gray-600 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50/60 dark:hover:bg-blue-900/20 rounded px-1 py-0.5 text-xs transition-colors group/add"
                              title="Tambah jadwal pegawai di hari ini"
                            >
                              <span className="inline-flex items-center gap-1">
                                <span className="text-base leading-none">+</span>
                                <span className="opacity-0 group-hover/add:opacity-100 whitespace-nowrap">Tambah jadwal</span>
                              </span>
                            </button>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {wDates.some(dateISO => (schedule.schedules || []).some(s => {
                  const userSched = s.userSchedulesByDate?.[dateISO];
                  const hasSwap = Boolean(s.swapsByDate?.[dateISO]);
                  const forcedWork = Boolean((userSched?.isManualOverride && !userSched?.isOffDay) || (hasSwap && userSched && !userSched.isOffDay));
                  return !forcedWork && (offDaySet.has(`${s.userId}_${dateISO}`) || Boolean(userSched?.isOffDay));
                })) && (
                  <tr className="border-t border-orange-100 dark:border-orange-900/30 bg-orange-50/30 dark:bg-orange-900/10">
                    <td className="px-3 py-2 font-medium text-orange-600 dark:text-orange-400 whitespace-nowrap text-xs">&#127958; Libur</td>
                    {dLabels.map(dl => {
                      const offScheds = (schedule.schedules || []).filter(s => {
                        if (s.isBackupOnly) return false;
                        const userSched = s.userSchedulesByDate?.[dl.date];
                        const hasSwap = Boolean(s.swapsByDate?.[dl.date]);
                        const forcedWork = Boolean((userSched?.isManualOverride && !userSched?.isOffDay) || (hasSwap && userSched && !userSched.isOffDay));
                        return !forcedWork && (offDaySet.has(`${s.userId}_${dl.date}`) || Boolean(userSched?.isOffDay));
                      });
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
    if (!displayMonthData?.weeks?.length) {
      return (
        <div className="text-center py-16 text-gray-500">
          <p className="text-lg mb-2">Belum ada jadwal untuk bulan ini</p>
          <p className="text-sm">Generate jadwal bulanan di halaman Posisi &amp; Rotasi terlebih dahulu.</p>
        </div>
      );
    }
    return (
      <div className="space-y-10">
        {displayMonthData.weeks.map(({ weekStart: ws, positions: posSchedules }) => {
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
      // Pakai data + pratinjau draft: teks yang disalin selalu sama dengan
      // yang terlihat di layar (dan sama dengan isi PNG/PDF dari tabel).
      displayData.forEach(({ position, schedule }, i) => {
        lines.push(...renderPosition(position, schedule, ws));
        if (i < displayData.length - 1) lines.push('', SEP2, '');
      });
    } else {
      lines.push(`🗓️ *JADWAL BULANAN*`);
      lines.push(`Bulan ${new Date(`${monthView}-01T00:00:00Z`).toLocaleDateString('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' })}`);
      lines.push(SEP);
      lines.push('');
      displayMonthData?.weeks?.forEach(({ weekStart: ws, positions: posSchedules }, wi) => {
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
        <EmployeeShiftEditor
          shifts={allShifts}
          rangeStart={visibleRange.start}
          rangeEnd={visibleRange.end}
          onSaved={() => {
            if (viewMode === 'week') fetchWeek(); else fetchMonth();
            fetchOffDays(activeMonth);
          }}
        />
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
      {/* Peringatan stasiun dapur kosong pada rentang yang sedang tampil.
          Di luar exportRef supaya tidak ikut masuk gambar/PDF jadwal. */}
      {gapDays.length > 0 && (
        <div className="mb-6 rounded-xl border border-red-200 dark:border-red-700 bg-red-50 dark:bg-red-900/30 p-3 print:hidden">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold text-red-800 dark:text-red-200">
                {gapDays.length} hari punya stasiun dapur kosong
              </p>
              <ul className="mt-1 space-y-0.5 text-red-700 dark:text-red-300">
                {gapDays.map(g => (
                  <li key={g.date}>
                    <span className="font-medium">{g.date}</span> — {g.missing.map(stationLetterLabel).join(', ')}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Rekap keadilan jobdesk — satu-satunya tempat rekap jobdesk dapur.
          Sengaja di luar exportRef agar tidak ikut masuk gambar/PDF jadwal. */}
      <div className="mb-6">
        <JobdeskFairnessPanel
          month={activeMonth}
          onMonthChange={(m) => { if (m) { setMonthView(m); setViewMode('month'); } }}
        />
      </div>

      {/* Rangkuman jumlah jobdesk seluruh pegawai — jawaban "pegawai ini sudah
          berapa jobdesk bulan ini?". Sumber data sama dengan panel di atas. */}
      <div className="mb-6">
        <JobdeskEmployeeSummaryPanel
          month={activeMonth}
          onMonthChange={(m) => { if (m) { setMonthView(m); setViewMode('month'); } }}
        />
      </div>

      <div ref={exportRef} className="bg-gray-50 dark:bg-transparent p-1 rounded-lg">
        {viewMode === 'week' && !loading && displayData.length > 0 && <BackupBar ws={weekStart} />}
        {error && <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-300 rounded-lg p-4 mb-4 text-sm">{error}</div>}
        {loading ? (
          <LoadingSpinner />
        ) : viewMode === 'week' ? (
          displayData.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              <p className="text-lg mb-2">Belum ada posisi yang dibuat</p>
              <p className="text-sm">Buat posisi di halaman Posisi &amp; Rotasi terlebih dahulu.</p>
            </div>
          ) : (
            <div className="space-y-8">{displayData.map(({ position, schedule }) => renderPositionTable(position, schedule, weekStart))}</div>
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

      {/* ── Bilah antrean perubahan ── muncul selama ada draft yang belum dikirim.
          Di luar exportRef + print:hidden supaya tidak ikut ke PNG/PDF. */}
      {drafts.size > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-[min(96vw,760px)] print:hidden">
          <div className="rounded-xl border-2 border-amber-400 dark:border-amber-600 bg-white dark:bg-gray-800 shadow-2xl p-3">
            <div className="flex flex-wrap items-center gap-3">
              <Layers className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
              <div className="text-sm min-w-0 flex-1">
                <p className="font-semibold text-amber-800 dark:text-amber-200">
                  {drafts.size} perubahan belum disimpan
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Antrean aman saat pindah minggu/bulan. Badge stasiun A–D ikut diperbarui setelah disimpan.
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Button variant="outline" size="sm" type="button" onClick={discardAllDrafts} disabled={savingAll}>
                  <Trash2 className="w-3.5 h-3.5" /> Buang
                </Button>
                <Button size="sm" type="button" onClick={() => setShowReviewModal(true)}>
                  Simpan Semua
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Konfirmasi terakhir sebelum antrean ditulis ke server (+ hapus satu item). */}
      <Modal
        isOpen={showReviewModal}
        onClose={() => setShowReviewModal(false)}
        title={`Simpan ${drafts.size} perubahan jadwal`}
        size="lg"
      >
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
          Semua perubahan di bawah akan ditulis ke jadwal, lalu tabel dimuat ulang satu kali.
          Perubahan yang tidak jadi dikirim bisa dihapus satu per satu dengan ikon <X className="w-3.5 h-3.5 inline" />.
        </p>
        <ul className="max-h-[50vh] overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700 text-sm">
          {[...drafts.values()].map((d) => (
            <li key={d.key} className="py-2 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-gray-800 dark:text-gray-100 truncate">{d.userName}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {d.date} · {d.positionName} · {draftChangeText(d)}
                  {d.payload.temporaryDepartment ? ` · dept ${d.payload.temporaryDepartment}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => discardDraft(d.key)}
                className="ml-auto text-gray-400 hover:text-red-600 flex-shrink-0"
                title="Buang perubahan ini"
              >
                <X className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
        <div className="pt-4 flex justify-end gap-2 border-t border-gray-200 dark:border-gray-700">
          <Button variant="outline" type="button" onClick={() => setShowReviewModal(false)}>Nanti</Button>
          <Button type="button" onClick={commitAllDrafts} loading={savingAll}>
            Simpan {drafts.size} Perubahan
          </Button>
        </div>
      </Modal>

      {/* Modal Quick Edit Cell Schedule — sekaligus dipakai untuk MENAMBAH
          jadwal dari sel kosong (saat `editCellData.userId` masih null). */}
      <Modal
        isOpen={showEditCellModal}
        onClose={() => setShowEditCellModal(false)}
        title={editCellData.userId
          ? `Edit Jadwal & Stasiun (${editCellData.positionName})`
          : `Tambah Jadwal (${editCellData.positionName})`}
      >
        <form onSubmit={handleSaveCell} className="space-y-4">
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-sm">
            <div className="font-semibold text-blue-900 dark:text-blue-200">{editCellData.userName}</div>
            <div className="text-blue-700 dark:text-blue-300 text-xs mt-0.5">
              Tanggal: <span className="font-mono font-medium">{editCellData.dateISO}</span> &middot; Posisi: <span className="font-medium">{editCellData.positionName}</span>
            </div>
          </div>

          {/* Muncul hanya saat modal dibuka dari sel KOSONG: belum ada pegawai
              yang bisa ditebak, jadi admin memilihnya di sini. */}
          {!editCellData.userId && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Pegawai
              </label>
              <select
                value={editCellData.userId || ''}
                onChange={(e) => {
                  const id = e.target.value ? Number(e.target.value) : null;
                  const u = employees.find((x) => String(x.id) === String(id));
                  setEditCellData({
                    ...editCellData,
                    userId: id,
                    userName: u?.fullName || 'Belum dipilih',
                    currentJobdesk: '',
                  });
                }}
                className="w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 focus:border-blue-500 focus:ring-blue-500 text-sm"
                required
              >
                <option value="">{employeesLoading ? 'Memuat pegawai...' : '-- Pilih Pegawai --'}</option>
                {employees.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName}{u.shift?.name ? ` — ${u.shift.name}` : ''}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Pegawai ini belum punya jadwal di tanggal tersebut, jadi barisnya akan dibuat baru.
              </p>
            </div>
          )}

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

          <p className="text-xs text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-md px-3 py-2">
            Perubahan <strong>tidak langsung disimpan</strong>. Tekan “Masukkan Antrean”, lalu kirim semuanya sekaligus lewat
            tombol <strong>Simpan</strong> di bilah bawah halaman — tabel cukup dimuat ulang satu kali.
          </p>

          <div className="pt-2 flex flex-wrap justify-end gap-2 border-t border-gray-200 dark:border-gray-700">
            <Button variant="outline" type="button" onClick={() => setShowEditCellModal(false)}>
              Batal
            </Button>
            {/* Jalur cepat untuk yang memang hanya mengubah satu sel. */}
            <Button variant="outline" type="button" onClick={saveCellNow} loading={saveLoading} disabled={!editCellData.userId}>
              Simpan Sekarang
            </Button>
            <Button type="submit">
              {drafts.has(draftKey(editCellData.userId, editCellData.dateISO)) ? 'Perbarui Antrean' : 'Masukkan Antrean'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
