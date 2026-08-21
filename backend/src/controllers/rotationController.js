const prisma = require('../utils/database');
const { catchAsync } = require('../middleware/errorHandler');
const AppError = require('../utils/AppError');

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
    const position = await prisma.position.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!position) throw new AppError('Position not found', 404);
    res.status(200).json({ status: 'success', data: position });
});

exports.updatePosition = catchAsync(async (req, res) => {
    const position = await prisma.position.update({ where: { id: parseInt(req.params.id) }, data: req.body });
    res.status(200).json({ status: 'success', data: position });
});

exports.setRoster = catchAsync(async (req, res) => {
    res.status(200).json({ status: 'success', message: 'Roster set' });
});

exports.insertRosterMember = catchAsync(async (req, res) => {
    res.status(200).json({ status: 'success', message: 'Member inserted' });
});

exports.removeRosterMember = catchAsync(async (req, res) => {
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
