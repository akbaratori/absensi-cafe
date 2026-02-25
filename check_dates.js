const prisma = require('./backend/src/utils/database');

async function checkDates() {
    try {
        console.log('Checking UserSchedule DATES for Kitchen context...');

        // Find a few recent schedules
        const samples = await prisma.userSchedule.findMany({
            take: 3,
            orderBy: { id: 'desc' },
            include: { user: true }
        });

        console.log('Sample Dates in DB:');
        samples.forEach(s => {
            console.log(`ID: ${s.id}, User: ${s.user.username}, Date: ${s.date} (Type: ${typeof s.date}), ISO: ${s.date.toISOString()}`);
        });

    } catch (e) {
        console.error('Error:', e);
    } finally {
        await prisma.$disconnect();
    }
}

checkDates();
