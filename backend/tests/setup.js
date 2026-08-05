const prisma = require('../src/utils/database');

afterAll(async () => {
    await prisma.$disconnect();
});
