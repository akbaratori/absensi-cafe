const prisma = require('./src/utils/database');

async function checkSchedules() {
    try {
        const users = await prisma.user.findMany({
            orderBy: { createdAt: 'desc' },
            take: 5,
            include: {
                schedules: {
                    orderBy: { date: 'desc' },
                    take: 5
                }
            }
        });

        console.log('--- RECENT USERS & SCHEDULES ---');
        users.forEach(u => {
            console.log(`User: ${u.fullName} (ID: ${u.id}, Dept: ${u.department})`);
            console.log(`Schedules Count: ${u.schedules.length}`);
            if (u.schedules.length > 0) {
                console.log('Latest Schedule:', u.schedules[0]);
            } else {
                console.log('No schedules found.');
            }
            console.log('-------------------');
        });
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

checkSchedules();
