const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  const password = 'Akari@2026';
  const passwordHash = await bcrypt.hash(password, 10);
  
  try {
    const user = await prisma.user.upsert({
      where: { username: 'akari' },
      update: { 
        passwordHash,
        fullName: 'Akari',
        email: 'akari@absensi-cafe.com',
        role: 'ADMIN',
        isActive: true,
        updatedAt: new Date()
      },
      create: {
        username: 'akari',
        passwordHash,
        fullName: 'Akari',
        email: 'akari@absensi-cafe.com',
        role: 'ADMIN',
        employeeId: 'AKR-001',
        department: 'ADMIN',
        offDay: 0,
        hourlyRate: 0,
        isActive: true
      }
    });
    
    console.log('✅ User created/updated:', user);
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
