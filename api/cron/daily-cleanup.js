// Vercel Cron Job: Daily Cleanup
// Runs once daily at 23:55 WITA (15:55 UTC)
// Combines: Auto Clock-Out + Absent Detection

process.env.NODE_ENV = 'production';
if (process.env.POSTGRES_PRISMA_URL) {
  process.env.DATABASE_URL = process.env.POSTGRES_PRISMA_URL;
}

const { PrismaClient } = require('../../backend/node_modules/@prisma/client');
const prisma = new PrismaClient();

const WITA_OFFSET_MS = 8 * 60 * 60 * 1000;

module.exports = async function handler(req, res) {
  const results = { autoClockout: 0, absentDetection: 0, errors: [] };

  try {
    // ===== 1. AUTO CLOCK-OUT =====
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
      include: { user: { select: { id: true, fullName: true } } }
    });

    for (const record of staleRecords) {
      try {
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
        await prisma.auditLog.create({
          data: {
            userId: null,
            action: 'AUTO_CLOCKOUT',
            entityType: 'ATTENDANCE',
            entityId: String(record.id),
            details: JSON.stringify({ userId: record.userId, clockOutTime: autoClockOut.toISOString() }),
          },
        });
        results.autoClockout++;
      } catch (e) {
        results.errors.push(`clockout:${record.id}:${e.message}`);
      }
    }

    // ===== 2. ABSENT DETECTION =====
    const nowWITA = new Date(Date.now() + WITA_OFFSET_MS);
    const witaDateStr = nowWITA.toISOString().slice(0, 10);
    const todayStart = new Date(`${witaDateStr}T00:00:00+08:00`);
    const todayEnd = new Date(`${witaDateStr}T23:59:59+08:00`);

    // Skip if public holiday
    const isPublicHoliday = await prisma.publicHoliday.findFirst({
      where: { date: { gte: todayStart, lte: todayEnd } }
    });

    if (!isPublicHoliday) {
      const employees = await prisma.user.findMany({
        where: { isActive: true, role: 'EMPLOYEE' },
        select: { id: true, offDay: true }
      });

      const attendanceToday = await prisma.attendance.findMany({
        where: { date: { gte: todayStart, lte: todayEnd } },
        select: { userId: true }
      });
      const clockedInUserIds = new Set(attendanceToday.map(a => a.userId));

      const approvedLeaves = await prisma.leave.findMany({
        where: { status: 'APPROVED', startDate: { lte: todayEnd }, endDate: { gte: todayStart } },
        select: { userId: true }
      });
      const onLeaveUserIds = new Set(approvedLeaves.map(l => l.userId));

      const schedules = await prisma.userSchedule.findMany({
        where: { date: { gte: todayStart, lte: todayEnd }, isOffDay: true },
        select: { userId: true }
      });
      const offDayUserIds = new Set(schedules.map(s => s.userId));

      const dayOfWeek = nowWITA.getDay();

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
          results.absentDetection++;
        } catch (e) {
          if (e.code !== 'P2002') {
            results.errors.push(`absent:${emp.id}:${e.message}`);
          }
        }
      }
    } else {
      results.skippedHoliday = isPublicHoliday.name;
    }

    return res.json({
      success: true,
      date: witaDateStr,
      ...results
    });
  } catch (error) {
    console.error('[Cron:DailyCleanup] Error:', error.message);
    return res.status(500).json({ error: error.message });
  } finally {
    await prisma.$disconnect();
  }
};
