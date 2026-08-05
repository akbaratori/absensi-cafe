try {
    require('dotenv').config();
    const app = require('./src/app');
    const offDayService = require('./src/services/offDayService');
    const scheduleService = require('./src/services/scheduleService');
    console.log('Successfully loaded app and services!');
    process.exit(0);
} catch (error) {
    console.error('Error loading modules:', error);
    process.exit(1);
}
