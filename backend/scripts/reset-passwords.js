const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
    const newHash = await bcrypt.hash('123456', 10);

    const result = await prisma.user.updateMany({
        where: { role: 'EMPLOYEE' },
        data: { passwordHash: newHash }
    });

    console.log(`Reset password ${result.count} employee ke '123456'`);
}

main()
    .then(() => prisma.$disconnect())
    .catch(e => { console.error(e); prisma.$disconnect(); });
