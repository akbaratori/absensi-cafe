const prisma = require('./backend/src/utils/database');

async function distributeKitchenShiftsWithoutApi(monthStr) {
    try {
        console.log(`\n--- Distributing Kitchen Shifts for ${monthStr} ---`);

        // 1. Setup Dates
        const [year, month] = monthStr.split('-').map(Number);
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0);

        // Calculate Previous Month for Debt Logic
        const prevMonthDate = new Date(startDate);
        prevMonthDate.setMonth(prevMonthDate.getMonth() - 1);
        const prevDateStr = prevMonthDate.toISOString().slice(0, 7);

        console.log(`Target: ${startDate.toDateString()} to ${endDate.toDateString()}`);
        console.log(`Previous Month for Debt Check: ${prevDateStr}`);

        // 2. Get Kitchen Staff
        const kitchenStaff = await prisma.user.findMany({
            where: { department: 'KITCHEN', isActive: true },
            select: { id: true, fullName: true }
        });

        if (kitchenStaff.length === 0) {
            console.log('No kitchen staff found.');
            return;
        }

        console.log(`Found ${kitchenStaff.length} Kitchen Staff: ${kitchenStaff.map(u => u.fullName).join(', ')}`);

        // 3. Get Existing Schedules (to preserve Off Days)
        const allSchedules = await prisma.userSchedule.findMany({
            where: {
                date: { gte: startDate, lte: endDate },
                user: { department: 'KITCHEN' }
            }
        });

        // 4. Distribution Logic
        const TARGET_SHIFT_2 = 2;
        const operations = [];

        for (const user of kitchenStaff) {
            // A. Check Debt from Previous Month
            const prevSchedules = await prisma.userSchedule.findMany({
                where: {
                    userId: user.id,
                    date: {
                        gte: new Date(prevMonthDate.getFullYear(), prevMonthDate.getMonth(), 1),
                        lt: startDate
                    },
                    shiftId: 2 // Shift 2 (Siang)
                }
            });

            const prevCount = prevSchedules.length;
            const debt = Math.max(0, TARGET_SHIFT_2 - prevCount);
            const userTarget = TARGET_SHIFT_2 + debt;

            console.log(`\nUser: ${user.fullName}`);
            console.log(`   - Prev Month Shift 2: ${prevCount}`);
            console.log(`   - Debt: ${debt}`);
            console.log(`   - Target This Month: ${userTarget}`);

            // B. Identify Working Days in Current Month
            const userSchedules = allSchedules.filter(s => s.userId === user.id);
            const scheduleMap = {}; // date -> isOffDay
            userSchedules.forEach(s => scheduleMap[s.date.toISOString().split('T')[0]] = s.isOffDay);

            let current = new Date(startDate);
            const workingDays = [];

            while (current <= endDate) {
                const dStr = current.toISOString().split('T')[0];
                let isOff = false;
                if (scheduleMap[dStr] !== undefined) isOff = scheduleMap[dStr];
                else isOff = current.getDay() === 0; // Fallback Sunday

                if (!isOff) workingDays.push(dStr);
                current.setDate(current.getDate() + 1);
            }

            // C. Assign Shift 2 Randomly
            // Note: In a real advanced solver, we would check "Max 3 people per day" here.
            // For now, with 5 people and low target (2-4), random distribution usually works fine.
            // Improve: Shuffle working days
            const shuffled = workingDays.sort(() => 0.5 - Math.random());
            const selectedDates = shuffled.slice(0, userTarget);

            console.log(`   - Assigned Shift 2 on: ${selectedDates.join(', ')}`);

            // D. Prepare Create Data (Batch)
            current = new Date(startDate);
            const userCreates = [];

            while (current <= endDate) {
                const dStr = current.toISOString().split('T')[0];
                let isOff = false;
                if (scheduleMap[dStr] !== undefined) isOff = scheduleMap[dStr];
                else isOff = current.getDay() === 0;

                let shiftId = 1; // Default Shift 1
                if (selectedDates.includes(dStr)) shiftId = 2; // Selected for Shift 2
                if (isOff) shiftId = null;

                userCreates.push({
                    userId: user.id,
                    date: new Date(current),
                    shiftId: shiftId,
                    isOffDay: isOff
                });

                current.setDate(current.getDate() + 1);
            }
            operations.push(...userCreates); // Store for batch create
        }

        // 5. Execute
        // A. Delete Existing for Kitchen in this month
        console.log(`Deleting existing schedules for ${kitchenStaff.length} users in target month...`);
        await prisma.userSchedule.deleteMany({
            where: {
                userId: { in: kitchenStaff.map(u => u.id) },
                date: { gte: startDate, lte: endDate }
            }
        });

        // B. Create New
        console.log(`Creating ${operations.length} new schedule records...`);
        // Note: createMany is not supported in SQLite, but usually works in MySQL/Postgres. 
        // If SQLite, we must use loop of creates. Assuming MySQL based on XAMPP.
        // But to be safe for all Prisma adapters (some don't support createMany), let's use transaction of creates?
        // Actually, createMany is efficient. Let's try it. If it fails, fallback.
        // Wait, 'userSchedules' is the model.

        // Chunking to be safe
        const CHUNK_SIZE = 50;
        for (let i = 0; i < operations.length; i += CHUNK_SIZE) {
            const chunk = operations.slice(i, i + CHUNK_SIZE);
            await prisma.userSchedule.createMany({
                data: chunk,
                skipDuplicates: true // Just in case
            });
        }

        console.log("Success! Distribution Complete.");

    } catch (error) {
        console.error("Error:", error);
    } finally {
        await prisma.$disconnect();
    }
}

// Run for Feb 2026
distributeKitchenShiftsWithoutApi('2026-02');
