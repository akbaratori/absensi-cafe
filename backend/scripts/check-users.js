const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
    const users = await prisma.user.findMany({
        select: { id: true, username: true, role: true, isActive: true, passwordHash: true }
    });

    console.log('=== Users in database ===');
    for (const u of users) {
        // Test password against common defaults
        const testAdmin = await bcrypt.compare('admin123', u.passwordHash);
        const test123456 = await bcrypt.compare('123456', u.passwordHash);
        console.log(`ID:${u.id} | ${u.username} | ${u.role} | active:${u.isActive} | admin123:${testAdmin} | 123456:${test123456}`);
    }
}

main()
    .then(() => prisma.$disconnect())
    .catch(e => { console.error(e); prisma.$disconnect(); });
