const { AppError, ErrorCodes } = require('../utils/AppError');
const prisma = require('../utils/database');

/** Format Date → "YYYY-MM-DD" (UTC), dipakai untuk tanggal murni. */
const toDateStr = (d) => new Date(d).toISOString().slice(0, 10);

/** Format (year, month) → "YYYY-MM". */
const toMonthStr = (year, mon) => `${year}-${String(mon).padStart(2, '0')}`;

/**
 * Bobot beban tiap jobdesk dapur, mengacu JOB_DESK_KITCHEN.md:
 * A (Main Cook) paling berat → E (Helper / Floating) paling ringan.
 *
 * `label` HARUS persis sama dengan potongan nama yang dipakai di
 * `user_schedules.kitchen_station` (dipisah ' + '). `short` dipakai frontend.
 */
const JOBDESK_ROLES = [
    { key: 'MAIN', label: 'Main Cook', short: 'A', weight: 5 },
    { key: 'SUPPORT', label: 'Support Cook', short: 'B', weight: 4 },
    { key: 'CHECKER', label: 'Checker / Stock', short: 'C', weight: 3 },
    { key: 'PLATING', label: 'Plating', short: 'C+', weight: 3 },
    { key: 'RUNNER', label: 'Runner / Area', short: 'D', weight: 2 },
    { key: 'HELPER', label: 'Helper / Floating', short: 'E', weight: 1 },
];

/**
 * Ambang selisih jumlah hari untuk menandai distribusi sebuah jobdesk
 * "belum merata" (JOB_DESK_KITCHEN.md §4.4: selisih maksimal 3 hari).
 */
const FAIRNESS_GAP_THRESHOLD = 3;

/**
 * Pecah nilai `kitchen_station` menjadi daftar jobdesk individual.
 *
 * Nilai di database bisa rangkap, contoh:
 *   'Checker / Stock + Plating'                                    → 2 jobdesk
 *   'Support Cook + Checker / Stock + Runner / Area + Helper'      → 4 jobdesk
 * Memakai `includes`, BUKAN bagian pertama saja — kode lama hanya mengambil
 * potongan pertama sehingga `Plating` (dan jobdesk sisanya) hilang dari rekap.
 *
 * @param {String} station - nilai mentah kitchen_station
 * @returns {Array<Object>} daftar role dari JOBDESK_ROLES yang cocok
 */
const parseJobdeskRoles = (station) => {
    const raw = String(station || '');
    if (!raw.trim()) return [];
    const parts = raw.split(' + ').map((p) => p.trim()).filter(Boolean);
    return JOBDESK_ROLES.filter((role) => parts.includes(role.label));
};

const attendanceRepository = require('../repositories/attendanceRepository');
const { KITCHEN_STATIONS, PRIORITY_ORDER } = require('../config/stationConfig');


class ScheduleService {
    /**
     * Generate rotating schedule for a user
     * (Previous logic preserved, but updated with better types)
     */
    async generateSchedule(userId, startDateStr, months, options = {}) {
        const {
            shiftPattern = [1], // Default Shift 1
            baseOffDay = 0, // Sunday (0=Sun, 1=Mon, ..., 6=Sat — matches JS getUTCDay)
            rotateOffDay = true
        } = options;

        // Parse startDate as UTC midnight — all date math uses UTC to prevent timezone drift
        const startDate = new Date(startDateStr + 'T00:00:00Z');
        const endDate = new Date(startDate);
        endDate.setUTCMonth(endDate.getUTCMonth() + months);

        const schedules = [];
        let currentDate = new Date(startDate);

        // For rotating off day logic
        let currentOffDay = baseOffDay;
        let lastMonth = currentDate.getUTCMonth();

        // Find the Monday on or immediately preceding startDate for shift pattern rotation
        // This ensures the pattern always starts at index 0 for the user's first week
        const userAnchorMonday = new Date(startDate);
        const startDayOfWeek = userAnchorMonday.getUTCDay();
        const daysToMonday = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;
        userAnchorMonday.setUTCDate(userAnchorMonday.getUTCDate() - daysToMonday);

        while (currentDate < endDate) {
            // Handle Special Cases
            if (baseOffDay === -99) {
                // Clear Schedule Mode: Just skip generation loops
                // We will handle deletion in the database operation phase
            } else if (baseOffDay === -2) {
                // Full Off Mode: Always Off
                schedules.push({
                    userId,
                    date: new Date(currentDate),
                    shiftId: null,
                    isOffDay: true
                });
            } else {
                // Normal Generation Logic — all using UTC methods
                const dayOfWeek = currentDate.getUTCDay();
                const currentMonth = currentDate.getUTCMonth();

                // Migrate off-day if month changed
                if (rotateOffDay && currentMonth !== lastMonth && currentOffDay !== -1) {
                    currentOffDay = (currentOffDay + 1) % 7;
                    lastMonth = currentMonth;
                }

                const isOffDay = currentOffDay !== -1 && dayOfWeek === currentOffDay;
                let shiftId = null;

                if (!isOffDay) {
                    // Week-based rotation anchored to the user's starting Monday (Mon-Sun cycle)
                    // This ensures the first week always uses the first shift in the pattern
                    const diffTime = currentDate.getTime() - userAnchorMonday.getTime();
                    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
                    const weekIndex = Math.floor(diffDays / 7);

                    const patternIndex = ((weekIndex % shiftPattern.length) + shiftPattern.length) % shiftPattern.length;
                    shiftId = shiftPattern[patternIndex];
                }

                schedules.push({
                    userId,
                    date: new Date(currentDate),
                    shiftId: isOffDay ? null : shiftId,
                    isOffDay
                });
            }

            // Next day — use UTC to prevent timezone drift
            currentDate.setUTCDate(currentDate.getUTCDate() + 1);
        }

        // Special handling for -99 (Delete)
        if (baseOffDay === -99) {
            await prisma.userSchedule.deleteMany({
                where: {
                    userId: userId,
                    date: {
                        gte: startDate,
                        lt: endDate
                    }
                }
            });
            return []; // Return empty as we deleted them
        }

        // Bulk upsert
        // Prisma doesn't support bulk upsert nicely for SQLite/MySQL depending on version, 
        // but transaction is good.
        // PROTECT: Skip dates where manual override exists
        const existingManualOverrides = await prisma.userSchedule.findMany({
            where: {
                userId,
                date: { gte: startDate, lt: endDate },
                isManualOverride: true
            },
            select: { date: true }
        });
        const manualDates = new Set(existingManualOverrides.map(s => s.date.toISOString().split('T')[0]));

        const filteredSchedules = schedules.filter(s => {
            const dateStr = s.date.toISOString().split('T')[0];
            return !manualDates.has(dateStr);
        });

        const operations = filteredSchedules.map(schedule =>
            prisma.userSchedule.upsert({
                where: {
                    userId_date: {
                        userId: schedule.userId,
                        date: schedule.date
                    }
                },
                update: {
                    shiftId: schedule.shiftId,
                    isOffDay: schedule.isOffDay
                },
                create: {
                    userId: schedule.userId,
                    date: schedule.date,
                    shiftId: schedule.shiftId,
                    isOffDay: schedule.isOffDay
                }
            })
        );

        await prisma.$transaction(operations);

        return schedules;
    }

    /**
     * Bulk generate schedule for multiple users with the same shift
     * Use case: Ramadan - all staff same shift
     */
    async bulkGenerateSchedule(userIds, startDateStr, endDateStr, shiftId, options = {}) {
        const { keepOffDays = true } = options;

        // Parse dates as UTC midnight to prevent timezone drift
        const startDate = new Date(startDateStr + 'T00:00:00Z');
        const endDate = new Date(endDateStr + 'T00:00:00Z');

        // Fetch users to get their off day info
        const users = await prisma.user.findMany({
            where: { id: { in: userIds }, isActive: true },
            select: { id: true, fullName: true, offDay: true }
        });

        if (users.length === 0) {
            throw new Error('Tidak ada user aktif yang ditemukan');
        }

        const allSchedules = [];

        const anchorMonday = new Date(startDate);
        const anchorDay = anchorMonday.getUTCDay();
        if (anchorDay !== 1) {
            const diffToMonday = anchorDay === 0 ? -6 : 1 - anchorDay;
            anchorMonday.setUTCDate(anchorMonday.getUTCDate() + diffToMonday);
        }
        anchorMonday.setUTCHours(0, 0, 0, 0);

        for (const user of users) {
            let currentDate = new Date(startDate);

            while (currentDate <= endDate) {
                const dayOfWeek = currentDate.getUTCDay();
                const isOffDay = keepOffDays && user.offDay != null && user.offDay !== -1 && dayOfWeek === user.offDay;

                let assignedShiftId = null;
                if (!isOffDay) {
                    const diffTime = currentDate.getTime() - anchorMonday.getTime();
                    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
                    const weekIndex = Math.floor(diffDays / 7);
                    // Rotasi mingguan: minggu genap = shift terpilih, minggu ganjil = shift lainnya (1 <-> 2)
                    assignedShiftId = (weekIndex % 2 === 0) ? shiftId : (shiftId === 1 ? 2 : 1);
                }

                allSchedules.push({
                    userId: user.id,
                    date: new Date(currentDate),
                    shiftId: assignedShiftId,
                    isOffDay: isOffDay
                });

                currentDate.setUTCDate(currentDate.getUTCDate() + 1);
            }
        }

        // Batch upsert in transaction
        const batchSize = 50;
        for (let i = 0; i < allSchedules.length; i += batchSize) {
            const batch = allSchedules.slice(i, i + batchSize);
            const operations = batch.map(schedule =>
                prisma.userSchedule.upsert({
                    where: {
                        userId_date: {
                            userId: schedule.userId,
                            date: schedule.date
                        }
                    },
                    update: {
                        shiftId: schedule.shiftId,
                        isOffDay: schedule.isOffDay
                    },
                    create: {
                        userId: schedule.userId,
                        date: schedule.date,
                        shiftId: schedule.shiftId,
                        isOffDay: schedule.isOffDay
                    }
                })
            );
            await prisma.$transaction(operations);
        }

        return {
            totalUsers: users.length,
            totalDays: Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1,
            totalSchedules: allSchedules.length,
            users: users.map(u => u.fullName)
        };
    }

    /**
     * Distribute Shift 2 for Kitchen Staff (Detailed Rolling)
     * Rule: Shift 1 (2 people) Max, Shift 2 (3 people).
     * Rolling weekly.
     * Pattern: [S1, S1, S2, S2, S2] -> Shift 1 window slides by 2 every week.
     */
    async distributeKitchenShifts(options) {
        try {
            let start, end;
            if (options.startDate && options.endDate) {
                start = new Date(options.startDate);
                start.setHours(0, 0, 0, 0);
                end = new Date(options.endDate);
                end.setHours(23, 59, 59, 999);
            } else {
                // Fallback to monthStr
                const [year, month] = options.month.split('-').map(Number);
                start = new Date(year, month - 1, 1, 0, 0, 0, 0);
                end = new Date(year, month, 0, 23, 59, 59, 999);
            }

            // Get all KITCHEN staff Sorted by ID for consistent rotation
            const kitchenStaff = await prisma.user.findMany({
                where: { department: 'KITCHEN', isActive: true },
                orderBy: { id: 'asc' }
            });

            if (kitchenStaff.length === 0) {
                console.log('[ScheduleService] No kitchen staff found');
                return { message: 'No kitchen staff found' };
            }

            // Fetch existing schedules to respect OFF DAYS and manual overrides
            const existingSchedules = await prisma.userSchedule.findMany({
                where: {
                    userId: { in: kitchenStaff.map(u => u.id) },
                    date: { gte: start, lte: end }
                }
            });

            // Map: UserID -> DateString -> { isOffDay, isManualOverride }
            const scheduleMap = {};
            existingSchedules.forEach(s => {
                if (!scheduleMap[s.userId]) scheduleMap[s.userId] = {};
                const d = s.date.toISOString().split('T')[0];
                scheduleMap[s.userId][d] = { isOffDay: s.isOffDay, isManualOverride: s.isManualOverride };
            });

            // Collect IDs of manually overridden schedules (DO NOT delete or overwrite)
            const manualOverrideIds = existingSchedules
                .filter(s => s.isManualOverride)
                .map(s => s.id);

            console.log(`[ScheduleService] Found ${manualOverrideIds.length} manual override schedules — these will be preserved.`);

            // Anchor Date: February 1, 2026 (User defined "Correct Month")
            // This ensures rotation continues seamlessly from Feb 2026 onwards.
            const ANCHOR_DATE = new Date(2026, 1, 1); // Feb 1, 2026 (Month is 0-indexed)

            // Track Shift 1 (Pagi) counts per staff — used to ensure fairness
            const shift1Count = {};
            const shift2Count = {};
            kitchenStaff.forEach(u => {
                shift1Count[u.id] = 0;
                shift2Count[u.id] = 0;
            });

            // Iterate Date by Date
            let current = new Date(start);

            // Define createData array
            const createData = [];

            while (current <= end) {
                const dateStr = current.toISOString().split('T')[0];

                // 1. Evaluate who is working today (and who has manual override)
                const staffOffStatus = {};
                const workingStaffIds = [];

                kitchenStaff.forEach(user => {
                    const existingEntry = scheduleMap[user.id]?.[dateStr];
                    // Skip counting manual override staff — they handle their own shift
                    if (existingEntry?.isManualOverride) {
                        staffOffStatus[user.id] = existingEntry.isOffDay;
                        return;
                    }
                    let isOff = false;
                    if (existingEntry !== undefined) {
                        isOff = existingEntry.isOffDay;
                    } else {
                        isOff = current.getUTCDay() === user.offDay;
                    }
                    staffOffStatus[user.id] = isOff;
                    if (!isOff) workingStaffIds.push(user.id);
                });

                // 2. Pick Pagi (Shift 1) from WORKING staff — fairly distribute
                // Sort: fewest Pagi first. Tie-break: most Siang first (more rest).
                // Secondary tie-break: random order (shuffle equally-ranked staff)
                const MAX_SHIFT_1 = 2;
                const sorted = [...workingStaffIds].sort((a, b) => {
                    const diff = shift1Count[a] - shift1Count[b];
                    if (diff !== 0) return diff;
                    // Secondary: who has had more Siang (give them Pagi as rest)
                    return shift2Count[b] - shift2Count[a];
                });

                const shift1UserIds = sorted.slice(0, MAX_SHIFT_1);

                // Increment counts
                shift1UserIds.forEach(id => shift1Count[id]++);
                workingStaffIds.forEach(id => {
                    if (!shift1UserIds.includes(id)) shift2Count[id]++;
                });

                // 3. Assign Shifts — skip staff who have manual override for this date
                kitchenStaff.forEach(user => {
                    const existingEntry = scheduleMap[user.id]?.[dateStr];
                    // Preserve manual overrides
                    if (existingEntry?.isManualOverride) return;

                    let isOff = staffOffStatus[user.id];
                    let shiftId = 2; // Default Shift 2 (Siang)

                    if (!isOff && shift1UserIds.includes(user.id)) {
                        shiftId = 1; // Shift 1 (Pagi)
                    }
                    if (isOff) shiftId = null;

                    createData.push({
                        userId: user.id,
                        date: new Date(current),
                        shiftId: shiftId,
                        isOffDay: isOff,
                        isManualOverride: false
                    });
                });

                current.setDate(current.getDate() + 1);
            }

            // Log fairness summary
            console.log('[ScheduleService] Shift fairness summary:');
            kitchenStaff.forEach(u => {
                console.log(`  ${u.fullName}: Pagi=${shift1Count[u.id]}, Siang=${shift2Count[u.id]}`);
            });

            // Execute Transaction (Delete non-manual entries then Create)
            await prisma.$transaction(async (tx) => {
                // Delete only NON-manual-override records for this group & date range
                const deleteWhere = {
                    userId: { in: kitchenStaff.map(u => u.id) },
                    date: { gte: start, lte: end },
                    isManualOverride: false
                };
                const deleted = await tx.userSchedule.deleteMany({ where: deleteWhere });
                console.log(`[ScheduleService] Deleted ${deleted.count} auto-generated kitchen records (manual overrides preserved).`);

                // createMany (chunked)
                const CHUNK_SIZE = 50;
                for (let i = 0; i < createData.length; i += CHUNK_SIZE) {
                    await tx.userSchedule.createMany({
                        data: createData.slice(i, i + CHUNK_SIZE),
                        skipDuplicates: true
                    });
                }
            });

            // --- STATION ASSIGNMENT LOGIC ---
            // After Pagi/Siang rules are saved to DB, infer stations dynamically.
            // This reuses `assignStationsRotation` which explicitly reads back from the DB
            // (including any manual overrides that were preserved) to assign perfectly.
            await this.assignStationsRotation({ startDate: start.toISOString(), endDate: end.toISOString() });

            return { message: `Distributed weekly rolling shifts for ${kitchenStaff.length} kitchen staff` };


        } catch (error) {
            console.error('[ScheduleService] distributeKitchenShifts ERROR:', error);
            throw error;
        }
    }

    /**
     * ONLY Assign Stations (Nodes/Roles) based on existing shifts.
     * Does NOT change Shift Pagi/Siang or Off Days.
     */
    async assignStationsRotation(options) {
        try {
            let start, end;
            if (options.startDate && options.endDate) {
                start = new Date(options.startDate);
                start.setHours(0, 0, 0, 0);
                end = new Date(options.endDate);
                end.setHours(23, 59, 59, 999);
            } else {
                const [year, month] = options.month.split('-').map(Number);
                start = new Date(year, month - 1, 1, 0, 0, 0, 0);
                end = new Date(year, month, 0, 23, 59, 59, 999);
            }

            // Get all schedules
            const schedules = await prisma.userSchedule.findMany({
                where: {
                    date: { gte: start, lte: end },
                    user: { department: 'KITCHEN', isActive: true },
                    isOffDay: false,
                    shiftId: { not: null }
                },
                select: { userId: true, date: true, shiftId: true }
            });

            // Iterate day by day
            let current = new Date(start);

            // Helper for Weekly Rotation (Track Week Start -> PIC User ID)
            const weeklyPicMap = {};
            
            // Infer participating kitchen staff directly from the fetched schedules
            // so we don't rely on global 'isActive' state which breaks if someone resigns.
            const uniqueStaffIds = new Set(schedules.map(s => s.userId));
            const kitchenStaffIds = Array.from(uniqueStaffIds).sort((a, b) => a - b);

            // TRACKING OBJECT for fair distribution across the generation period
            const stationCounts = {};
            kitchenStaffIds.forEach(id => {
                stationCounts[id] = {};
                PRIORITY_ORDER.forEach(station => {
                    stationCounts[id][station] = 0;
                });
            });

            while (current <= end) {
                const daySchedules = schedules.filter(s => new Date(s.date).getDate() === current.getDate());

                // 1. Determine Week Key (Monday as Start)
                // Get Monday of this week
                const d = new Date(current);
                const day = d.getDay();
                const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
                const monday = new Date(d.setDate(diff));
                const weekKey = monday.toISOString().split('T')[0];

                // 2. Determine PIC for this week
                if (!weeklyPicMap[weekKey] && kitchenStaffIds.length > 0) {
                    // Simple rotation based on Feb 1, 2026 Anchor
                    // (Matches distributeKitchenShifts anchor)
                    const diffTime = Math.abs(monday.getTime() - new Date(2026, 1, 1).getTime());
                    const diffWeeks = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 7));
                    const picIndex = diffWeeks % kitchenStaffIds.length;
                    weeklyPicMap[weekKey] = kitchenStaffIds[picIndex];
                }
                const weeklyPicId = weeklyPicMap[weekKey];
                const allStaffIds = daySchedules.map(s => s.userId);

                // 3. Assign Daily Stations
                await this.assignDailyStations(current, allStaffIds, weeklyPicId, stationCounts);

                current.setDate(current.getDate() + 1);
            }

            // CLEANUP: Ensure NO OFF DAYS have stations (Clean up artifacts)
            await prisma.userSchedule.updateMany({
                where: {
                    date: { gte: start, lte: end },
                    isOffDay: true
                },
                data: { kitchenStation: null, isInventoryController: false }
            });

            return { message: 'Stations rotated successfully based on existing shifts.' };

        } catch (error) {
            console.log('[ScheduleService] assignStationsRotation ERROR:', error);
            throw error;
        }
    }

    async getUserSchedule(userId, startDate, endDate) {
        let schedules = await prisma.userSchedule.findMany({
            where: {
                userId,
                date: {
                    gte: startDate,
                    lte: endDate
                }
            },
            include: {
                shift: true
            },
            orderBy: {
                date: 'asc'
            }
        });

        // Fallback: if no schedule rows exist for this user in the requested range,
        // auto-generate them from the user's configured shift pattern so "Jadwal Saya"
        // is never empty when the rolling schedule has not been persisted yet.
        // GUARD: only auto-generate for users registered in PositionRoster.
        // Users not in PositionRoster (e.g. unregistered employees) must be scheduled
        // manually by admin — do not silently create a default Shift 1 schedule for them.
        if (schedules.length === 0) {
            const inRoster = await prisma.positionRoster.findFirst({
                where: { userId },
                select: { id: true }
            });

            if (!inRoster) {
                // Not in rotation system — return empty, dashboard will show noSchedule
                return [];
            }

            const startDateStr = startDate.toISOString().slice(0, 10);
            const months = Math.max(1, Math.ceil(
                (endDate.getTime() - startDate.getTime()) / (30 * 24 * 60 * 60 * 1000)
            ));

            const user = await prisma.user.findUnique({ where: { id: userId } });
            if (user) {
                const shiftPattern = user.shiftId ? [user.shiftId] : [1];
                await this.generateSchedule(userId, startDateStr, months, {
                    shiftPattern,
                    baseOffDay: user.offDay ?? 0,
                    rotateOffDay: true
                });

                schedules = await prisma.userSchedule.findMany({
                    where: {
                        userId,
                        date: {
                            gte: startDate,
                            lte: endDate
                        }
                    },
                    include: {
                        shift: true
                    },
                    orderBy: {
                        date: 'asc'
                    }
                });
            }
        }

        return schedules;
    }

    async getTodaySchedule(userId) {
        // Guard: if user is not in PositionRoster, they have no managed schedule.
        // Return null immediately — do not query UserSchedule (which may have stale
        // auto-generated rows from the old fallback in getUserSchedule).
        const inRoster = await prisma.positionRoster.findFirst({
            where: { userId },
            select: { id: true }
        });
        if (!inRoster) return null;

        // Gunakan WITA (UTC+8) untuk menentukan rentang "hari ini"
        const WITA_OFFSET_MS = 8 * 60 * 60 * 1000;
        const nowWITA = new Date(Date.now() + WITA_OFFSET_MS);
        const witaDateStr = nowWITA.toISOString().slice(0, 10); // "YYYY-MM-DD" dalam WITA
        const todayStart = new Date(`${witaDateStr}T00:00:00+08:00`);
        const todayEnd = new Date(`${witaDateStr}T23:59:59+08:00`);

        // Gunakan findFirst dengan range query untuk mengatasi timezone mismatch
        // antara penyimpanan (UTC) dan pencarian (WITA)
        return await prisma.userSchedule.findFirst({
            where: {
                userId,
                date: {
                    gte: todayStart,
                    lte: todayEnd
                }
            },
            include: {
                shift: true
            }
        });
    }

    /**
     * Update a specific schedule (Admin Manual Edit)
     */
    async updateSchedule(scheduleId, data) {
        const { shiftId, isOffDay, kitchenStation, temporaryDepartment } = data;

        const updateData = {
            shiftId: isOffDay ? null : shiftId,
            isOffDay: isOffDay,
            isManualOverride: true, // flag: protect from rolling distribution overwrite
        };

        if (kitchenStation !== undefined) {
            updateData.kitchenStation = isOffDay ? null : (kitchenStation === '' ? null : kitchenStation);
        } else if (isOffDay) {
            updateData.kitchenStation = null;
        }

        // Handle temporary department override (null = use employee's permanent department)
        if (temporaryDepartment !== undefined) {
            updateData.temporaryDepartment = (temporaryDepartment === '' || temporaryDepartment === 'default')
                ? null
                : temporaryDepartment;
        }

        return await prisma.userSchedule.update({
            where: { id: scheduleId },
            data: updateData,
            include: {
                user: {
                    select: {
                        id: true,
                        fullName: true,
                        department: true
                    }
                },
                shift: true
            }
        });
    }

    /**
     * Upsert single schedule (Add Schedule from Calendar)
     */
    async upsertSingleSchedule(data) {
        const { userId, date, shiftId, isOffDay, kitchenStation, temporaryDepartment } = data;
        
        const cleanDateStr = typeof date === 'string' ? date.slice(0, 10) : date.toISOString().slice(0, 10);
        const scheduleDate = new Date(`${cleanDateStr}T00:00:00.000Z`);

        const upsertData = {
            shiftId: isOffDay ? null : (shiftId ? parseInt(shiftId) : null),
            isOffDay: Boolean(isOffDay),
            kitchenStation: isOffDay ? null : (kitchenStation === '' ? null : kitchenStation),
            isManualOverride: true,
            temporaryDepartment: (temporaryDepartment === '' || temporaryDepartment === 'default' || !temporaryDepartment)
                ? null
                : temporaryDepartment,
        };

        if (!isOffDay) {
            await prisma.manualOffDay.deleteMany({
                where: {
                    userId: parseInt(userId),
                    date: scheduleDate,
                }
            }).catch(() => {});
        }

        return await prisma.userSchedule.upsert({
            where: {
                userId_date: {
                    userId: parseInt(userId),
                    date: scheduleDate
                }
            },
            update: upsertData,
            create: {
                userId: parseInt(userId),
                date: scheduleDate,
                ...upsertData
            },
            include: {
                user: {
                    select: {
                        id: true,
                        fullName: true,
                        department: true
                    }
                },
                shift: true
            }
        });
    }

    async checkConflicts(userId, startDateStr, months, options = {}) {
        const {
            baseOffDay = 0,
            rotateOffDay = true
        } = options;

        if (baseOffDay === -1 || baseOffDay === -99) {
            return []; // No conflicts possible if no off days or clearing schedule
        }

        // 1. Get User's Department
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, department: true }
        });

        if (!user) throw ErrorCodes.USER_NOT_FOUND;

        // 2. Simulate Off Days
        // Parse as UTC midnight — consistent with generateSchedule
        const startDate = new Date(startDateStr + 'T00:00:00Z');
        const endDate = new Date(startDate);
        endDate.setUTCMonth(endDate.getUTCMonth() + months);

        let currentDate = new Date(startDate);
        let currentOffDay = parseInt(baseOffDay);
        let lastMonth = currentDate.getUTCMonth();

        const proposedOffDates = [];

        while (currentDate < endDate) {
            if (baseOffDay === -2) {
                // Full Off Mode: Every day is off
                proposedOffDates.push(new Date(currentDate));
            } else {
                // Normal Mode — use UTC to match generateSchedule
                const dayOfWeek = currentDate.getUTCDay();
                const currentMonth = currentDate.getUTCMonth();

                if (rotateOffDay && currentMonth !== lastMonth && currentOffDay !== -1) {
                    currentOffDay = (currentOffDay + 1) % 7;
                    lastMonth = currentMonth;
                }

                if (currentOffDay !== -1 && dayOfWeek === currentOffDay) {
                    proposedOffDates.push(new Date(currentDate));
                }
            }
            currentDate.setUTCDate(currentDate.getUTCDate() + 1);
        }

        if (proposedOffDates.length === 0) return [];

        // 3. Find conflicts in DB
        // Find other users in same department who are OFF on these dates
        const conflicts = await prisma.userSchedule.findMany({
            where: {
                date: { in: proposedOffDates },
                isOffDay: true,
                user: {
                    department: user.department,
                    id: { not: userId },
                    isActive: true
                }
            },
            include: {
                user: { select: { fullName: true } }
            }
        });

        // 4. Group by Date
        const conflictMap = {}; // { "YYYY-MM-DD": ["User A", "User B"] }

        conflicts.forEach(c => {
            const dateStr = c.date.toISOString().split('T')[0];
            if (!conflictMap[dateStr]) {
                conflictMap[dateStr] = [];
            }
            if (!conflictMap[dateStr].includes(c.user.fullName)) {
                conflictMap[dateStr].push(c.user.fullName);
            }
        });

        return conflictMap;
    }

    /**
     * Get all schedules within a date range (for Calendar View)
     */
    async getAllSchedules(startDate, endDate, department) {
        const where = {
            date: {
                gte: startDate,
                lte: endDate
            }
        };

        // Filter by department if provided (requires User relation)
        if (department && department !== 'ALL') {
            where.user = {
                department: department
            };
        }

        try {
            console.log('[ScheduleService] getAllSchedules', { startDate, endDate, department });
            const schedules = await prisma.userSchedule.findMany({
                where,
                include: {
                    user: {
                        select: {
                            id: true,
                            fullName: true,
                            department: true // Ensure department is fetched
                        }
                    },
                    shift: true
                },
                orderBy: {
                    date: 'asc'
                }
            });
            return schedules;
        } catch (error) {
            console.error('[ScheduleService] getAllSchedules ERROR:', error);
            throw error;
        }
    }
    async assignDailyStations(date, staffIds, weeklyPicId, stationCounts = null) {
        if (!staffIds || staffIds.length === 0) return;

        let counts = stationCounts;

        // If no tracking provided (e.g. from redistributeStations), fetch counts from DB for current month
        if (!counts) {
            counts = {};
            staffIds.forEach(id => {
                counts[id] = {};
                PRIORITY_ORDER.forEach(st => counts[id][st] = 0);
            });

            const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
            const pastSchedules = await prisma.userSchedule.findMany({
                where: {
                    date: { gte: startOfMonth, lt: date },
                    userId: { in: staffIds },
                    kitchenStation: { not: null }
                }
            });

            pastSchedules.forEach(s => {
                const uid = s.userId;
                const baseStation = s.kitchenStation.split(' + ')[0].trim();
                const fullStation = PRIORITY_ORDER.find(p => p.startsWith(baseStation));
                if (fullStation && counts[uid]) {
                    counts[uid][fullStation]++;
                }
            });
        }

        const newAssignments = []; 
        const unassignedStaff = [...staffIds];

        // 3. Assign based on Priority Order (A, B, C, D, E) using fair cumulative counts
        for (const station of PRIORITY_ORDER) {
            if (unassignedStaff.length === 0) break;

            // Sort unassigned staff to find the fairest candidate for this station
            unassignedStaff.sort((a, b) => {
                // Primary: Who has done THIS station the least?
                const countA = counts[a][station] || 0;
                const countB = counts[b][station] || 0;
                if (countA !== countB) return countA - countB;

                // Secondary tie-breaker: For high-priority (A, B), prioritize those who have done less high-priority overall
                const isHighPriority = station.startsWith('A') || station.startsWith('B');
                if (isHighPriority) {
                     const sumHighA = (counts[a][PRIORITY_ORDER[0]] || 0) + (counts[a][PRIORITY_ORDER[1]] || 0);
                     const sumHighB = (counts[b][PRIORITY_ORDER[0]] || 0) + (counts[b][PRIORITY_ORDER[1]] || 0);
                     if (sumHighA !== sumHighB) return sumHighA - sumHighB;
                }

                return a - b; // fallback
            });

            let chosenIndex = 0;
            let userId = unassignedStaff[chosenIndex];

            // --- RULE: PIC Stok cannot hold Role A (Main Cook) ---
            if (station.startsWith('A - Main Cook') && userId === weeklyPicId && unassignedStaff.length > 1) {
                // Skip the PIC Stok, pick the next fairest person
                chosenIndex = 1;
                userId = unassignedStaff[chosenIndex];
            }

            newAssignments.push({ userId, station });
            
            // Update tracking
            if (counts[userId] && counts[userId][station] !== undefined) {
                counts[userId][station]++;
            }
            unassignedStaff.splice(chosenIndex, 1);
        }

        // 4. Determine Control Roles (Strict: Max 1 Control Role per Person)
        // Order of Priority: PIC Stok > Shift PIC > Sanitation

        let controlRoles = {}; // userId -> 'PIC_STOK' | 'SHIFT_PIC' | 'SANITATION'

        // A. PIC Stok Mingguan (Rules: Only Mondays, Fixed User)
        const isMonday = date.getDay() === 1;
        let picStokUserId = null;
        if (isMonday && weeklyPicId && staffIds.includes(weeklyPicId)) {
            picStokUserId = weeklyPicId;
            controlRoles[picStokUserId] = 'PIC_STOK';
        }

        // B. Shift PIC (Rules: Not A - Main Cook. Prioritize C - Checker.)
        let shiftPicUserId = null;

        // Filter candidates: Exclude PIC Stok. Exclude Role A users.
        const shiftPicCandidates = newAssignments.filter(a =>
            !controlRoles[a.userId] &&
            !a.station.startsWith('A - Main Cook') // STRICT RULE: No Main Cook
        );

        // Prioritize C - Checker if available among valid candidates
        let finalShiftPic = shiftPicCandidates.find(a => a.station.startsWith('C - Checker'));

        if (!finalShiftPic) {
            // Fallback: Try B - Support
            finalShiftPic = shiftPicCandidates.find(a => a.station.startsWith('B - Support'));
        }
        if (!finalShiftPic && shiftPicCandidates.length > 0) {
            // Fallback: Anyone else (D or E), just not A.
            finalShiftPic = shiftPicCandidates[0];
        }

        if (finalShiftPic) {
            shiftPicUserId = finalShiftPic.userId;
            controlRoles[shiftPicUserId] = 'SHIFT_PIC';
        }

        // C. Sanitation Lead (Rules: Rotate among remaining staff. Exclude Runner D. Exclude Control Roles.)
        let sanitationLeadUserId = null;
        // Candidates: Not Control Role. Not D - Runner.
        const sanitationCandidates = newAssignments.filter(a =>
            !controlRoles[a.userId] &&
            !a.station.startsWith('D - Runner') // STRICT RULE: No Runner
        );

        if (sanitationCandidates.length > 0) {
            // Deterministic rotation based on Date
            const sanitationIndex = (date.getDate() + date.getMonth()) % sanitationCandidates.length;
            sanitationLeadUserId = sanitationCandidates[sanitationIndex].userId;
            controlRoles[sanitationLeadUserId] = 'SANITATION';
        }

        // 5. Update Database
        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);

        const endOfDay = new Date(startOfDay);
        endOfDay.setDate(endOfDay.getDate() + 1);

        for (const assign of newAssignments) {
            await prisma.userSchedule.updateMany({
                where: {
                    userId: assign.userId,
                    date: {
                        gte: startOfDay,
                        lt: endOfDay
                    }
                },
                data: {
                    kitchenStation: assign.station, // Role name only (No + Dishwasher suffix)
                    isInventoryController: assign.userId === picStokUserId,
                    isShiftPic: assign.userId === shiftPicUserId,
                    isSanitationLead: assign.userId === sanitationLeadUserId
                }
            });
        }
    }

    /**
     * Redistribute stations for a specific date (e.g., someone is Sick)
     */
    async redistributeStations(dateStr) {
        const date = new Date(dateStr);

        // Get all kitchen staff scheduled for WORK (not off) today
        const schedules = await prisma.userSchedule.findMany({
            where: {
                date: date,
                isOffDay: false,
                user: {
                    department: 'KITCHEN',
                    isActive: true
                }
            },
            select: { userId: true }
        });

        const staffIds = schedules.map(s => s.userId);

        // Re-assign (overwrite existing stations)
        await this.assignDailyStations(date, staffIds);

        return { message: 'Stations redistributed successfully', count: staffIds.length };
    }
    /**
     * Rekap satu staff (dipakai endpoint personal "Jobdesk Saya").
     *
     * Sengaja menghitung dari kumpulan hari yang SAMA dengan `getJobdeskFairness`
     * (UserSchedule.isOffDay=false, department KITCHEN, isActive) supaya angka yang
     * dilihat staff tidak pernah berbeda dengan rekap yang dilihat admin.
     *
     * @param {Number} userId
     * @param {Object} user - { id, fullName, department }
     * @param {Array}  scheduleRows - baris UserSchedule bulan itu (sudah terfilter)
     * @param {Array}  teammates - rekap staff lain bulan itu, untuk perbandingan
     * @returns {Object} rekap personal siap kirim
     */
    buildPersonalJobdeskSummary(userId, user, scheduleRows, teammates) {
        const mine = scheduleRows.filter((r) => r.userId === userId);
        const counts = Object.fromEntries(JOBDESK_ROLES.map((r) => [r.key, 0]));
        const byDate = [];
        let daysWorked = 0;
        let daysWithoutJobdesk = 0;
        let multiJobdeskDays = 0;
        let loadSum = 0;

        for (const row of mine) {
            daysWorked += 1;
            const roles = parseJobdeskRoles(row.kitchenStation);
            const iso = toDateStr(row.date);

            if (!roles.length) {
                daysWithoutJobdesk += 1;
                // Hari kerja tanpa jobdesk tetap dilaporkan supaya staff bisa
                // melaporkannya ke admin (ini yang biasanya jadi sumber sengketa).
                byDate.push({
                    date: iso,
                    raw: row.kitchenStation || null,
                    jobdesks: [],
                    load: 0,
                });
                continue;
            }

            if (roles.length > 1) multiJobdeskDays += 1;
            let dayLoad = 0;
            for (const role of roles) {
                counts[role.key] += 1;
                dayLoad += role.weight;
            }
            loadSum += dayLoad;
            byDate.push({
                date: iso,
                raw: row.kitchenStation,
                jobdesks: roles.map((r) => ({ key: r.key, label: r.label, short: r.short, weight: r.weight })),
                load: dayLoad,
            });
        }

        byDate.sort((a, b) => a.date.localeCompare(b.date));

        const loadPerDay = daysWorked ? Number((loadSum / daysWorked).toFixed(2)) : 0;
        const days = Object.fromEntries(JOBDESK_ROLES.map((r) => [r.key, counts[r.key]]));

        // ── Rekap "sebulan ini" ───────────────────────────────────────────────
        // Inti yang ditanyakan staff: "bulan ini saya mengerjakan jobdesk apa
        // saja, dan berapa kali?". Semua jobdesk ditampilkan (termasuk yang 0x)
        // supaya kelihatan mana yang belum pernah dipegang bulan ini.
        const totalJobdesk = JOBDESK_ROLES.reduce((a, r) => a + counts[r.key], 0);
        const perJobdesk = JOBDESK_ROLES.map((r) => ({
            key: r.key,
            label: r.label,
            short: r.short,
            weight: r.weight,
            count: counts[r.key],
            // Persentase dari seluruh jobdesk yang dipegang bulan ini.
            share: totalJobdesk ? Number(((counts[r.key] / totalJobdesk) * 100).toFixed(1)) : 0,
        })).sort((a, b) => b.count - a.count || a.weight - b.weight);

        // ── Perbandingan dengan rekan satu tim ─────────────────────────────────
        // Hanya memakai ANGKA AGREGAT (rata-rata/min/max beban + jumlah staff).
        // Rekap per orang sengaja TIDAK dikirim, supaya staff tidak bisa melihat
        // rincian jobdesk rekan kerjanya lewat endpoint ini.
        const teamLoads = (teammates || []).map((t) => t.loadPerDay);
        const teamAvg = teamLoads.length
            ? Number((teamLoads.reduce((a, b) => a + b, 0) / teamLoads.length).toFixed(2))
            : 0;
        const diff = Number((loadPerDay - teamAvg).toFixed(2));

        // Ambang selisih beban harian yang dianggap "layak dibicarakan".
        const FAIR_BAND = 1;
        const comparison = {
            teamStaffCount: teamLoads.length,
            teamAvgLoadPerDay: teamAvg,
            teamMinLoadPerDay: teamLoads.length ? Number(Math.min(...teamLoads).toFixed(2)) : 0,
            teamMaxLoadPerDay: teamLoads.length ? Number(Math.max(...teamLoads).toFixed(2)) : 0,
            diff,
        };

        let verdict;
        if (!daysWorked) {
            verdict = {
                key: 'no-data',
                label: 'Belum ada hari kerja',
                tone: 'info',
                message: 'Belum ada hari kerja tercatat untukmu di bulan ini.',
            };
        } else if (daysWithoutJobdesk > 0) {
            verdict = {
                key: 'missing',
                label: 'Ada jobdesk belum tercatat',
                tone: 'warning',
                message: `Ada ${daysWithoutJobdesk} hari kerja yang belum tercatat jobdesk-nya. Coba laporkan ke admin agar tidak terlewat.`,
            };
        } else if (diff > FAIR_BAND) {
            verdict = {
                key: 'above',
                label: 'Bebanmu di atas rata-rata',
                tone: 'warning',
                message: `Beban jobdesk harianmu ${diff} poin di atas rata-rata tim. Kalau terasa berat, sampaikan ke admin untuk penyeimbangan.`,
            };
        } else if (diff < -FAIR_BAND) {
            verdict = {
                key: 'below',
                label: 'Bebanmu di bawah rata-rata',
                tone: 'info',
                message: `Beban jobdesk harianmu ${Math.abs(diff)} poin di bawah rata-rata tim. Admin bisa menambah porsi agar lebih merata.`,
            };
        } else {
            verdict = {
                key: 'fair',
                label: 'Seimbang dengan tim',
                tone: 'success',
                message: 'Beban jobdesk harianmu seimbang dengan rata-rata tim.',
            };
        }

        return {
            userId,
            fullName: user.fullName,
            department: user.department,
            daysWorked,
            daysWithoutJobdesk,
            multiJobdeskDays,
            days,
            perJobdesk,
            totalJobdesk,
            roles: JOBDESK_ROLES.map(({ key, label, short, weight }) => ({ key, label, short, weight })),
            loadTotal: loadSum,
            loadPerDay,
            byDate,
            comparison,
            verdict,
        };
    }

    /**
     * Validasi + normalisasi parameter bulan "YYYY-MM".
     * @param {String} month
     * @returns {{year:Number, mon:Number, monthKey:String, startDate:Date, endDate:Date}}
     */
    parseMonthParam(month) {
        const match = /^(\d{4})-(\d{2})$/.exec(String(month ?? '').trim());
        if (!match) {
            throw new AppError('Format bulan tidak valid. Gunakan YYYY-MM.', 400, 'VALIDATION_ERROR');
        }
        const year = Number(match[1]);
        const mon = Number(match[2]);
        if (mon < 1 || mon > 12) {
            throw new AppError('Bulan harus antara 01 dan 12.', 400, 'VALIDATION_ERROR');
        }
        return {
            year,
            mon,
            monthKey: toMonthStr(year, mon),
            startDate: new Date(Date.UTC(year, mon - 1, 1)),
            endDate: new Date(Date.UTC(year, mon, 0, 23, 59, 59)),
        };
    }

    /**
     * Ambil SEMUA hari kerja staff Kitchen pada rentang tanggal tertentu.
     *
     * Ini satu-satunya query sumber rekap jobdesk (admin maupun personal), jadi
     * mustahil kedua sisi menampilkan angka yang berbeda. Hari tanpa jobdesk
     * tetap ikut terambil — dipakai untuk mendeteksi data bolong.
     *
     * @param {Date} startDate
     * @param {Date} endDate
     * @returns {Array} baris UserSchedule + user { id, fullName, department }
     */
    async fetchMonthKitchenSchedules(startDate, endDate) {
        return prisma.userSchedule.findMany({
            where: {
                date: { gte: startDate, lte: endDate },
                isOffDay: false,
                user: { department: 'KITCHEN', isActive: true },
            },
            include: { user: { select: { id: true, fullName: true, department: true } } },
            orderBy: [{ date: 'asc' }],
        });
    }

    /**
     * Rekap jobdesk MILIK SENDIRI untuk satu bulan — versi staff.
     *
     * Berbeda dari `getJobdeskFairness` (khusus admin) yang mengembalikan daftar
     * semua staff, method ini hanya mengembalikan satu orang: pemanggilnya.
     * Perbandingan tim tetap disertakan tetapi HANYA berupa angka agregat
     * (rata-rata/min/max beban harian), bukan rincian jobdesk rekan kerja.
     *
     * @param {String} month - format "YYYY-MM"
     * @param {Number} userId - id user yang sedang login
     * @returns {Object} rekap personal siap kirim
     */
    async getMyJobdeskSummary(month, userId) {
        const { monthKey, startDate, endDate } = this.parseMonthParam(month);

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, fullName: true, department: true },
        });
        if (!user) {
            throw new AppError('User tidak ditemukan.', 404, 'NOT_FOUND');
        }

        const schedules = await this.fetchMonthKitchenSchedules(startDate, endDate);
        const teammateRows = this._buildStaffRows(schedules);
        const summary = this.buildPersonalJobdeskSummary(userId, user, schedules, teammateRows);

        return {
            month: monthKey,
            generatedAt: new Date().toISOString(),
            ...summary,
        };
    }

    /**
     * Agregasi baris UserSchedule jadi satu entri per staff. Dipakai sebagai
     * pembanding tim pada rekap personal; rekap admin memakai agregasi yang sama
     * agar angka `loadPerDay` kedua sisi identik.
     *
     * @param {Array} schedules - baris dari fetchMonthKitchenSchedules
     * @returns {Array} entri staff dengan counts/loadTotal/loadPerDay
     */
    _buildStaffRows(schedules) {
        const perUser = new Map();
        for (const s of schedules) {
            if (!perUser.has(s.user.id)) {
                perUser.set(s.user.id, {
                    userId: s.user.id,
                    fullName: s.user.fullName,
                    daysWorked: 0,
                    daysWithoutJobdesk: 0,
                    multiJobdeskDays: 0,
                    counts: Object.fromEntries(JOBDESK_ROLES.map((r) => [r.key, 0])),
                    loadSum: 0,
                });
            }
            const entry = perUser.get(s.user.id);
            entry.daysWorked += 1;

            const roles = parseJobdeskRoles(s.kitchenStation);
            if (!roles.length) {
                entry.daysWithoutJobdesk += 1;
                continue;
            }

            if (roles.length > 1) entry.multiJobdeskDays += 1;
            let dayLoad = 0;
            for (const role of roles) {
                entry.counts[role.key] += 1;
                dayLoad += role.weight;
            }
            entry.loadSum += dayLoad;
        }

        return [...perUser.values()].map((e) => {
            // Jumlah jobdesk = Σ hari per jobdesk. Nilai rangkap dihitung per
            // jobdesk, jadi 'Checker / Stock + Plating' menyumbang 2.
            const totalJobdesk = Object.values(e.counts).reduce((a, b) => a + b, 0);
            const jobdeskTypes = Object.values(e.counts).filter((n) => n > 0).length;
            return {
                userId: e.userId,
                fullName: e.fullName,
                daysWorked: e.daysWorked,
                daysWithoutJobdesk: e.daysWithoutJobdesk,
                multiJobdeskDays: e.multiJobdeskDays,
                counts: e.counts,
                totalJobdesk,
                jobdeskTypes,
                // Beban total = Σ bobot jobdesk yang dipegang sebulan.
                loadTotal: e.loadSum,
                // Pembanding yang adil: beban per hari kerja, bukan beban total.
                loadPerDay: e.daysWorked ? Number((e.loadSum / e.daysWorked).toFixed(2)) : 0,
            };
        });
    }

    /**
     * Rekap keadilan jobdesk dapur untuk satu bulan.
     *
     * Berbeda dari rekap lama (yang selalu mengambil potongan pertama
     * `kitchen_station`), method ini:
     *
     *  1. Menghitung SEMUA jobdesk di dalam satu nilai rangkap, sehingga
     *     'Checker / Stock + Plating' menambah 1 hari Checker DAN 1 hari
     *     Plating — bukan hanya Checker.
     *  2. Memberi bobot beban A=5 … E=1 sesuai JOB_DESK_KITCHEN.md lalu memakai
     *     **beban rata-rata per hari kerja** sebagai pembanding. Penting karena
     *     jumlah hari kerja staff tidak sama (mis. 25 vs 29 hari); tanpa
     *     normalisasi ini staff yang lebih banyak masuk otomatis terlihat
     *     "paling berat" padahal beban hariannya ringan.
     *  3. Menandai jobdesk yang distribusinya timpang (selisih hari > 3, §4.4)
     *     serta staff yang jauh di atas/bawah rata-rata beban.
     *
     * READ-ONLY dan tidak bergantung pada rotationVersion, jadi tetap sah
     * untuk data lama maupun baru.
     *
     * @param {String} month - format "YYYY-MM"
     * @returns {Object} rekap siap kirim
     */
    async getJobdeskFairness(month) {
        const { monthKey, startDate, endDate } = this.parseMonthParam(month);

        // Semua hari kerja staff Kitchen bulan ini, terlepas jobdesk-nya terisi
        // atau belum — hari tanpa jobdesk dihitung sebagai data bolong.
        const schedules = await this.fetchMonthKitchenSchedules(startDate, endDate);

        const missingJobdesk = [];
        for (const s of schedules) {
            if (!parseJobdeskRoles(s.kitchenStation).length) {
                missingJobdesk.push({ date: toDateStr(s.date), userId: s.user.id, fullName: s.user.fullName });
            }
        }

        const staff = this._buildStaffRows(schedules);

        // ── Rata-rata per jobdesk + penanda timpang ──────────────────────────
        const byJobdesk = JOBDESK_ROLES.map((role) => {
            const values = staff.map((s) => s.counts[role.key] || 0);
            const max = values.length ? Math.max(...values) : 0;
            const min = values.length ? Math.min(...values) : 0;
            const total = values.reduce((a, b) => a + b, 0);
            return {
                key: role.key,
                label: role.label,
                short: role.short,
                weight: role.weight,
                total,
                min,
                max,
                spread: max - min,
                avg: staff.length ? Number((total / staff.length).toFixed(2)) : 0,
                // Timpang bila selisih hari antar staff melebihi ambang §4.4.
                isUneven: staff.length > 1 && max - min > FAIRNESS_GAP_THRESHOLD,
            };
        });

        // Urutkan dari beban harian terberat agar yang perlu diperiksa di atas.
        const sortedByLoad = [...staff].sort(
            (a, b) => b.loadPerDay - a.loadPerDay || b.loadTotal - a.loadTotal || a.fullName.localeCompare(b.fullName),
        );
        const topLoad = sortedByLoad[0] || null;
        const bottomLoad = sortedByLoad[sortedByLoad.length - 1] || null;
        const loadValues = staff.map((s) => s.loadPerDay);
        const loadAvg = loadValues.length
            ? Number((loadValues.reduce((a, b) => a + b, 0) / loadValues.length).toFixed(2))
            : 0;

        // Ambang "beban tidak seimbang": selisih beban harian > 1 poin penuh —
        // setara satu staff selalu Main Cook sementara lainnya selalu Runner.
        const loadSpread = staff.length > 1 ? Number((topLoad.loadPerDay - bottomLoad.loadPerDay).toFixed(2)) : 0;
        const isLoadUneven = loadSpread > 1;

        const unevenJobdesks = byJobdesk.filter((j) => j.isUneven);

        // ── Sorotan untuk ditampilkan di UI ─────────────────────────────────
        const highlights = [];

        if (!staff.length) {
            highlights.push({ type: 'info', message: 'Belum ada hari kerja Kitchen pada bulan ini.' });
        } else {
            if (isLoadUneven) {
                highlights.push({
                    type: 'warning',
                    message:
                        `Beban harian belum merata: ${topLoad.fullName} ${topLoad.loadPerDay} vs ` +
                        `${bottomLoad.fullName} ${bottomLoad.loadPerDay} (selisih ${loadSpread}).`,
                });
            }
            for (const j of unevenJobdesks) {
                highlights.push({
                    type: 'warning',
                    message: `Jobdesk ${j.label} timpang: paling banyak ${j.max}x, paling sedikit ${j.min}x (selisih ${j.spread} hari).`,
                });
            }
            const withGaps = staff.filter((s) => s.daysWithoutJobdesk > 0);
            if (withGaps.length) {
                const totalGaps = withGaps.reduce((a, s) => a + s.daysWithoutJobdesk, 0);
                highlights.push({
                    type: 'warning',
                    message: `${totalGaps} hari kerja belum punya jobdesk sama sekali (${withGaps
                        .map((s) => `${s.fullName} ${s.daysWithoutJobdesk}`)
                        .join(', ')}).`,
                });
            }
            if (!highlights.length) {
                highlights.push({ type: 'success', message: 'Distribusi jobdesk bulan ini sudah merata.' });
            }
        }

        return {
            month: monthKey,
            range: { from: toDateStr(startDate), to: toDateStr(endDate) },
            roles: JOBDESK_ROLES.map(({ key, label, short, weight }) => ({ key, label, short, weight })),
            staff: sortedByLoad,
            byJobdesk,
            summary: {
                staffCount: staff.length,
                totalWorkDays: staff.reduce((a, s) => a + s.daysWorked, 0),
                totalJobdesk: staff.reduce((a, s) => a + (s.totalJobdesk || 0), 0),
                totalJobdeskDays: staff.reduce((a, s) => a + Object.values(s.counts).reduce((x, y) => x + y, 0), 0),
                avgJobdeskPerStaff: staff.length
                    ? Number((staff.reduce((a, s) => a + (s.totalJobdesk || 0), 0) / staff.length).toFixed(1))
                    : 0,
                daysWithoutJobdesk: missingJobdesk.length,
                loadAvg,
                loadMin: bottomLoad ? bottomLoad.loadPerDay : 0,
                loadMax: topLoad ? topLoad.loadPerDay : 0,
                loadSpread,
                isLoadUneven,
                unevenJobdeskCount: unevenJobdesks.length,
                gapThreshold: FAIRNESS_GAP_THRESHOLD,
            },
            missingJobdesk,
            highlights,
        };
    }

    /**
     * Rangkuman JUMLAH jobdesk SELURUH pegawai dapur untuk satu bulan.
     *
     * Menjawab pertanyaan admin "pegawai ini sudah mengerjakan berapa jobdesk
     * bulan ini?". Berbeda dari `getJobdeskFairness` yang fokus membandingkan
     * keadilan beban, di sini yang ditonjolkan adalah jumlah/jenis jobdesk per
     * pegawai dan sebaran tiap jobdesk ke seluruh pegawai.
     *
     * Memakai `fetchMonthKitchenSchedules` + `_buildStaffRows` yang SAMA dengan
     * rekap keadilan dan rekap personal staff, jadi ketiga tampilan tidak mungkin
     * menampilkan angka yang berbeda.
     *
     * READ-ONLY.
     *
     * @param {String} month - format "YYYY-MM"
     * @returns {Object} rangkuman siap kirim
     */
    async getJobdeskSummary(month) {
        const { monthKey, startDate, endDate } = this.parseMonthParam(month);

        const schedules = await this.fetchMonthKitchenSchedules(startDate, endDate);

        // Urut dari yang paling banyak mengerjakan jobdesk bulan ini.
        const staff = this._buildStaffRows(schedules)
            .map((s) => ({
                ...s,
                byJobdesk: JOBDESK_ROLES
                    .map((r) => ({
                        key: r.key,
                        label: r.label,
                        short: r.short,
                        weight: r.weight,
                        count: s.counts[r.key] || 0,
                    }))
                    .filter((j) => j.count > 0)
                    .sort((a, b) => b.count - a.count || b.weight - a.weight),
            }))
            .sort((a, b) => b.totalJobdesk - a.totalJobdesk || a.fullName.localeCompare(b.fullName));

        // Sebaran tiap jobdesk ke seluruh pegawai (siapa paling sering dapat).
        const byJobdesk = JOBDESK_ROLES.map((r) => {
            const counts = staff.map((s) => s.counts[r.key] || 0);
            const top = staff.length
                ? staff.reduce((best, s) => ((s.counts[r.key] || 0) > (best.counts[r.key] || 0) ? s : best), staff[0])
                : null;
            return {
                key: r.key,
                label: r.label,
                short: r.short,
                weight: r.weight,
                total: counts.reduce((a, b) => a + b, 0),
                staffCount: counts.filter((n) => n > 0).length,
                max: counts.length ? Math.max(...counts) : 0,
                min: counts.length ? Math.min(...counts) : 0,
                topStaff: top
                    ? { userId: top.userId, fullName: top.fullName, count: top.counts[r.key] || 0 }
                    : null,
            };
        }).sort((a, b) => b.total - a.total || a.weight - b.weight);

        const totalJobdesk = staff.reduce((a, s) => a + s.totalJobdesk, 0);

        return {
            month: monthKey,
            range: { from: toDateStr(startDate), to: toDateStr(endDate) },
            roles: JOBDESK_ROLES.map(({ key, label, short, weight }) => ({ key, label, short, weight })),
            staff,
            byJobdesk,
            summary: {
                staffCount: staff.length,
                totalJobdesk,
                totalWorkDays: staff.reduce((a, s) => a + s.daysWorked, 0),
                avgJobdeskPerStaff: staff.length ? Number((totalJobdesk / staff.length).toFixed(1)) : 0,
                // staff sudah urut dari terbesar, jadi ujung array = paling sedikit.
                maxJobdeskPerStaff: staff.length ? staff[0].totalJobdesk : 0,
                minJobdeskPerStaff: staff.length ? staff[staff.length - 1].totalJobdesk : 0,
                daysWithoutJobdesk: staff.reduce((a, s) => a + s.daysWithoutJobdesk, 0),
                topStaff: staff.length
                    ? {
                        userId: staff[0].userId,
                        fullName: staff[0].fullName,
                        totalJobdesk: staff[0].totalJobdesk,
                    }
                    : null,
            },
        };
    }
}


module.exports = new ScheduleService();
