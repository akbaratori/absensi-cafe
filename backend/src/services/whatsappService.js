/**
 * WhatsApp Notification Service via Fonnte API
 * Fonnte: https://fonnte.com (free plan tersedia untuk testing)
 *
 * Setup:
 * 1. Daftar di fonnte.com
 * 2. Hubungkan nomor WhatsApp Anda
 * 3. Salin token API ke FONNTE_TOKEN di .env
 * 4. Set WA_GROUP_TARGET ke nomor tujuan (HP: 628xxx / Grup: 628xxx-xxx@g.us)
 */

const https = require('https');
const http = require('http');

const FONNTE_TOKEN = process.env.FONNTE_TOKEN || '';
const WA_GROUP_TARGET = process.env.WA_GROUP_TARGET || '';
const FONNTE_API_URL = 'https://api.fonnte.com/send';

/**
 * Kirim pesan WhatsApp via Fonnte API
 * @param {string} target - Nomor tujuan (628xxx atau grup 628xxx@g.us)
 * @param {string} message - Pesan yang akan dikirim
 * @returns {Promise<Object>} Response dari Fonnte API
 */
const sendMessage = async (target, message) => {
  if (!FONNTE_TOKEN) {
    console.warn('[WhatsApp] FONNTE_TOKEN belum dikonfigurasi, pesan tidak dikirim.');
    return { success: false, reason: 'FONNTE_TOKEN not configured' };
  }

  if (!target) {
    console.warn('[WhatsApp] Target nomor/grup WhatsApp belum dikonfigurasi.');
    return { success: false, reason: 'Target not configured' };
  }

  return new Promise((resolve) => {
    const postData = JSON.stringify({
      target,
      message,
      countryCode: '62',
    });

    const options = {
      hostname: 'api.fonnte.com',
      path: '/send',
      method: 'POST',
      headers: {
        'Authorization': FONNTE_TOKEN,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.status) {
            console.log(`[WhatsApp] Pesan terkirim ke ${target}`);
          } else {
            console.warn(`[WhatsApp] Gagal kirim: ${data}`);
          }
          resolve(result);
        } catch {
          console.warn('[WhatsApp] Response parse error:', data);
          resolve({ success: false, raw: data });
        }
      });
    });

    req.on('error', (err) => {
      console.error('[WhatsApp] Request error:', err.message);
      resolve({ success: false, error: err.message });
    });

    req.write(postData);
    req.end();
  });
};

/**
 * Format dan kirim laporan absensi setelah clock-in
 * @param {Object} data - Data absensi
 * @param {string} data.employeeName - Nama pegawai
 * @param {string} data.employeeId - ID pegawai
 * @param {Date}   data.clockInTime - Waktu clock-in (UTC)
 * @param {string} data.shiftName   - Nama shift
 * @param {string} data.shiftStart  - Jam mulai shift (HH:mm)
 * @param {string} data.status      - Status absensi ('PRESENT' | 'LATE')
 * @param {string} [data.notes]     - Catatan (opsional)
 * @param {string} [target]         - Override target (default: WA_GROUP_TARGET)
 */
const sendAttendanceReport = async (data, target) => {
  const dest = target || WA_GROUP_TARGET;
  if (!dest) {
    console.warn('[WhatsApp] WA_GROUP_TARGET tidak dikonfigurasi, laporan absen tidak dikirim.');
    return;
  }

  // Format waktu ke WITA (UTC+8)
  const clockInWITA = new Date(data.clockInTime.getTime() + 8 * 3600 * 1000);
  const timeStr = clockInWITA.toISOString().slice(11, 16); // HH:mm
  const dateStr = clockInWITA.toISOString().slice(0, 10);  // YYYY-MM-DD

  // Format tanggal ke bahasa Indonesia
  const dateFormatted = new Date(data.clockInTime).toLocaleDateString('id-ID', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    timeZone: 'Asia/Makassar',
  });

  const statusEmoji = data.status === 'LATE' ? '⚠️ TERLAMBAT' : '✅ TEPAT WAKTU';
  const shiftInfo = data.shiftStart ? `Shift ${data.shiftName || ''} (${data.shiftStart})` : data.shiftName || '-';

  const message = [
    `🏪 *LAPORAN ABSEN MASUK*`,
    `─────────────────`,
    `📅 ${dateFormatted}`,
    `👤 *${data.employeeName}* (${data.employeeId || '-'})`,
    `⏰ Clock-In: *${timeStr} WITA*`,
    `🕐 ${shiftInfo}`,
    `📊 Status: *${statusEmoji}*`,
    data.notes ? `📝 Ket: ${data.notes}` : null,
    `─────────────────`,
  ].filter(Boolean).join('\n');

  return await sendMessage(dest, message);
};

module.exports = {
  sendMessage,
  sendAttendanceReport,
};
