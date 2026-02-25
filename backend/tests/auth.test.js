const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/utils/database');
const bcrypt = require('bcrypt');

describe('Auth Endpoints', () => {

    beforeAll(async () => {
        // Ensure we have a clean state or known user
        // Ideally we'd use a test DB, but for this "Commercial Readiness" check
        // we'll rely on the existing seed data or create a temp user if needed.
        // For safety, let's create a specific test user.

        // Cleanup first
        await prisma.user.deleteMany({ where: { username: 'test_integration' } });

        const hashedPassword = await bcrypt.hash('password123', 10);
        await prisma.user.create({
            data: {
                username: 'test_integration',
                passwordHash: hashedPassword,
                fullName: 'Test User',
                role: 'EMPLOYEE',
                employeeId: 'TEST001'
            }
        });
    });

    afterAll(async () => {
        // Cleanup
        await prisma.user.deleteMany({ where: { username: 'test_integration' } });
    });

    describe('POST /api/v1/auth/login', () => {
        it('should login successfully with valid credentials', async () => {
            const res = await request(app)
                .post('/api/v1/auth/login')
                .send({
                    username: 'test_integration',
                    password: 'password123'
                });

            expect(res.statusCode).toEqual(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data).toHaveProperty('accessToken');
            expect(res.body.data).toHaveProperty('user');
        });

        it('should fail with invalid password', async () => {
            const res = await request(app)
                .post('/api/v1/auth/login')
                .send({
                    username: 'test_integration',
                    password: 'wrongpassword'
                });

            // Expect 401 Unauthorized or 400 Bad Request depending on implementation
            // Based on authService throwing invalid credentials, usually mapped to 401
            expect(res.statusCode).toBeOneOf([400, 401]);
            expect(res.body.success).toBe(false);
        });

        it('should fail validation with missing username', async () => {
            const res = await request(app)
                .post('/api/v1/auth/login')
                .send({
                    password: 'password123'
                });

            expect(res.statusCode).toBe(400); // Validation error
            expect(res.body.error.code).toBe('VALIDATION_ERROR');
        });

        it('should fail with non-existent user', async () => {
            const res = await request(app)
                .post('/api/v1/auth/login')
                .send({
                    username: 'non_existent_user',
                    password: 'password123'
                });

            expect(res.statusCode).toBeOneOf([400, 401]);
            expect(res.body.success).toBe(false);
        });
    });
});

// Helper for 'toBeOneOf' matchers if not present
expect.extend({
    toBeOneOf(received, expected) {
        const pass = expected.includes(received);
        if (pass) {
            return {
                message: () => `expected ${received} not to be in [${expected}]`,
                pass: true,
            };
        } else {
            return {
                message: () => `expected ${received} to be in [${expected}]`,
                pass: false,
            };
        }
    },
});
