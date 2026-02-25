const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
    const hashedPassword = await bcrypt.hash('password123', 10);

    // Check if employee exists
    const employee = await prisma.user.upsert({
        where: { username: 'employee' },
        update: {},
        create: {
            username: 'employee',
            passwordHash: hashedPassword,
            fullName: 'Budi Santoso',
            role: 'EMPLOYEE',
            employeeId: 'EMP001',
            shift: 'SHIFT_1', // Pagi
            isActive: true
        },
    });

    const employee2 = await prisma.user.upsert({
        where: { username: 'employee2' },
        update: {},
        create: {
            username: 'employee2',
            passwordHash: hashedPassword,
            fullName: 'Siti Aminah',
            role: 'EMPLOYEE',
            employeeId: 'EMP002',
            shift: 'SHIFT_2', // Siang
            isActive: true
        },
    });

    console.log({ employee, employee2 });
}

main()
    .then(async () => {
        await prisma.$disconnect();
    })
    .catch(async (e) => {
        console.error(e);
        await prisma.$disconnect();
        process.exit(1);
    });
