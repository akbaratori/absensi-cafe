const prisma = require('./backend/src/utils/database');

async function debugConflicts() {
    try {
        console.log("Checking for schedules in Feb 2026...");

        const startDate = new Date('2026-02-01');
        const endDate = new Date('2026-03-01');

        const schedules = await prisma.userSchedule.findMany({
            where: {
                date: {
                    gte: startDate,
                    lt: endDate
                },
                isOffDay: true
            },
            include: {
                user: {
                    select: {
                        id: true,
                        fullName: true,
                        department: true
                    }
                }
            }
        });

        console.log(`Found ${schedules.length} OFF schedules in Feb 2026.`);

        const byDept = {};
        schedules.forEach(s => {
            const dept = s.user.department || 'Unassigned';
            if (!byDept[dept]) byDept[dept] = [];
            byDept[dept].push(`${s.date.toISOString().split('T')[0]} - ${s.user.fullName} (ID: ${s.user.id})`);
        });

        Object.keys(byDept).forEach(dept => {
            console.log(`\nDepartment: ${dept}`);
            byDept[dept].forEach(entry => console.log(entry));
        });

    } catch (error) {
        console.error("Error:", error);
    } finally {
        await prisma.$disconnect();
    }
}

debugConflicts();
