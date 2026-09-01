const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  // Cancel swaps stuck in PENDING_VALIDATION for more than 1 hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const stuckSwaps = await prisma.shiftSwap.findMany({
    where: {
      status: 'PENDING_VALIDATION',
      createdAt: { lt: oneHourAgo },
    },
  });

  console.log(`Found ${stuckSwaps.length} stuck swaps to cancel`);

  for (const swap of stuckSwaps) {
    await prisma.shiftSwap.update({
      where: { id: swap.id },
      data: {
        status: 'CANCELLED',
        rejectionNote: 'Dibatalkan otomatis: sistem gagal memvalidasi pengajuan.',
      },
    });
    console.log(`Cancelled swap #${swap.id} (date: ${swap.date.toISOString().slice(0, 10)})`);
  }

  // Also cleanup past swaps that are still pending (date already passed)
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const pastSwaps = await prisma.shiftSwap.findMany({
    where: {
      status: { in: ['PENDING_VALIDATION', 'PENDING_TARGET_RESPONSE', 'PENDING_APPROVAL'] },
      date: { lt: today },
    },
  });

  console.log(`Found ${pastSwaps.length} past swaps to cancel`);

  for (const swap of pastSwaps) {
    await prisma.shiftSwap.update({
      where: { id: swap.id },
      data: {
        status: 'CANCELLED',
        rejectionNote: 'Dibatalkan otomatis: tanggal pengajuan sudah lewat.',
      },
    });
    console.log(`Cancelled past swap #${swap.id} (date: ${swap.date.toISOString().slice(0, 10)})`);
  }

  await prisma.$disconnect();
  console.log('Cleanup completed');
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
