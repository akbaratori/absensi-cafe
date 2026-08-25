const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const { execSync } = require('child_process');

let bot;

/**
 * Initialize Telegram Bot
 */
const initBot = () => {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    
    if (!token) {
      console.error('❌ TELEGRAM_BOT_TOKEN not configured');
      return null;
    }

    bot = new TelegramBot(token, { polling: true });
    console.log('✅ Telegram bot initialized');

    // Register all command handlers
    registerCommands();

    return bot;
  } catch (error) {
    console.error('❌ Bot init error:', error.message);
    return null;
  }
};

/**
 * Register all bot commands
 */
const registerCommands = () => {
  if (!bot) return;

  // /start command
  bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId,
      '👋 Welcome to Absensi Cafe Bot!\n\n' +
      'Commands:\n' +
      '/absen - Clock in/out\n' +
      '/status - Check status\n' +
      '/laporan - Weekly report\n' +
      '/tukar - Request shift swap\n' +
      '/deploy - Deploy to Vercel\n' +
      '/help - Show help'
    );
  });

  // /absen command
  bot.onText(/\/absen/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, '📸 Please send photo for attendance');
  });

  // /status command
  bot.onText(/\/status/, (msg) => {
    const chatId = msg.chat.id;
    checkDeploymentStatus(chatId);
  });

  // /deploy command - DEPLOYMENT
  bot.onText(/\/deploy/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const adminId = parseInt(process.env.TELEGRAM_USER_ID || '2137535516');
    
    if (userId !== adminId) {
      bot.sendMessage(chatId, '❌ Unauthorized! Only admin can use this command.');
      return;
    }
    
    deployToVercel(chatId);
  });

  // /push command - PUSH TO GITHUB
  bot.onText(/\/push/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const adminId = parseInt(process.env.TELEGRAM_USER_ID || '2137535516');
    
    if (userId !== adminId) {
      bot.sendMessage(chatId, '❌ Unauthorized! Only admin can use this command.');
      return;
    }
    
    pushToGitHub(chatId);
  });

  // /deployhelp command
  bot.onText(/\/deployhelp/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId,
      '🤖 *Deployment Commands*\n\n' +
      '*/deploy* - Deploy to Vercel\n' +
      'Instant deployment (Vercel API)\n\n' +
      '*/push* - Push to GitHub\n' +
      'Triggers Vercel webhook auto-deploy\n\n' +
      '*/status* - Check deployment status\n' +
      'Real-time status update\n\n' +
      '_Admin only commands_',
      { parse_mode: 'Markdown' }
    );
  });

  // /help command
  bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId,
      '📋 *Available Commands*\n\n' +
      '*/start* - Welcome\n' +
      '*/absen* - Clock in/out dengan foto\n' +
      '*/status* - Check attendance status\n' +
      '*/laporan* - Weekly report\n' +
      '*/tukar* - Request shift swap\n' +
      '*/deploy* - Deploy to Vercel (admin)\n' +
      '*/push* - Push to GitHub (admin)\n' +
      '*/deployhelp* - Deployment commands\n' +
      '*/help* - Show this help',
      { parse_mode: 'Markdown' }
    );
  });

  console.log('✅ All commands registered');
};

/**
 * Deploy to Vercel
 */
const deployToVercel = async (chatId) => {
  try {
    bot.sendMessage(chatId, '⏳ Triggering Vercel deployment...');
    
    const vercelToken = process.env.VERCEL_TOKEN;
    if (!vercelToken) {
      bot.sendMessage(chatId, '❌ VERCEL_TOKEN not configured');
      return;
    }
    
    const response = await axios.post(
      'https://api.vercel.com/v13/deployments',
      { name: 'absensi-cafe' },
      {
        headers: {
          'Authorization': `Bearer ${vercelToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    bot.sendMessage(chatId,
      '✅ *Deployment Triggered!*\n\n' +
      '🚀 Status: Building...\n' +
      '🔗 URL: ' + response.data.url + '\n\n' +
      '⏱️ Estimated: 2-3 minutes\n' +
      'Monitor: https://vercel.com/dashboard/akbaratoris-projects/absensi-cafe',
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    bot.sendMessage(chatId,
      '❌ *Deploy Failed*\n\n' +
      'Error: ' + error.message,
      { parse_mode: 'Markdown' }
    );
  }
};

/**
 * Push to GitHub
 */
const pushToGitHub = async (chatId) => {
  try {
    bot.sendMessage(chatId, '⏳ Pushing commit 71d90a2 to GitHub...');
    
    const output = execSync(
      'cd /tmp/absensi-cafe && git push -u origin main 2>&1',
      { encoding: 'utf-8', stdio: 'pipe' }
    );
    
    bot.sendMessage(chatId,
      '✅ *Push Successful!*\n\n' +
      '📝 Commit: `71d90a2`\n' +
      '🌳 Branch: `main`\n' +
      '🔗 Vercel: Webhook triggered!\n\n' +
      '⏳ Deployment starting...\n' +
      'Monitor: https://vercel.com/dashboard/akbaratoris-projects/absensi-cafe',
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    bot.sendMessage(chatId,
      '❌ *Push Failed*\n\n' +
      'Error: ' + error.message.substring(0, 100) + '\n\n' +
      '💡 Try: /deploy (direct Vercel)',
      { parse_mode: 'Markdown' }
    );
  }
};

/**
 * Check deployment status
 */
const checkDeploymentStatus = async (chatId) => {
  try {
    const vercelToken = process.env.VERCEL_TOKEN;
    if (!vercelToken) {
      bot.sendMessage(chatId, '❌ VERCEL_TOKEN not configured');
      return;
    }
    
    const response = await axios.get(
      'https://api.vercel.com/v13/deployments',
      {
        headers: {
          'Authorization': `Bearer ${vercelToken}`
        },
        params: { limit: 1 }
      }
    );
    
    const latest = response.data.deployments[0];
    const isReady = latest.state === 'READY';
    
    bot.sendMessage(chatId,
      '📊 *Deployment Status*\n\n' +
      '🔹 State: `' + latest.state + '`\n' +
      '🔗 URL: ' + latest.url + '\n' +
      '⏰ Created: ' + new Date(latest.created).toLocaleString() + '\n\n' +
      (isReady ? '✅ *LIVE IN PRODUCTION!*' : '⏳ Still building...'),
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    bot.sendMessage(chatId,
      '❌ *Status Check Failed*\n\n' +
      'Error: ' + error.message,
      { parse_mode: 'Markdown' }
    );
  }
};

/**
 * Send notification
 */
const sendNotification = async (chatId, message) => {
  try {
    if (!bot) bot = initBot();
    
    const targetChatId = chatId || process.env.TELEGRAM_CHAT_ID;
    if (!targetChatId) {
      return { success: false, error: 'Chat ID not configured' };
    }

    await bot.sendMessage(targetChatId, message);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

/**
 * Send report
 */
const sendReport = async (reportData) => {
  try {
    if (!bot) bot = initBot();
    
    const chatId = process.env.TELEGRAM_CHAT_ID;
    const message = `📊 Attendance Report\n\n${JSON.stringify(reportData, null, 2)}`;
    
    await bot.sendMessage(chatId, message);
  } catch (error) {
    console.error('Send report error:', error.message);
  }
};

/**
 * Send reminders
 */
const sendReminders = async () => {
  try {
    if (!bot) bot = initBot();
    
    const chatId = process.env.TELEGRAM_CHAT_ID;
    const message = '⏰ Reminder: Please check your attendance!';
    
    await bot.sendMessage(chatId, message);
  } catch (error) {
    console.error('Send reminders error:', error.message);
  }
};

module.exports = {
  initBot,
  sendNotification,
  sendReport,
  sendReminders,
  deployToVercel,
  pushToGitHub,
  checkDeploymentStatus
};
