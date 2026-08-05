const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  console.log('Start seeding...');

  // Create Shifts
  // Use upsert to avoid error if they already exist (though migrate reset wipes them)
  const shift1 = await prisma.shift.upsert({
    where: { id: 1 },
    update: {},
    create: {
      name: 'Shift 1 (Pagi)',
      startTime: '08:00',
      endTime: '20:00',
    },
  });

  const shift2 = await prisma.shift.upsert({
    where: { id: 2 },
    update: {
      startTime: '11:00',
      endTime: '22:30',
    },
    create: {
      name: 'Shift 2 (Siang)',
      startTime: '11:00',
      endTime: '22:30',
    },
  });

  console.log('Shifts created:', { shift1, shift2 });

  // Create Admin
  const adminPassword = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      passwordHash: adminPassword,
      fullName: 'Administrator',
      email: 'admin@cafe.com',
      role: 'ADMIN',
      employeeId: 'ADM001',
      shiftId: shift1.id,
      department: 'BAR',
      offDay: 0,
      hourlyRate: 0,
    },
  });

  // Create Employee 1
  const employeePassword = await bcrypt.hash('123456', 10);
  const employee1 = await prisma.user.upsert({
    where: { username: 'akbar' },
    update: { shiftId: shift1.id },
    create: {
      username: 'akbar',
      passwordHash: employeePassword,
      fullName: 'Akbar Atori',
      email: 'akbar@cafe.com',
      role: 'EMPLOYEE',
      employeeId: 'EMP001',
      shiftId: shift1.id,
      department: 'BAR',
      offDay: 0,
      hourlyRate: 0,
    },
  });

  // Create Employee 2 (Shift Siang)
  const employee2 = await prisma.user.upsert({
    where: { username: 'budi' },
    update: { shiftId: shift2.id },
    create: {
      username: 'budi',
      passwordHash: employeePassword,
      fullName: 'Budi Santoso',
      email: 'budi@cafe.com',
      role: 'EMPLOYEE',
      employeeId: 'EMP002',
      shiftId: shift2.id,
      department: 'KITCHEN',
      offDay: 1,
      hourlyRate: 0,
    },
  });

  console.log('Users seeded:', { admin, employee1, employee2 });
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
