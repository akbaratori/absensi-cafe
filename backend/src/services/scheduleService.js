const { ErrorCodes } = require('../utils/AppError');
const prisma = require('../utils/database');
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

        for (const user of users) {
            let currentDate = new Date(startDate);

            while (currentDate <= endDate) {
                const dayOfWeek = currentDate.getUTCDay();
                const isOffDay = keepOffDays && user.offDay !== undefined && user.offDay !== -1 && dayOfWeek === user.offDay;

                allSchedules.push({
                    userId: user.id,
                    date: new Date(currentDate),
                    shiftId: isOffDay ? null : shiftId,
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
                        isOff = current.getDay() === user.offDay;
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
        return await prisma.userSchedule.findMany({
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

    async getTodaySchedule(userId) {
        // Gunakan WITA (UTC+8) untuk menentukan "hari ini",
        // agar jadwal yang tersimpan di database (dengan timezone WITA) cocok.
        const WITA_OFFSET_MS = 8 * 60 * 60 * 1000;
        const nowWITA = new Date(Date.now() + WITA_OFFSET_MS);
        const witaDateStr = nowWITA.toISOString().slice(0, 10); // "YYYY-MM-DD" dalam WITA
        const today = new Date(`${witaDateStr}T00:00:00+08:00`);

        return await prisma.userSchedule.findUnique({
            where: {
                userId_date: {
                    userId,
                    date: today
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
        const { shiftId, isOffDay, kitchenStation } = data;

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
        const { userId, date, shiftId, isOffDay, kitchenStation } = data;
        
        // Parse date as UTC midnight — consistent with how all other schedules are stored
        // new Date("2026-04-30") → 2026-04-30T00:00:00.000Z (UTC midnight) ✓
        const scheduleDate = new Date(date);

        const upsertData = {
            shiftId: isOffDay ? null : (shiftId ? parseInt(shiftId) : null),
            isOffDay: Boolean(isOffDay),
            kitchenStation: isOffDay ? null : (kitchenStation === '' ? null : kitchenStation),
            isManualOverride: true, // flag: protect from rolling distribution overwrite
        };

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
     * Get a summary of how many times each employee was assigned each station in a month
     * @param {string} month - Format: "YYYY-MM"
     * @returns {Array} - Summary per employee
     */
    async getStationSummary(month) {
        const [year, mon] = month.split('-').map(Number);
        const startDate = new Date(year, mon - 1, 1);
        const endDate = new Date(year, mon, 0, 23, 59, 59); // Last day of month

        // Fetch all working-day schedules (not OFF) for KITCHEN staff this month
        const schedules = await prisma.userSchedule.findMany({
            where: {
                date: { gte: startDate, lte: endDate },
                isOffDay: false,
                kitchenStation: { not: null },
                user: { department: 'KITCHEN', isActive: true }
            },
            include: {
                user: { select: { id: true, fullName: true } }
            },
            orderBy: { date: 'asc' }
        });

        // Build summary map: { userId: { fullName, stations: { stationName: count }, extra: { picStok, shiftPic, sanitation } } }
        const summaryMap = {};

        for (const s of schedules) {
            const uid = s.user.id;
            if (!summaryMap[uid]) {
                summaryMap[uid] = {
                    userId: uid,
                    fullName: s.user.fullName,
                    stations: {},
                    picStokCount: 0,
                    shiftPicCount: 0,
                    sanitationCount: 0,
                    totalWorkDays: 0
                };
            }

            const entry = summaryMap[uid];
            entry.totalWorkDays++;

            // Count base station (strip " + Dishwasher" suffix if any)
            const baseStation = s.kitchenStation.split(' + ')[0].trim();
            entry.stations[baseStation] = (entry.stations[baseStation] || 0) + 1;

            // Count extra roles
            if (s.isInventoryController) entry.picStokCount++;
            if (s.isShiftPic) entry.shiftPicCount++;
            if (s.isSanitationLead) entry.sanitationCount++;
        }

        return Object.values(summaryMap).sort((a, b) => a.fullName.localeCompare(b.fullName));
    }
}


module.exports = new ScheduleService();
