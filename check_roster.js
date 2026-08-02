const prisma = require('./backend/src/utils/database');

async function checkStaff() {
    const staff = await prisma.user.findMany({
        where: { department: 'KITCHEN', isActive: true },
        select: { id: true, fullName: true, department: true }
    });
    console.log('Active Kitchen Staff:', JSON.stringify(staff, null, 2));
}

checkStaff()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
