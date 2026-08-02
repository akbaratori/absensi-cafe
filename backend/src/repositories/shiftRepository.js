const prisma = require('../utils/database');

class ShiftRepository {
    async findAll() {
        return await prisma.shift.findMany({
            orderBy: { id: 'asc' },
        });
    }

    async findById(id) {
        return await prisma.shift.findUnique({
            where: { id: parseInt(id) },
        });
    }

    async create(data) {
        return await prisma.shift.create({
            data,
        });
    }

    async update(id, data) {
        return await prisma.shift.update({
            where: { id: parseInt(id) },
            data,
        });
    }

    async checkInUse(id) {
        const userCount = await prisma.user.count({ where: { shiftId: parseInt(id) } });
        const scheduleCount = await prisma.userSchedule.count({ where: { shiftId: parseInt(id) } });
        return userCount > 0 || scheduleCount > 0;
    }

    async delete(id) {
        return await prisma.shift.delete({
            where: { id: parseInt(id) },
        });
    }
}

module.exports = new ShiftRepository();
