const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const users = await prisma.user.findMany({ select: { id: true, username: true, role: true, employeeId: true } });
    console.log('Users in Neon DB:');
    console.log(JSON.stringify(users, null, 2));
    console.log(`Total: ${users.length}`);
}

main().then(() => prisma.$disconnect()).catch(e => { console.error(e.message); prisma.$disconnect(); });
