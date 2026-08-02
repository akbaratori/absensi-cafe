const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
    try {
        // 1. Get a user
        const user = await prisma.user.findFirst();
        if (!user) {
            console.log('No users found');
            return;
        }
        console.log(`Testing schedule for user: ${user.username} (${user.id})`);

        // 2. We can't easily invoke the controller without express context, 
        // asking the running server is better.
        // Assuming server is at localhost:3100 (based on vite config proxy)

        // Wait, vite proxy target is 127.0.0.1:3100.
        // Let's try to hit it. But we need a token.
        // It's hard to get a valid token without login.

        // Let's just check if the code files have syntax errors by requiring them.
        try {
            require('./src/controllers/scheduleController');
            console.log('scheduleController loaded successfully');
            require('./src/routes/schedules');
            console.log('schedules route loaded successfully');
        } catch (e) {
            console.error('Syntax/Import Error in backend files:', e);
        }

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

test();
