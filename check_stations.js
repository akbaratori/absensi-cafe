const prisma = require('./backend/src/utils/database');

async function check() {
    try {
        console.log('Checking UserSchedule for kitchenStation...');
        const count = await prisma.userSchedule.count({
            where: {
                kitchenStation: { not: null }
            }
        });
        console.log('Total Schedules with KitchenStation:', count);

        if (count > 0) {
            const sample = await prisma.userSchedule.findFirst({
                where: { kitchenStation: { not: null } },
                include: { user: true }
            });
            console.log('Sample Entry:', {
                user: sample.user.username,
                date: sample.date,
                station: sample.kitchenStation
            });
        } else {
            console.log('No kitchen stations assigned yet.');
        }
    } catch (e) {
        console.error('Error:', e);
    } finally {
        await prisma.$disconnect();
    }
}

check();
