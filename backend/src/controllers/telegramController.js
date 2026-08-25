/**
 * Telegram Bot Controller
 * Handle webhook dari Telegram dan request manual
 */

const telegramService = require('../services/telegramService');

/**
 * Initialize telegram bot
 */
const initTelegram = async (req, res) => {
  try {
    const bot = telegramService.initBot();
    
    if (!bot) {
      return res.status(400).json({
        success: false,
        error: { message: 'Bot token tidak dikonfigurasi' }
      });
    }

    res.json({
      success: true,
      message: 'Telegram bot initialized'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { message: error.message }
    });
  }
};

/**
 * Send test notification
 */
const sendTestNotification = async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        error: { message: 'Message required' }
      });
    }

    const result = await telegramService.sendNotification(null, message);

    res.json({
      success: result.success,
      message: result.success ? 'Notification sent' : result.error
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { message: error.message }
    });
  }
};

/**
 * Send attendance report
 */
const sendAttendanceReport = async (req, res) => {
  try {
    const { reportData } = req.body;

    if (!reportData) {
      return res.status(400).json({
        success: false,
        error: { message: 'Report data required' }
      });
    }

    await telegramService.sendReport(reportData);

    res.json({
      success: true,
      message: 'Report sent'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { message: error.message }
    });
  }
};

/**
 * Send reminders
 */
const sendReminders = async (req, res) => {
  try {
    await telegramService.sendReminders();

    res.json({
      success: true,
      message: 'Reminders sent'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { message: error.message }
    });
  }
};

module.exports = {
  initTelegram,
  sendTestNotification,
  sendAttendanceReport,
  sendReminders
};

// ============================================================
// DEPLOYMENT COMMAND HANDLERS
// ============================================================

const { pushToGitHub, deployToVercel, checkDeploymentStatus, showDeployHelp } = require('../services/telegramService');

// Command: /push - Push to GitHub
bot.onText(/\/push/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const adminId = parseInt(process.env.TELEGRAM_USER_ID || '2137535516');
  
  if (userId !== adminId) {
    bot.sendMessage(chatId, '❌ Unauthorized! Only admin can use this command.');
    return;
  }
  
  pushToGitHub(bot, chatId);
});

// Command: /deploy - Deploy to Vercel
bot.onText(/\/deploy/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const adminId = parseInt(process.env.TELEGRAM_USER_ID || '2137535516');
  
  if (userId !== adminId) {
    bot.sendMessage(chatId, '❌ Unauthorized! Only admin can use this command.');
    return;
  }
  
  deployToVercel(bot, chatId);
});

// Command: /status - Check deployment status
bot.onText(/\/status/, (msg) => {
  const chatId = msg.chat.id;
  checkDeploymentStatus(bot, chatId);
});

// Command: /deployhelp - Show deployment help
bot.onText(/\/deployhelp/, (msg) => {
  const chatId = msg.chat.id;
  showDeployHelp(bot, chatId);
});
