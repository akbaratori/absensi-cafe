const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/utils/database');
const bcrypt = require('bcrypt');

describe('Attendance IP Logging', () => {
    let token;
    let userId;

    beforeAll(async () => {
        // Cleanup existing logic if restart
        try {
            await prisma.attendance.deleteMany({ where: { user: { username: 'ip_test_user' } } });
            await prisma.user.deleteMany({ where: { username: 'ip_test_user' } });
        } catch (e) {
            // ignore
        }

        // 1. Create Test User
        const hashedPassword = await bcrypt.hash('password123', 10);
        const user = await prisma.user.create({
            data: {
                username: 'ip_test_user',
                passwordHash: hashedPassword,
                fullName: 'IP Test User',
                role: 'EMPLOYEE',
                employeeId: 'IP001'
            }
        });
        userId = user.id;

        // 2. Login to get Token
        const loginRes = await request(app)
            .post('/api/v1/auth/login')
            .send({ username: 'ip_test_user', password: 'password123' });

        token = loginRes.body.data.accessToken;
    });

    afterAll(async () => {
        await prisma.attendance.deleteMany({ where: { userId } });
        await prisma.user.delete({ where: { id: userId } });
        await prisma.$disconnect();
    });

    it('should save IP address when clocking in', async () => {
        const res = await request(app)
            .post('/api/v1/attendance/clock-in')
            .set('Authorization', `Bearer ${token}`)
            // Improve location to be close to logic defaults if needed, 
            // but service mocks or defaults might handle it.
            // Based on code, location is checked if provided.
            .send({
                location: { latitude: -5.1687398658898145, longitude: 119.4584722877303 }, // Use Exact default
                notes: 'Test IP'
            });

        // Note: If you run this behind a proxy without 'trust proxy', ip might be ::1 or 127.0.0.1
        // Jest/Supertest usually creates a local connection.

        // Check DB
        const attendance = await prisma.attendance.findFirst({
            where: { userId },
            orderBy: { createdAt: 'desc' }
        });

        expect(attendance).toBeDefined();
        console.log('Full Attendance Record:', attendance);
        expect(attendance.clockInIp).toBeTruthy(); // Should not be null
    });
});
