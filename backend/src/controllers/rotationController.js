const prisma = require('../utils/database');
const { catchAsync } = require('../middleware/errorHandler');
const { AppError } = require('../utils/AppError');

exports.getManualOffDays = catchAsync(async (req, res) => {
    const { weekStart } = req.query;
    if (!weekStart) throw new AppError('Week start date is required', 400);

    const manualOffDays = await prisma.manualOffDay.findMany({
        where: { weekStart: new Date(weekStart) }
    });

    res.status(200).json({ status: 'success', data: manualOffDays });
});

exports.saveManualOffDays = catchAsync(async (req, res) => {
    const { weekStart, offDays } = req.body; // offDays: [{ userId, date }]
    if (!weekStart || !offDays) throw new AppError('Invalid data provided', 400);

    const weekStartDate = new Date(weekStart);

    await prisma.$transaction([
        prisma.manualOffDay.deleteMany({ where: { weekStart: weekStartDate } }),
        prisma.manualOffDay.createMany({
            data: offDays.map(item => ({
                userId: parseInt(item.userId),
                date: new Date(item.date),
                weekStart: weekStartDate
            }))
        })
    ]);

    res.status(200).json({ status: 'success', message: 'Manual off-days updated' });
});

exports.getRotation = catchAsync(async (req, res) => {
    // Basic implementation to return rotation data
    const rotation = await prisma.rotation.findMany();
    res.status(200).json({ status: 'success', data: rotation });
});

exports.listPositions = catchAsync(async (req, res) => {
    const positions = await prisma.position.findMany();
    res.status(200).json({ status: 'success', data: positions });
});

exports.createPosition = catchAsync(async (req, res) => {
    const position = await prisma.position.create({ data: req.body });
    res.status(201).json({ status: 'success', data: position });
});

exports.getPosition = catchAsync(async (req, res) => {
    const position = await prisma.position.findUnique({
        where: { id: parseInt(req.params.id) },
        include: {
            rosters: {
                include: {
                    user: { select: { id: true, username: true, fullName: true } },
                },
                orderBy: { orderIndex: 'asc' },
            },
        },
    });
    if (!position) throw new AppError('Position not found', 404);
    res.status(200).json({ status: 'success', data: position });
});

exports.updatePosition = catchAsync(async (req, res) => {
    const position = await prisma.position.update({ where: { id: parseInt(req.params.id) }, data: req.body });
    res.status(200).json({ status: 'success', data: position });
});

exports.setRoster = catchAsync(async (req, res) => {
    const positionId = parseInt(req.params.id);
    const { roster } = req.body;

    if (!Array.isArray(roster)) {
        throw new AppError('roster must be an array', 400);
    }

    const position = await prisma.position.findUnique({ where: { id: positionId } });
    if (!position) throw new AppError('Position not found', 404);

    const entries = roster
        .map((item, idx) => ({
            positionId,
            userId: parseInt(item.userId),
            orderIndex: item.orderIndex !== undefined ? parseInt(item.orderIndex) : idx,
            shiftNumber: item.shiftNumber !== undefined ? parseInt(item.shiftNumber) : 1,
        }))
        .filter((e) => Number.isInteger(e.userId) && e.userId > 0);

    await prisma.$transaction([
        prisma.positionRoster.deleteMany({ where: { positionId } }),
        ...entries.map((e) => prisma.positionRoster.create({ data: e })),
    ]);

    const saved = await prisma.positionRoster.findMany({
        where: { positionId },
        include: { user: { select: { id: true, username: true, fullName: true } } },
        orderBy: { orderIndex: 'asc' },
    });

    res.status(200).json({ status: 'success', data: saved });
});

exports.insertRosterMember = catchAsync(async (req, res) => {
    const positionId = parseInt(req.params.id);
    const { userId, orderIndex } = req.body;

    const uid = parseInt(userId);
    if (!Number.isInteger(uid) || uid <= 0) {
        throw new AppError('userId must be a valid integer', 400);
    }

    const position = await prisma.position.findUnique({ where: { id: positionId } });
    if (!position) throw new AppError('Position not found', 404);

    const existing = await prisma.positionRoster.findFirst({
        where: { positionId, userId: uid },
    });
    if (existing) {
        return res.status(200).json({ status: 'success', data: existing });
    }

    const count = await prisma.positionRoster.count({ where: { positionId } });
    const finalOrder = orderIndex !== undefined ? parseInt(orderIndex) : count;

    const created = await prisma.positionRoster.create({
        data: { positionId, userId: uid, orderIndex: finalOrder, shiftNumber: 1 },
    });

    res.status(201).json({ status: 'success', data: created });
});

exports.removeRosterMember = catchAsync(async (req, res) => {
    const positionId = parseInt(req.params.id);
    const uid = parseInt(req.body.userId);

    if (!Number.isInteger(uid) || uid <= 0) {
        throw new AppError('userId must be a valid integer', 400);
    }

    const deleted = await prisma.positionRoster.deleteMany({
        where: { positionId, userId: uid },
    });

    if (deleted.count === 0) {
        throw new AppError('Roster member not found', 404);
    }

    res.status(200).json({ status: 'success', message: 'Member removed' });
});

exports.generateWeek = catchAsync(async (req, res) => {
    res.status(200).json({ status: 'success', message: 'Week generated' });
});

exports.generateMonth = catchAsync(async (req, res) => {
    res.status(200).json({ status: 'success', message: 'Month generated' });
});

exports.getSchedule = catchAsync(async (req, res) => {
    res.status(200).json({ status: 'success', data: [] });
});

exports.listSchedules = catchAsync(async (req, res) => {
    res.status(200).json({ status: 'success', data: [] });
});
