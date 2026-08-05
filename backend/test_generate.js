const scheduleService = require('./src/services/scheduleService');
const prisma = require('./src/utils/database');

async function testGenerate() {
    try {
        // Find the user Asraf (ID 8)
        const user = await prisma.user.findFirst({
            where: { department: 'BAR' } // adjusting to find a user
        });

        if (!user) {
            console.log('No user found');
            return;
        }

        console.log(`Testing schedule generation for user: ${user.fullName} (${user.id})`);

        const startDate = new Date().toISOString().split('T')[0];
        const months = 1;
        const subOptions = {
            shiftPattern: [1],
            baseOffDay: 0,
            rotateOffDay: true
        };

        console.log('Params:', { userId: user.id, startDate, months, subOptions });

        const result = await scheduleService.generateSchedule(user.id, startDate, months, subOptions);
        console.log('Success! Schedules generated:', result.length);

    } catch (error) {
        console.error('GENERATION FAILED:');
        console.error(error);
    } finally {
        await prisma.$disconnect();
    }
}

testGenerate();
