const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  const swaps = await prisma.shiftSwap.findMany({
    where: { status: { in: ['PENDING_VALIDATION', 'PENDING_TARGET_RESPONSE', 'PENDING_APPROVAL'] } },
    select: { id: true, requesterId: true, targetUserId: true, date: true, status: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  console.log('Pending swaps count:', swaps.length);
  console.log(JSON.stringify(swaps, null, 2));
  await prisma.$disconnect();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
