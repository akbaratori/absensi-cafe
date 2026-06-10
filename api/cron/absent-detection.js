// Vercel Cron Job: Absent Detection
// Runs daily at 23:50 WITA (15:50 UTC) to mark absent employees

// Force production mode
process.env.NODE_ENV = 'production';
if (process.env.POSTGRES_PRISMA_URL) {
  process.env.DATABASE_URL = process.env.POSTGRES_PRISMA_URL;
}

const { PrismaClient } = require('../../backend/node_modules/@prisma/client');
const prisma = new PrismaClient();

const WITA_OFFSET_MS = 8 * 60 * 60 * 1000;

module.exports = async function handler(req, res) {
  // Verify this is called by Vercel Cron (security)
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    if (process.env.CRON_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  try {
    const nowWITA = new Date(Date.now() + WITA_OFFSET_MS);
    const witaDateStr = nowWITA.toISOString().slice(0, 10);
    const todayStart = new Date(`${witaDateStr}T00:00:00+08:00`);
    const todayEnd = new Date(`${witaDateStr}T23:59:59+08:00`);

    // Check if today is a public holiday
    const isPublicHoliday = await prisma.publicHoliday.findFirst({
      where: { date: { gte: todayStart, lte: todayEnd } }
    });
    if (isPublicHoliday) {
      return res.json({ message: `Skipped — public holiday: ${isPublicHoliday.name}`, processed: 0 });
    }

    const employees = await prisma.user.findMany({
      where: { isActive: true, role: 'EMPLOYEE' },
      select: { id: true, fullName: true, offDay: true }
    });

    const attendanceToday = await prisma.attendance.findMany({
      where: { date: { gte: todayStart, lte: todayEnd } },
      select: { userId: true }
    });
    const clockedInUserIds = new Set(attendanceToday.map(a => a.userId));

    const approvedLeaves = await prisma.leave.findMany({
      where: {
        status: 'APPROVED',
        startDate: { lte: todayEnd },
        endDate: { gte: todayStart }
      },
      select: { userId: true }
    });
    const onLeaveUserIds = new Set(approvedLeaves.map(l => l.userId));

    const schedules = await prisma.userSchedule.findMany({
      where: {
        date: { gte: todayStart, lte: todayEnd },
        isOffDay: true
      },
      select: { userId: true }
    });
    const offDayUserIds = new Set(schedules.map(s => s.userId));

    const dayOfWeek = nowWITA.getDay();
    let absentCount = 0;

    for (const emp of employees) {
      if (clockedInUserIds.has(emp.id)) continue;
      if (onLeaveUserIds.has(emp.id)) continue;
      if (offDayUserIds.has(emp.id)) continue;
      if (emp.offDay === dayOfWeek) continue;

      try {
        await prisma.attendance.create({
          data: {
            userId: emp.id,
            date: todayStart,
            clockIn: todayStart,
            status: 'ABSENT',
            lateMinutes: 0,
            notes: '[Tidak hadir tanpa keterangan - Auto-detected]'
          }
        });
        absentCount++;
      } catch (e) {
        if (e.code !== 'P2002') { // Ignore unique constraint (already exists)
          console.error(`[Cron:AbsentDetection] Error for user ${emp.id}:`, e.message);
        }
      }
    }

    return res.json({ message: `Created ${absentCount} ABSENT records for ${witaDateStr}`, processed: absentCount });
  } catch (error) {
    console.error('[Cron:AbsentDetection] Error:', error.message);
    return res.status(500).json({ error: error.message });
  } finally {
    await prisma.$disconnect();
  }
};
