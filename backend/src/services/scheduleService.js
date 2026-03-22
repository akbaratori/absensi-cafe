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
            baseOffDay = 0, // Sunday
            rotateOffDay = true
        } = options;

        const startDate = new Date(startDateStr);
        const endDate = new Date(startDate);
        endDate.setMonth(endDate.getMonth() + months);

        const schedules = [];
        let currentDate = new Date(startDate);
        let shiftIndex = 0;

        // For rotating off day logic
        let currentOffDay = baseOffDay;
        let lastMonth = currentDate.getMonth();

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
                // Normal Generation Logic
                const dayOfWeek = currentDate.getDay();
                const currentMonth = currentDate.getMonth();

                // Migrate off-day if month changed
                if (rotateOffDay && currentMonth !== lastMonth && currentOffDay !== -1) {
                    currentOffDay = (currentOffDay + 1) % 7;
                    lastMonth = currentMonth;
                }

                const isOffDay = currentOffDay !== -1 && dayOfWeek === currentOffDay;
                let shiftId = null;

                if (!isOffDay) {
                    // Week-based rotation
                    const diffTime = Math.abs(currentDate - startDate);
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    const weekIndex = Math.floor(diffDays / 7);

                    const patternIndex = weekIndex % shiftPattern.length;
                    shiftId = shiftPattern[patternIndex];
                }

                schedules.push({
                    userId,
                    date: new Date(currentDate),
                    shiftId: isOffDay ? null : shiftId,
                    isOffDay
                });
            }

            // Next day
            currentDate.setDate(currentDate.getDate() + 1);
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
        const operations = schedules.map(schedule =>
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

        const startDate = new Date(startDateStr);
        const endDate = new Date(endDateStr);
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(0, 0, 0, 0);

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
                const dayOfWeek = currentDate.getDay();
                const isOffDay = keepOffDays && user.offDay !== undefined && user.offDay !== -1 && dayOfWeek === user.offDay;

                allSchedules.push({
                    userId: user.id,
                    date: new Date(currentDate),
                    shiftId: isOffDay ? null : shiftId,
                    isOffDay: isOffDay
                });

                currentDate.setDate(currentDate.getDate() + 1);
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

            // Fetch existing schedules to respect OFF DAYS
            const existingSchedules = await prisma.userSchedule.findMany({
                where: {
                    userId: { in: kitchenStaff.map(u => u.id) },
                    date: { gte: startDate, lte: endDate }
                }
            });

            // Map: UserID -> DateString -> isOffDay
            const offDayMap = {};
            existingSchedules.forEach(s => {
                if (!offDayMap[s.userId]) offDayMap[s.userId] = {};
                const d = s.date.toISOString().split('T')[0];
                offDayMap[s.userId][d] = s.isOffDay;
            });

            // Anchor Date: February 1, 2026 (User defined "Correct Month")
            // This ensures rotation continues seamlessly from Feb 2026 onwards.
            const ANCHOR_DATE = new Date(2026, 1, 1); // Feb 1, 2026 (Month is 0-indexed)

            // Iterate Date by Date
            let current = new Date(start);

            // Define createData array
            const createData = [];

            while (current <= end) {
                const dateStr = current.toISOString().split('T')[0];

                // Calculate days passed since Anchor Date
                const diffTime = current.getTime() - ANCHOR_DATE.getTime();
                const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

                // Calculate Rotation for this Day (Daily Rolling)
                const staffCount = kitchenStaff.length;

                // Shift changes EVERY DAY by 2 people.
                // Handling negative modulo for dates before anchor
                const normalizedIndex = ((diffDays * 2) % staffCount + staffCount) % staffCount;

                const s1_index1 = normalizedIndex;
                const s1_index2 = (normalizedIndex + 1) % staffCount;

                const shift1UserIds = [
                    kitchenStaff[s1_index1].id,
                    kitchenStaff[s1_index2].id
                ];

                // Assign Shifts
                kitchenStaff.forEach(user => {
                    let isOff = false;
                    // Check map or default to User's configured Off Day
                    if (offDayMap[user.id] && offDayMap[user.id][dateStr] !== undefined) {
                        isOff = offDayMap[user.id][dateStr];
                    } else {
                        // Respect individual off day (default is 0/Sunday if not set)
                        isOff = current.getDay() === user.offDay;
                    }

                    let shiftId = 2; // Default to Shift 2 (Siang)
                    if (shift1UserIds.includes(user.id)) {
                        shiftId = 1; // Selected for Shift 1 (Pagi)
                    }

                    if (isOff) shiftId = null;

                    createData.push({
                        userId: user.id,
                        date: new Date(current),
                        shiftId: shiftId,
                        isOffDay: isOff
                    });
                });

                current.setDate(current.getDate() + 1);
            }

            // Execute Transaction (Delete then Create)
            await prisma.$transaction(async (tx) => {
                // Delete existing for this group & date range
                const deleted = await tx.userSchedule.deleteMany({
                    where: {
                        userId: { in: kitchenStaff.map(u => u.id) },
                        date: { gte: start, lte: end }
                    }
                });
                console.log(`[ScheduleService] Deleted ${deleted.count} existing kitchen records.`);

                // createMany
                // Using chunking just in case
                const CHUNK_SIZE = 50;
                for (let i = 0; i < createData.length; i += CHUNK_SIZE) {
                    await tx.userSchedule.createMany({
                        data: createData.slice(i, i + CHUNK_SIZE),
                        skipDuplicates: true
                    });
                }
            });

            // --- STATION ASSIGNMENT LOGIC ---
            // After transactions, assign daily stations
            // Iterate day by day again
            current = new Date(start);
            while (current <= end) {
                // We need to fetch the inserted data or filter from createData
                // Filtering createData is faster but we need to ensure we only process WORKING people
                const daySchedules = createData.filter(d => d.date.getTime() === current.getTime() && !d.isOffDay && d.shiftId);

                // Assign across all staff working today linearly so all 5 roles rotate perfectly
                const allStaffIds = daySchedules.map(s => s.userId);
                await this.assignDailyStations(current, allStaffIds, weeklyPicId);

                current.setDate(current.getDate() + 1);
            }

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
            const allKitchenStaff = await prisma.user.findMany({
                where: { department: 'KITCHEN', isActive: true },
                orderBy: { id: 'asc' },
                select: { id: true }
            });
            const kitchenStaffIds = allKitchenStaff.map(u => u.id);

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
                await this.assignDailyStations(current, allStaffIds, weeklyPicId);

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
        const { shiftId, isOffDay } = data;

        return await prisma.userSchedule.update({
            where: { id: scheduleId },
            data: {
                shiftId: isOffDay ? null : shiftId,
                isOffDay: isOffDay,
                kitchenStation: isOffDay ? null : undefined // Clear station if OFF
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
        const startDate = new Date(startDateStr);
        const endDate = new Date(startDate);
        endDate.setMonth(endDate.getMonth() + months);

        let currentDate = new Date(startDate);
        let currentOffDay = parseInt(baseOffDay);
        let lastMonth = currentDate.getMonth();

        const proposedOffDates = [];

        while (currentDate < endDate) {
            if (baseOffDay === -2) {
                // Full Off Mode: Every day is off
                proposedOffDates.push(new Date(currentDate));
            } else {
                // Normal Mode
                const dayOfWeek = currentDate.getDay();
                const currentMonth = currentDate.getMonth();

                if (rotateOffDay && currentMonth !== lastMonth && currentOffDay !== -1) {
                    currentOffDay = (currentOffDay + 1) % 7;
                    lastMonth = currentMonth;
                }

                if (currentOffDay !== -1 && dayOfWeek === currentOffDay) {
                    proposedOffDates.push(new Date(currentDate));
                }
            }
            currentDate.setDate(currentDate.getDate() + 1);
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
    async assignDailyStations(date, staffIds, weeklyPicId) {
        if (!staffIds || staffIds.length === 0) return;

        // 1. Prepare Staff Pool (Sort by ID for consistent ordering)
        let availableStaff = [...staffIds].sort((a, b) => a - b);

        // 2. Calculate deterministic rotation based on Anchor Date
        const ANCHOR_DATE = new Date(2026, 1, 1);
        const diffTime = Math.abs(date.getTime() - ANCHOR_DATE.getTime());
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

        // Shift array by `diffDays % availableStaff.length`
        const shiftAmount = diffDays % availableStaff.length;
        const rotatedStaff = [...availableStaff.slice(shiftAmount), ...availableStaff.slice(0, shiftAmount)];

        const newAssignments = []; 

        // 3. Assign based on Priority Order (A, B, C, D, E)
        for (let i = 0; i < rotatedStaff.length; i++) {
            if (i < PRIORITY_ORDER.length) {
                let station = PRIORITY_ORDER[i];
                let userId = rotatedStaff[i];

                // --- RULE: PIC Stok cannot hold Role A (Main Cook) ---
                if (userId === weeklyPicId && station.startsWith('A - Main Cook')) {
                    // Swap with the next person in line (Role B) if possible
                    if (i + 1 < rotatedStaff.length && i + 1 < PRIORITY_ORDER.length) {
                        const temp = rotatedStaff[i];
                        rotatedStaff[i] = rotatedStaff[i + 1];
                        rotatedStaff[i + 1] = temp;
                        userId = rotatedStaff[i]; // Update to the newly swapped user
                    }
                }

                newAssignments.push({ userId, station });
            }
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
