const { AppError } = require('../utils/AppError');
const prisma = require('../utils/database');

/**
 * Rotation Service
 * Handles position-based circular shift rotation.
 */

function toDateOnly(date) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function getMonday(date) {
  const d = toDateOnly(date);
  const day = d.getUTCDay();
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
  d.setUTCDate(diff);
  return d;
}

function toISO(date) {
  return date.toISOString().split('T')[0];
}

class RotationService {
  async getPosition(positionId) {
    return await prisma.position.findUnique({
      where: { id: parseInt(positionId) },
      include: { roster: { include: { user: true } }, rotationState: true },
    });
  }

  async generateWeek(positionId, weekStart, options = {}) {
    // Check if manual off-days are confirmed for this week
    const monday = getMonday(weekStart);
    const manualExists = await prisma.manualOffDay.findFirst({
        where: { weekStart: monday }
    });

    if (!manualExists) {
        throw new AppError('Harap konfirmasi libur manual terlebih dahulu sebelum generate!', 400);
    }

    const position = await this.getPosition(positionId);
    if (!position) throw new AppError('Position not found', 404);

    // Fetch all needed off-day data
    const offDays = await prisma.offDayRequest.findMany({
      where: { status: 'APPROVED', date: { gte: monday, lt: addDays(monday, 7) } }
    });
    const leaves = await prisma.leave.findMany({
      where: { status: 'APPROVED', startDate: { lte: addDays(monday, 6) }, endDate: { gte: monday } }
    });
    const userOffDays = await prisma.user.findMany({
      where: { offDay: { not: null } }
    });
    
    // Fetch manual off days
    const manualOffDays = await prisma.manualOffDay.findMany({
      where: { weekStart: monday },
    });

    const offUserIds = new Set([
      ...offDays.map((od) => od.userId),
      ...leaves.map((l) => l.userId),
      ...userOffDays.map((u) => u.id),
      ...manualOffDays.map((m) => m.userId),
    ]);

    // ... (rest of generator logic)
    return { status: 'generated' };
  }
}

module.exports = new RotationService();