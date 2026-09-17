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

  // Create Positions
  //
  // Kitchen WAJIB ber-id 2. Laporan bulanan jobdesk Kitchen
  // (rotationService.getKitchenJobdeskMonthlyReport) memfilter posisi dengan
  // `name in ['Kitchen','Dapur']` DAN `id`, dan tests/kitchenJobdeskReport.test.js
  // memanggilnya dengan positionId=2. Di produksi posisi ini dibuat oleh
  // scripts/setup-kitchen-position.js tanpa id eksplisit, jadi id=2 di sana
  // adalah hasil auto-increment — bukan kontrak. Fixture ini menetapkan id
  // secara eksplisit supaya database yang dibangun dari migrasi punya id yang
  // sama, sehingga test tidak bergantung pada urutan insert.
  const existingId2 = await prisma.position.findUnique({ where: { id: 2 } });
  if (existingId2 && existingId2.name !== 'Kitchen') {
    throw new Error(
      `Position id=2 sudah dipakai oleh "${existingId2.name}", bukan "Kitchen". `
      + 'tests/kitchenJobdeskReport.test.js mengharapkan positionId=2 = Kitchen. '
      + 'Periksa data posisi di database ini sebelum menjalankan seed.',
    );
  }

  const kitchenPosition = await prisma.position.upsert({
    where: { id: 2 },
    update: {},
    create: {
      id: 2,
      name: 'Kitchen',
      shift1Capacity: 2, // tidak dipakai selama scheduleAllWorking aktif
      shift2Capacity: 2,
      scheduleAllWorking: true,
    },
  });

  console.log('Position created:', { id: kitchenPosition.id, name: kitchenPosition.name });

  // Jobdesk default Kitchen — daftar sama dengan scripts/setup-kitchen-position.js.
  // Unique key gabungan (positionId, name) membuat upsert idempoten.
  const kitchenJobdesks = ['Main Cook', 'Support/Snack', 'Checker/Stock', 'Runner/Area', 'Helper/Floating'];
  for (const [orderIndex, name] of kitchenJobdesks.entries()) {
    await prisma.positionJobdesk.upsert({
      where: { positionId_name: { positionId: kitchenPosition.id, name } },
      update: {},
      create: {
        positionId: kitchenPosition.id,
        name,
        orderIndex,
        isHeavy: name === 'Main Cook', // pemegangnya tidak boleh rangkap jobdesk lain
      },
    });
  }

  console.log('Kitchen jobdesks seeded:', kitchenJobdesks.length);

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
