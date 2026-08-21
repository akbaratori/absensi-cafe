const RotationService = require('./backend/src/services/rotationService');
const prisma = require('./backend/src/utils/database');

async function testManualOffDay() {
  console.log('--- Prisma check ---');
  console.log('Prisma manualOffDay exists:', !!prisma.manualOffDay);
  console.log('--- Memulai Test Skenario Manual OffDay ---');
  
  // Skenario 1: Test Block (Tanpa data manual)
  try {
    console.log('Test 1: Generate tanpa konfirmasi libur manual...');
    await RotationService.generateWeek(1, '2026-08-25');
    console.log('❌ Test 1 Gagal: Generator seharusnya melempar error.');
  } catch (err) {
    if (err.message.includes('Harap konfirmasi libur manual')) {
      console.log('✅ Test 1 Berhasil: Generator terblokir dengan benar.');
    } else {
      console.log('❌ Test 1 Gagal: Error yang diterima salah (' + err.message + ')');
    }
  }

  // Skenario 2: Test Sukses (Dengan data manual)
  try {
    console.log('\nTest 2: Generate dengan konfirmasi libur manual...');
    await prisma.manualOffDay.create({
      data: {
        userId: 1,
        date: new Date('2026-08-26'),
        weekStart: new Date('2026-08-25')
      }
    });

    const res = await RotationService.generateWeek(1, '2026-08-25');
    console.log('✅ Test 2 Berhasil: Generator berjalan normal.');
    
    // Cleanup
    await prisma.manualOffDay.deleteMany({ where: { weekStart: new Date('2026-08-25') } });
  } catch (err) {
    console.log('❌ Test 2 Gagal: ' + err.message);
  }
}

testManualOffDay().finally(() => prisma.$disconnect());