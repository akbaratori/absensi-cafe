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
  // Guard terakhir: semua pesan keluar lewat sini, jadi header cron yang
  // ditempel pihak ketiga (mis. "Cronjob Response: ... (job_id: ...)")
  // dipastikan tidak pernah ikut terkirim, dari jalur mana pun.
  const clean = stripCronNoise(message).trim();
  if (!clean) {
    console.warn('[WhatsApp] Pesan kosong setelah header cron dibersihkan, tidak dikirim.');
    return { success: false, reason: 'Empty message after cron-header cleanup' };
  }
  message = clean;

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
 * Buang header tambahan yang ditempel layanan cron di luar aplikasi
 * (mis. "Cronjob Response: laporan-absensi-harian (job_id: 87ba56470480)").
 *
 * Header ini muncul kalau endpoint cron dikonfigurasi mem-forward seluruh
 * respon HTTP ke WhatsApp. Isinya cuma metadata internal (nama job + id) yang
 * tidak ada gunanya dibaca pegawai, jadi dipotong sebelum dikirim.
 *
 * @param {string} text
 * @returns {string}
 */
const stripCronNoise = (text) => {
  if (!text) return text;

  let out = String(text);

  // Buang BOM / karakter tak terlihat di awal.
  out = out.replace(/^\uFEFF/, '');

  // Header bisa muncul beberapa kali (job terantre) — bersihkan berulang.
  let prev;
  do {
    prev = out;
    out = out
      // "Cronjob Response: nama-job" + "(job_id: 123)" dalam satu/dua baris.
      .replace(/^\s*cronjob\s*response\s*:\s*[^\r\n(]*?(?:\(\s*job[_-]?id\s*:\s*[^)]*\))?\s*[\r\n]+/i, '')
      // Baris "(job_id: ...)" yang masih tersisa, dengan/tanpa nama job.
      .replace(/^\s*(?:job\s*)?[_-]?id\s*:\s*[^\r\n)）]*\)?\s*[\r\n]+/i, '')
      .replace(/^\s*\(\s*job[_-]?id\s*:\s*[^)]*\)\s*[\r\n]*/i, '')
      // Baris pemisah kosong yang tertinggal setelah header dipotong.
      .replace(/^[\s\r\n]+/, '');
  } while (out !== prev);

  return out;
};

/**
 * Siapkan pesan keluar: rapikan format, buang header cron, tolak pesan kosong.
 *
 * @param {string} payload
 * @param {string} [target]
 * @returns {Promise<Object>} { ok: true, message } atau { ok: false, reason }
 */
const prepareOutgoingMessage = (payload, target) => {
  const clean = stripCronNoise(payload).trim();
  if (!clean) {
    return { ok: false, reason: 'Pesan kosong setelah header cron dibersihkan' };
  }
  return { ok: true, target, message: clean };
};

/**
 * Format dan kirim laporan absensi setelah clock-in
 *
 * Isi pesan sengaja dibuat ringkas dan langsung ke inti: judul laporan + data
 * absensi. Judul memakai nama job cron ("laporan-absensi-harian") supaya
 * langsung jelas ini laporan apa — tapi tanpa embel-embel teknis
 * "Cronjob Response:" / "(job_id: ...)" yang tidak ada gunanya bagi pembaca.
 *
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

  // Bersihkan dulu: buang header cron kalau ada, dan jangan kirim pesan kosong.
  const prepared = prepareOutgoingMessage(message, dest);
  if (!prepared.ok) {
    console.warn(`[WhatsApp] ${prepared.reason} — laporan absen tidak dikirim.`);
    return { success: false, reason: prepared.reason };
  }

  return await sendMessage(prepared.target, prepared.message);
};

/**
 * Susun isi pesan laporan absensi HARIAN (semua pegawai) untuk grup WhatsApp.
 *
 * Dipisah dari pengiriman supaya isinya bisa diuji tanpa memanggil Fonnte.
 * Judul sengaja persis "LAPORAN ABSENSI HARIAN CAFE" dan TANPA embel-embel
 * teknis — ini pesan yang dibaca pegawai, bukan log sistem.
 *
 * @param {Object} data
 * @param {string} data.date          - tanggal laporan (YYYY-MM-DD, WITA)
 * @param {Object} [data.summary]     - { totalEmployees, present, late, absent, halfDay, notClockedIn }
 * @param {Array}  [data.records]     - baris absensi (dipakai untuk daftar nama terlambat)
 * @returns {string}
 */
const buildDailyAttendanceReport = (data = {}) => {
  const { date, summary = {}, records = [] } = data;

  const dateLabel = date
    ? new Date(`${String(date).slice(0, 10)}T00:00:00+08:00`).toLocaleDateString('id-ID', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      timeZone: 'Asia/Makassar',
    })
    : new Date().toLocaleDateString('id-ID', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      timeZone: 'Asia/Makassar',
    });

  // Nama pegawai yang terlambat — inti yang dicari pembaca laporan pagi.
  const lateNames = records
    .filter((r) => String(r.status || '').toUpperCase().includes('LATE')
      || String(r.status || '').toUpperCase().includes('TERLAMBAT'))
    .map((r) => r.user?.fullName || r.user?.employeeId || '-')
    .filter(Boolean);

  const lines = [
    `🏪 *LAPORAN ABSENSI HARIAN CAFE*`,
    `📅 ${dateLabel}`,
    `─────────────────`,
    `👥 Total pegawai: *${summary.totalEmployees ?? 0}*`,
    `✅ Tepat waktu: *${summary.present ?? 0}*`,
    `⚠️ Terlambat: *${summary.late ?? 0}*${lateNames.length ? ` (${lateNames.join(', ')})` : ''}`,
    `🕐 Setengah hari: *${summary.halfDay ?? 0}*`,
    `🏖️ Tidak masuk: *${summary.absent ?? 0}*`,
    `❓ Belum absen: *${summary.notClockedIn ?? 0}*`,
    `─────────────────`,
  ];

  return lines.join('\n');
};

/**
 * Kirim laporan absensi harian (semua pegawai) ke grup WhatsApp.
 *
 * @param {Object} data   - { date, summary, records } dari attendanceService.getDailySummary()
 * @param {string} [target] - Override target (default: WA_GROUP_TARGET)
 */
const sendDailyAttendanceReport = async (data, target) => {
  const dest = target || WA_GROUP_TARGET;
  if (!dest) {
    console.warn('[WhatsApp] WA_GROUP_TARGET tidak dikonfigurasi, laporan harian tidak dikirim.');
    return { success: false, reason: 'Target not configured' };
  }

  const message = buildDailyAttendanceReport(data);
  return await sendMessage(dest, message);
};

module.exports = {
  sendMessage,
  sendAttendanceReport,
  buildDailyAttendanceReport,
  sendDailyAttendanceReport,
  stripCronNoise,
  prepareOutgoingMessage,
};
