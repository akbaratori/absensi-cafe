const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  const swap = await prisma.shiftSwap.update({
    where: { id: 6 },
    data: {
      status: 'CANCELLED',
      rejectionNote: 'Dibatalkan manual: sistem gagal memvalidasi pengajuan.',
    },
  });
  console.log('Cancelled swap #6:', swap.status);
  await prisma.$disconnect();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
