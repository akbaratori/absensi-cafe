const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const prisma = new PrismaClient();

async function main() {
    const user = await prisma.user.findUnique({
        where: { username: 'admin' },
        select: { id: true, username: true, passwordHash: true, isActive: true, role: true }
    });

    if (!user) {
        console.log('ERROR: Admin user not found in database!');
        return;
    }

    console.log('User found:', { id: user.id, username: user.username, role: user.role, isActive: user.isActive });
    console.log('Hash starts with:', user.passwordHash.substring(0, 10));

    const isValid = await bcrypt.compare('admin123', user.passwordHash);
    console.log('Password "admin123" valid:', isValid);

    // Also check what DB we're connected to
    const result = await prisma.$queryRaw`SELECT current_database(), current_user`;
    console.log('Connected to:', result);
}

main().then(() => prisma.$disconnect()).catch(e => { console.error(e.message); prisma.$disconnect(); });
