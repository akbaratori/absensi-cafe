// Vercel Cron Job: Auto Clock-Out
// Runs every 15 minutes to clock-out stale attendance records

// Force production mode
process.env.NODE_ENV = 'production';
if (process.env.POSTGRES_PRISMA_URL) {
  process.env.DATABASE_URL = process.env.POSTGRES_PRISMA_URL;
}

const { PrismaClient } = require('../../backend/node_modules/@prisma/client');
const prisma = new PrismaClient();

module.exports = async function handler(req, res) {
  // Verify this is called by Vercel Cron (security)
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    // Allow if CRON_SECRET not set (for simplicity)
    if (process.env.CRON_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  try {
    let autoClockoutHours = 10;
    try {
      const cfg = await prisma.systemConfig.findUnique({ where: { key: 'autoClockoutHours' } });
      if (cfg) autoClockoutHours = parseInt(cfg.value, 10) || 10;
    } catch (e) { /* use default */ }

    const thresholdTime = new Date(Date.now() - autoClockoutHours * 60 * 60 * 1000);

    const staleRecords = await prisma.attendance.findMany({
      where: {
        clockOut: null,
        clockIn: { lt: thresholdTime },
      },
      include: {
        user: { select: { id: true, fullName: true } }
      }
    });

    if (staleRecords.length === 0) {
      return res.json({ message: 'No stale records found', processed: 0 });
    }

    let processed = 0;
    for (const record of staleRecords) {
      const autoClockOut = new Date(record.clockIn.getTime() + autoClockoutHours * 60 * 60 * 1000);

      await prisma.attendance.update({
        where: { id: record.id },
        data: {
          clockOut: autoClockOut,
          notes: record.notes
            ? `${record.notes} | [Auto clock-out oleh sistem]`
            : '[Auto clock-out oleh sistem]',
        },
      });

      // Audit log
      await prisma.auditLog.create({
        data: {
          userId: null,
          action: 'AUTO_CLOCKOUT',
          entityType: 'ATTENDANCE',
          entityId: String(record.id),
          details: JSON.stringify({ userId: record.userId, clockOutTime: autoClockOut.toISOString() }),
        },
      });

      processed++;
    }

    return res.json({ message: `Auto clocked-out ${processed} records`, processed });
  } catch (error) {
    console.error('[Cron:AutoClockout] Error:', error.message);
    return res.status(500).json({ error: error.message });
  } finally {
    await prisma.$disconnect();
  }
};
