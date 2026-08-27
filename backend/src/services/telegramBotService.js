/**
 * Telegram Bot Service - Production Ready
 * Fitur: /start, /absen (password + lokasi + foto), /status, /jadwal, /laporan, /logout, /help
 */

const TelegramBot = require('node-telegram-bot-api');
const bcrypt = require('bcrypt');
const prisma = require('../utils/database');
const attendanceService = require('./attendanceService');

let bot = null;
// userStates: Map<telegramUserId, state>
// state shape per step:
//   waiting_username_for_link
//   waiting_password_for_link { userId, username }
//   waiting_password          { userId, attendanceType, attendanceId? }
//   waiting_location   { userId, attendanceType, attendanceId? }
//   waiting_clock_in_photo   { userId, location }
//   waiting_clock_out_photo  { userId, location, attendanceId }
const userStates = new Map();

// ─────────────────────────────────────────
// Init
// ─────────────────────────────────────────
const initBot = () => {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) { console.error('❌ TELEGRAM_BOT_TOKEN not set'); return null; }

    bot = new TelegramBot(token, { polling: true });
    console.log('✅ Telegram bot initialized');

    registerCommands();
    registerLocationHandler();
    registerPhotoHandler();
    registerTextHandler();

    return bot;
  } catch (error) {
    console.error('❌ Bot init error:', error.message);
    return null;
  }
};

// ─────────────────────────────────────────
// Commands
// ─────────────────────────────────────────
const registerCommands = () => {
  if (!bot) return;

  // /start
  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramUserId = msg.from.id.toString();
    try {
      const existing = await prisma.user.findFirst({
        where: { telegramUserId },
        select: { fullName: true }
      });
      if (existing) {
        return bot.sendMessage(chatId,
          `👋 Halo *${existing.fullName}*!\n\nAkun sudah terhubung.\nGunakan /help untuk perintah.`,
          { parse_mode: 'Markdown' }
        );
      }
      bot.sendMessage(chatId,
        `👋 Selamat datang di *Absensi Cafe Bot*!\n\nAkun belum terhubung.\nKirim *username* login kamu.\n\nContoh: \`budi123\``,
        { parse_mode: 'Markdown' }
      );
      userStates.set(telegramUserId, { step: 'waiting_username_for_link' });
    } catch (e) {
      console.error('start error:', e);
      bot.sendMessage(chatId, '❌ Terjadi kesalahan. Coba lagi.');
    }
  });

  // /help
  bot.onText(/\/help/, (msg) => {
    bot.sendMessage(msg.chat.id,
      `📋 *Perintah Bot Absensi*\n\n` +
      `*Absensi:*\n/absen - Absen masuk/pulang\n/status - Status hari ini\n\n` +
      `*Jadwal & Laporan:*\n/jadwal - Jadwal minggu ini\n/laporan - Rekap bulan ini\n\n` +
      `*Request:*\n/tukar - Tukar shift\n/izin - Ajukan izin/cuti\n\n` +
      `*Akun:*\n/logout - Putuskan akun dari Telegram\n/help - Bantuan`,
      { parse_mode: 'Markdown' }
    );
  });

  // /logout
  bot.onText(/\/logout/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramUserId = msg.from.id.toString();
    try {
      const user = await getLinkedUser(telegramUserId);
      if (!user) return bot.sendMessage(chatId, `ℹ️ Akun belum terhubung.`);

      await prisma.user.update({
        where: { id: user.id },
        data: { telegramUserId: null }
      });

      userStates.delete(telegramUserId);
      bot.sendMessage(chatId,
        `✅ *Logout Berhasil*\n\nAkun *${user.fullName}* diputus dari Telegram.\n\nGunakan /start untuk hubungkan akun lain.`,
        { parse_mode: 'Markdown', reply_markup: { remove_keyboard: true } }
      );
    } catch (e) {
      console.error('logout error:', e);
      bot.sendMessage(chatId, `❌ Gagal logout. Coba lagi.`);
    }
  });

  // /absen — step 1: cek link, cek attendance hari ini, minta password
  bot.onText(/\/absen/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramUserId = msg.from.id.toString();
    try {
      const user = await getLinkedUser(telegramUserId);
      if (!user) return sendNotLinked(chatId);

      const now = new Date();
      const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
      const todayEnd   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59));

      const todayAttendance = await prisma.attendance.findFirst({
        where: { userId: user.id, date: { gte: todayStart, lte: todayEnd } }
      });

      // Sudah absen pulang
      if (todayAttendance && todayAttendance.clockOut) {
        const totalHours = calculateHours(todayAttendance.clockIn, todayAttendance.clockOut);
        return bot.sendMessage(chatId,
          `✅ *Absensi Hari Ini Sudah Lengkap*\n\n` +
          `Masuk: ${formatTime(todayAttendance.clockIn)}\n` +
          `Pulang: ${formatTime(todayAttendance.clockOut)}\n` +
          `Total: ${totalHours} jam\nStatus: ${todayAttendance.status}`,
          { parse_mode: 'Markdown' }
        );
      }

      const attendanceType = !todayAttendance ? 'clock_in' : 'clock_out';
      const label = attendanceType === 'clock_in' ? 'Masuk' : 'Pulang';

      // Minta password
      bot.sendMessage(chatId,
        `🔐 *Absen ${label}*\n\nKirim password akun kamu untuk konfirmasi.\n\n_Pesan password akan otomatis terhapus setelah diproses._`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            keyboard: [[{ text: '❌ Batal' }]],
            resize_keyboard: true,
            one_time_keyboard: true
          }
        }
      );

      userStates.set(telegramUserId, {
        step: 'waiting_password',
        userId: user.id,
        attendanceType,
        attendanceId: todayAttendance?.id
      });

    } catch (e) {
      console.error('absen command error:', e);
      bot.sendMessage(msg.chat.id, `❌ Error: ${e.message}`);
    }
  });

  // /status
  bot.onText(/\/status/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramUserId = msg.from.id.toString();
    try {
      const user = await getLinkedUser(telegramUserId);
      if (!user) return sendNotLinked(chatId);

      const now = new Date();
      const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
      const todayEnd   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59));

      const att = await prisma.attendance.findFirst({
        where: { userId: user.id, date: { gte: todayStart, lte: todayEnd } }
      });

      if (!att) {
        return bot.sendMessage(chatId, `ℹ️ Belum absen hari ini.\n\nGunakan /absen untuk absen masuk.`);
      }

      let msg2 = `📊 *Status Absensi Hari Ini*\n\n👤 ${user.fullName}\n📅 ${formatDate(att.date)}\n\n`;
      msg2 += `Masuk: ${formatTime(att.clockIn)}\n`;
      if (att.clockOut) {
        msg2 += `Pulang: ${formatTime(att.clockOut)}\nTotal: ${calculateHours(att.clockIn, att.clockOut)} jam\n`;
      } else {
        msg2 += `Pulang: Belum\n`;
      }
      msg2 += `Status: ${att.status}`;

      bot.sendMessage(chatId, msg2, { parse_mode: 'Markdown' });
    } catch (e) {
      bot.sendMessage(chatId, '❌ Gagal mengambil status.');
    }
  });

  // /jadwal
  bot.onText(/\/jadwal/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramUserId = msg.from.id.toString();
    try {
      const user = await getLinkedUser(telegramUserId);
      if (!user) return sendNotLinked(chatId);

      const now = new Date();
      const startOfWeek = getStartOfWeek(now);
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(endOfWeek.getDate() + 6);

      const schedules = await prisma.userSchedule.findMany({
        where: { userId: user.id, date: { gte: startOfWeek, lte: endOfWeek } },
        include: { shift: true },
        orderBy: { date: 'asc' }
      });

      if (!schedules.length) return bot.sendMessage(chatId, `ℹ️ Tidak ada jadwal minggu ini.`);

      let text = `📅 *Jadwal Minggu Ini*\n\n👤 ${user.fullName}\n\n`;
      schedules.forEach(s => {
        const day = formatDayName(s.date);
        const date = formatDate(s.date);
        if (s.isOffDay) {
          text += `🔴 ${day}, ${date}\n   Libur\n\n`;
        } else if (s.shift) {
          text += `🟢 ${day}, ${date}\n   ${s.shift.name} (${s.shift.startTime} - ${s.shift.endTime})\n\n`;
        }
      });

      bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
    } catch (e) {
      bot.sendMessage(chatId, '❌ Gagal mengambil jadwal.');
    }
  });

  // /laporan
  bot.onText(/\/laporan/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramUserId = msg.from.id.toString();
    try {
      const user = await getLinkedUser(telegramUserId);
      if (!user) return sendNotLinked(chatId);

      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      const startDate = new Date(year, month - 1, 1);
      const endDate   = new Date(year, month, 0, 23, 59, 59);

      const attendances = await prisma.attendance.findMany({
        where: { userId: user.id, date: { gte: startDate, lte: endDate } },
        orderBy: { date: 'asc' }
      });

      if (!attendances.length) return bot.sendMessage(chatId, `ℹ️ Belum ada data absensi bulan ini.`);

      const stats = {
        total: attendances.length,
        present: attendances.filter(a => a.status === 'PRESENT').length,
        late: attendances.filter(a => a.status === 'LATE').length,
        absent: attendances.filter(a => a.status === 'ABSENT').length,
        totalHours: attendances.reduce((sum, a) => a.clockOut ? sum + parseFloat(calculateHours(a.clockIn, a.clockOut)) : sum, 0)
      };

      bot.sendMessage(chatId,
        `📊 *Laporan Absensi*\n\n👤 ${user.fullName}\n📅 ${getMonthName(month)} ${year}\n\n` +
        `Total Hari Kerja: ${stats.total}\nHadir Tepat Waktu: ${stats.present}\nTerlambat: ${stats.late}\nTidak Hadir: ${stats.absent}\nTotal Jam Kerja: ${stats.totalHours.toFixed(1)} jam`,
        { parse_mode: 'Markdown' }
      );
    } catch (e) {
      bot.sendMessage(chatId, '❌ Gagal membuat laporan.');
    }
  });

  // /tukar
  bot.onText(/\/tukar/, (msg) => {
    bot.sendMessage(msg.chat.id, `🔄 *Tukar Shift*\n\nFitur dalam pengembangan.\nGunakan web untuk request tukar shift.`, { parse_mode: 'Markdown' });
  });

  // /izin
  bot.onText(/\/izin/, (msg) => {
    bot.sendMessage(msg.chat.id, `📝 *Ajukan Izin/Cuti*\n\nFitur dalam pengembangan.\nGunakan web untuk ajukan izin.`, { parse_mode: 'Markdown' });
  });

  // ── ADMIN COMMANDS ──

  // /cekabsen — siapa sudah/belum absen hari ini (admin/owner only)
  bot.onText(/\/cekabsen/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramUserId = msg.from.id.toString();
    try {
      const user = await getLinkedUser(telegramUserId);
      if (!user) return sendNotLinked(chatId);
      if (!['ADMIN', 'OWNER'].includes(user.role)) {
        return bot.sendMessage(chatId, `❌ Akses ditolak. Hanya Admin/Owner.`);
      }

      const now = new Date();
      const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
      const todayEnd   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59));

      // Semua user aktif
      const allUsers = await prisma.user.findMany({
        where: { isActive: true, role: { in: ['EMPLOYEE', 'ADMIN'] } },
        select: { id: true, fullName: true, department: true }
      });

      // Yang sudah absen hari ini
      const attended = await prisma.attendance.findMany({
        where: { date: { gte: todayStart, lte: todayEnd } },
        select: { userId: true, clockIn: true, clockOut: true, status: true }
      });

      const attendedIds = new Set(attended.map(a => a.userId));
      const sudah = allUsers.filter(u => attendedIds.has(u.id));
      const belum = allUsers.filter(u => !attendedIds.has(u.id));

      let text = `📋 *Absensi Hari Ini*\n📅 ${formatDate(now)}\n\n`;
      text += `✅ *Sudah Absen (${sudah.length}):*\n`;
      sudah.forEach(u => {
        const att = attended.find(a => a.userId === u.id);
        const clockOut = att.clockOut ? ` - Pulang: ${formatTime(att.clockOut)}` : ' - Belum pulang';
        text += `• ${u.fullName} [${u.department}] Masuk: ${formatTime(att.clockIn)}${clockOut}\n`;
      });

      text += `\n❌ *Belum Absen (${belum.length}):*\n`;
      if (belum.length === 0) {
        text += `• Semua sudah absen!\n`;
      } else {
        belum.forEach(u => { text += `• ${u.fullName} [${u.department}]\n`; });
      }

      bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
    } catch (e) {
      console.error('cekabsen error:', e);
      bot.sendMessage(chatId, `❌ Error: ${e.message}`);
    }
  });

  // /rekaphari — rekap jumlah hadir/telat/belum hari ini (admin/owner only)
  bot.onText(/\/rekaphari/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramUserId = msg.from.id.toString();
    try {
      const user = await getLinkedUser(telegramUserId);
      if (!user) return sendNotLinked(chatId);
      if (!['ADMIN', 'OWNER'].includes(user.role)) {
        return bot.sendMessage(chatId, `❌ Akses ditolak. Hanya Admin/Owner.`);
      }

      const now = new Date();
      const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
      const todayEnd   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59));

      const allUsers = await prisma.user.count({ where: { isActive: true, role: { in: ['EMPLOYEE', 'ADMIN'] } } });
      const attended = await prisma.attendance.findMany({
        where: { date: { gte: todayStart, lte: todayEnd } },
        select: { status: true, clockOut: true }
      });

      const hadir   = attended.filter(a => a.status === 'PRESENT').length;
      const telat   = attended.filter(a => a.status === 'LATE').length;
      const sudahPulang = attended.filter(a => a.clockOut).length;
      const belumPulang = attended.filter(a => !a.clockOut).length;
      const belumAbsen  = allUsers - attended.length;

      const pct = (n) => allUsers > 0 ? ` (${Math.round(n/allUsers*100)}%)` : '';

      bot.sendMessage(chatId,
        `📊 *Rekap Absensi Hari Ini*\n📅 ${formatDate(now)}\n\n` +
        `👥 Total Karyawan: ${allUsers}\n\n` +
        `✅ Hadir Tepat Waktu: ${hadir}${pct(hadir)}\n` +
        `⏰ Terlambat: ${telat}${pct(telat)}\n` +
        `❌ Belum Absen: ${belumAbsen}${pct(belumAbsen)}\n\n` +
        `🏁 Sudah Pulang: ${sudahPulang}\n` +
        `🏢 Masih di Tempat: ${belumPulang}`,
        { parse_mode: 'Markdown' }
      );
    } catch (e) {
      console.error('rekaphari error:', e);
      bot.sendMessage(chatId, `❌ Error: ${e.message}`);
    }
  });

  // /lihatfoto [username] — lihat foto absen user hari ini (admin/owner only)
  bot.onText(/\/lihatfoto(?:\s+(\S+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramUserId = msg.from.id.toString();
    const targetUsername = match[1];
    try {
      const user = await getLinkedUser(telegramUserId);
      if (!user) return sendNotLinked(chatId);
      if (!['ADMIN', 'OWNER'].includes(user.role)) {
        return bot.sendMessage(chatId, `❌ Akses ditolak. Hanya Admin/Owner.`);
      }
      if (!targetUsername) {
        return bot.sendMessage(chatId, `ℹ️ Format: /lihatfoto [username]\nContoh: /lihatfoto baso`);
      }

      const target = await prisma.user.findUnique({
        where: { username: targetUsername },
        select: { id: true, fullName: true }
      });
      if (!target) return bot.sendMessage(chatId, `❌ User "${targetUsername}" tidak ditemukan.`);

      const now = new Date();
      const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
      const todayEnd   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59));

      const att = await prisma.attendance.findFirst({
        where: { userId: target.id, date: { gte: todayStart, lte: todayEnd } },
        select: { clockIn: true, clockOut: true, status: true, clockInPhoto: true, clockOutPhoto: true }
      });

      if (!att) return bot.sendMessage(chatId, `ℹ️ ${target.fullName} belum absen hari ini.`);

      const caption = `👤 *${target.fullName}*\n📅 ${formatDate(now)}\nStatus: ${att.status}\nMasuk: ${formatTime(att.clockIn)}${att.clockOut ? `\nPulang: ${formatTime(att.clockOut)}` : ''}`;

      // Kirim foto masuk
      if (att.clockInPhoto) {
        const bufIn = Buffer.from(att.clockInPhoto, 'base64');
        await bot.sendPhoto(chatId, bufIn, { caption: `📸 Foto Masuk — ${caption}`, parse_mode: 'Markdown' });
      } else {
        await bot.sendMessage(chatId, `ℹ️ Tidak ada foto masuk.`);
      }

      // Kirim foto pulang
      if (att.clockOutPhoto) {
        const bufOut = Buffer.from(att.clockOutPhoto, 'base64');
        await bot.sendPhoto(chatId, bufOut, { caption: `📸 Foto Pulang — ${target.fullName}`, parse_mode: 'Markdown' });
      }

    } catch (e) {
      console.error('lihatfoto error:', e);
      bot.sendMessage(chatId, `❌ Error: ${e.message}`);
    }
  });
};

// ─────────────────────────────────────────
// Location handler — step 3
// ─────────────────────────────────────────
const registerLocationHandler = () => {
  if (!bot) return;

  bot.on('location', async (msg) => {
    const chatId = msg.chat.id;
    const telegramUserId = msg.from.id.toString();
    const state = userStates.get(telegramUserId);

    if (!state || state.step !== 'waiting_location') return;

    const { latitude, longitude } = msg.location;
    const locationStr = `${latitude},${longitude}`;

    await askForPhoto(chatId, telegramUserId, state, { latitude, longitude, raw: locationStr });
  });
};

// ─────────────────────────────────────────
// Photo handler — step 4
// ─────────────────────────────────────────
const registerPhotoHandler = () => {
  if (!bot) return;

  bot.on('photo', async (msg) => {
    const chatId = msg.chat.id;
    const telegramUserId = msg.from.id.toString();
    const state = userStates.get(telegramUserId);

    if (!state) return bot.sendMessage(chatId, `ℹ️ Gunakan /absen terlebih dahulu.`);
    if (state.step !== 'waiting_clock_in_photo' && state.step !== 'waiting_clock_out_photo') return;

    try {
      const photo    = msg.photo[msg.photo.length - 1];
      const file     = await bot.getFile(photo.file_id);
      const fileUrl  = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
      const axios    = require('axios');
      const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
      const photoBase64 = Buffer.from(response.data).toString('base64');

      const location = state.location || 'Telegram Bot';

      if (state.step === 'waiting_clock_in_photo') {
        await bot.sendMessage(chatId, `⏳ Memproses absen masuk...`);

        const result = await attendanceService.clockIn(
          state.userId,
          location,
          'Via Telegram Bot',
          photoBase64,
          msg.from.id.toString()
        );

        const user = await prisma.user.findUnique({ where: { id: state.userId } });
        bot.sendMessage(chatId,
          `✅ *Absen Masuk Berhasil!*\n\n👤 ${user.fullName}\nWaktu: ${formatTime(result.clockIn)}\nStatus: ${result.status}\n\nSelamat bekerja!`,
          { parse_mode: 'Markdown', reply_markup: { remove_keyboard: true } }
        );

      } else if (state.step === 'waiting_clock_out_photo') {
        await bot.sendMessage(chatId, `⏳ Memproses absen pulang...`);

        const result = await attendanceService.clockOut(
          state.userId,
          location,
          photoBase64,
          msg.from.id.toString()
        );

        const user = await prisma.user.findUnique({ where: { id: state.userId } });
        bot.sendMessage(chatId,
          `✅ *Absen Pulang Berhasil!*\n\n👤 ${user.fullName}\nWaktu: ${formatTime(result.clockOut)}\nTotal Jam Kerja: ${result.totalHours} jam\n\nHati-hati di jalan!`,
          { parse_mode: 'Markdown', reply_markup: { remove_keyboard: true } }
        );
      }

      userStates.delete(telegramUserId);

    } catch (e) {
      console.error('Photo handler error:', e);
      bot.sendMessage(chatId, `❌ Error: ${e.message}\n\nCoba lagi dengan /absen`, {
        reply_markup: { remove_keyboard: true }
      });
      userStates.delete(telegramUserId);
    }
  });
};

// ─────────────────────────────────────────
// Text handler — username linking & password & skip location
// ─────────────────────────────────────────
const registerTextHandler = () => {
  if (!bot) return;

  bot.on('text', async (msg) => {
    const chatId        = msg.chat.id;
    const text          = msg.text;
    const telegramUserId = msg.from.id.toString();

    if (text.startsWith('/')) return;

    // Batal
    if (text === '❌ Batal') {
      userStates.delete(telegramUserId);
      return bot.sendMessage(chatId, `Dibatalkan.`, { reply_markup: { remove_keyboard: true } });
    }

    // Skip lokasi
    if (text === '⏭️ Lewati Lokasi') {
      const state = userStates.get(telegramUserId);
      if (!state || state.step !== 'waiting_location') return;
      await askForPhoto(chatId, telegramUserId, state, 'Telegram Bot');
      return;
    }

    const state = userStates.get(telegramUserId);
    if (!state) return;

    // ── Step: waiting_username_for_link ──
    if (state.step === 'waiting_username_for_link') {
      try {
        const user = await prisma.user.findUnique({
          where: { username: text.trim() },
          select: { id: true, fullName: true, telegramUserId: true }
        });

        if (!user) {
          return bot.sendMessage(chatId, `❌ Username tidak ditemukan.\n\nCoba lagi atau hubungi admin.`);
        }
        if (user.telegramUserId && user.telegramUserId !== telegramUserId) {
          return bot.sendMessage(chatId, `❌ Username sudah terhubung ke akun Telegram lain.`);
        }

        // Username valid → minta password
        bot.sendMessage(chatId,
          `🔐 *Konfirmasi Password*\n\nKirim password akun *${text.trim()}* untuk menghubungkan.\n\n_Pesan password akan dihapus setelah diproses._`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              keyboard: [[{ text: '❌ Batal' }]],
              resize_keyboard: true,
              one_time_keyboard: true
            }
          }
        );

        userStates.set(telegramUserId, {
          step: 'waiting_password_for_link',
          userId: user.id,
          username: text.trim()
        });

      } catch (e) {
        console.error('Username lookup error:', e);
        bot.sendMessage(chatId, `❌ Terjadi kesalahan. Coba lagi.`);
      }
      return;
    }

    // ── Step: waiting_password_for_link ──
    if (state.step === 'waiting_password_for_link') {
      try {
        const user = await prisma.user.findUnique({
          where: { id: state.userId },
          select: { id: true, passwordHash: true, fullName: true, department: true }
        });

        const valid = await bcrypt.compare(text.trim(), user.passwordHash);

        if (!valid) {
          return bot.sendMessage(chatId,
            `❌ *Password Salah*\n\nCoba lagi atau /start untuk mulai ulang.`,
            { parse_mode: 'Markdown' }
          );
        }

        // Password OK → link
        await prisma.user.update({
          where: { id: user.id },
          data: { telegramUserId }
        });

        userStates.delete(telegramUserId);
        bot.sendMessage(chatId,
          `✅ *Akun Berhasil Terhubung!*\n\n👤 ${user.fullName}\n🏢 ${user.department}\n\nGunakan /help untuk perintah.`,
          { parse_mode: 'Markdown', reply_markup: { remove_keyboard: true } }
        );

      } catch (e) {
        console.error('Link password verify error:', e);
        bot.sendMessage(chatId, `❌ Terjadi kesalahan. Coba lagi.`);
        userStates.delete(telegramUserId);
      }
      return;
    }

    // ── Step: waiting_password ──
    if (state.step === 'waiting_password') {
      try {
        const user = await prisma.user.findUnique({
          where: { id: state.userId },
          select: { id: true, passwordHash: true, fullName: true }
        });

        const valid = await bcrypt.compare(text.trim(), user.passwordHash);

        if (!valid) {
          return bot.sendMessage(chatId,
            `❌ *Password Salah*\n\nSilakan kirim ulang password yang benar, atau /absen untuk mulai ulang.`,
            { parse_mode: 'Markdown' }
          );
        }

        // Password OK → step 3: minta lokasi
        const label = state.attendanceType === 'clock_in' ? 'Masuk' : 'Pulang';

        bot.sendMessage(chatId,
          `✅ Password benar!\n\n📍 *Konfirmasi Lokasi — Absen ${label}*\n\nBagikan lokasi kamu sekarang, atau lewati jika tidak bisa.`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              keyboard: [
                [{ text: '📍 Bagikan Lokasi', request_location: true }],
                [{ text: '⏭️ Lewati Lokasi' }],
                [{ text: '❌ Batal' }]
              ],
              resize_keyboard: true,
              one_time_keyboard: true
            }
          }
        );

        userStates.set(telegramUserId, {
          ...state,
          step: 'waiting_location'
        });

      } catch (e) {
        console.error('Password check error:', e);
        bot.sendMessage(chatId, `❌ Terjadi kesalahan. Coba lagi dengan /absen`);
        userStates.delete(telegramUserId);
      }
      return;
    }
  });
};

// ─────────────────────────────────────────
// Helper: transition ke step foto
// ─────────────────────────────────────────
const askForPhoto = async (chatId, telegramUserId, state, location) => {
  const label = state.attendanceType === 'clock_in' ? 'Masuk' : 'Pulang';
  const nextStep = state.attendanceType === 'clock_in' ? 'waiting_clock_in_photo' : 'waiting_clock_out_photo';

  let locationInfo = '';
  if (location && location.latitude) {
    locationInfo = `\nLokasi tercatat: ${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`;
  }

  bot.sendMessage(chatId,
    `📸 *Foto Selfie — Absen ${label}*\n\nKirim foto selfie kamu sekarang.${locationInfo}\n\nPastikan wajah terlihat jelas.`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        keyboard: [[{ text: '❌ Batal' }]],
        resize_keyboard: true,
        one_time_keyboard: true
      }
    }
  );

  userStates.set(telegramUserId, {
    step: nextStep,
    userId: state.userId,
    location,
    attendanceId: state.attendanceId
  });
};

// ─────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────
const getLinkedUser = async (telegramUserId) => {
  return prisma.user.findFirst({ where: { telegramUserId }, include: { shift: true } });
};

const sendNotLinked = (chatId) => {
  bot.sendMessage(chatId, `⚠️ Akun Telegram belum terhubung.\n\nGunakan /start untuk menghubungkan akun.`);
};

const formatTime = (date) => new Date(date).toLocaleTimeString('id-ID', {
  hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Makassar'
});

const formatDate = (date) => new Date(date).toLocaleDateString('id-ID', {
  day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Makassar'
});

const formatDayName = (date) => new Date(date).toLocaleDateString('id-ID', {
  weekday: 'long', timeZone: 'Asia/Makassar'
});

const calculateHours = (clockIn, clockOut) => {
  return ((new Date(clockOut) - new Date(clockIn)) / (1000 * 60 * 60)).toFixed(1);
};

const getStartOfWeek = (date) => {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
  return d;
};

const getMonthName = (month) => {
  return ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'][month - 1];
};

// ─────────────────────────────────────────
// External notification helper
// ─────────────────────────────────────────
const sendNotification = async (telegramUserId, message) => {
  if (!bot) return;
  try {
    await bot.sendMessage(telegramUserId, message);
  } catch (e) {
    console.error('sendNotification error:', e.message);
  }
};

module.exports = { initBot, sendNotification };
