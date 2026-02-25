const axios = require('axios');

class GLMService {
  constructor() {
    this.apiKey = process.env.GLM_API_KEY;
    this.apiUrl = process.env.GLM_API_URL || 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
    this.model = process.env.GLM_MODEL || 'glm-4-flash';
  }

  /**
   * Generate chat response from GLM API
   * @param {Array} messages - Chat messages with role and content
   * @param {Object} options - Additional options (temperature, max_tokens, etc.)
   * @returns {Promise<string>} - AI response
   */
  async chat(messages, options = {}) {
    try {
      const response = await axios.post(
        this.apiUrl,
        {
          model: this.model,
          messages: messages,
          temperature: options.temperature || 0.7,
          top_p: options.top_p || 0.9,
          max_tokens: options.max_tokens || 2000,
          stream: false,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
          },
          timeout: 30000,
        }
      );

      return response.data.choices[0].message.content;
    } catch (error) {
      console.error('GLM API Error:', error.response?.data || error.message);
      throw new Error('Failed to get response from GLM API');
    }
  }

  /**
   * Chatbot for attendance system queries
   * @param {string} userMessage - User's question/message
   * @param {Array} chatHistory - Previous chat history
   * @returns {Promise<string>} - AI response
   */
  async chatbot(userMessage, chatHistory = []) {
    const systemPrompt = `You are a helpful assistant for a Cafe Employee Attendance System (Sistem Absensi Kafe).
Your role is to answer questions about:
- Employee attendance (absensi karyawan)
- Clock in/clock out procedures
- Work hours and schedules
- Attendance reports and statistics
- Employee management
- Leave requests and approvals

You respond in Indonesian. Be friendly, professional, and concise.
If you don't know specific information about the system, suggest contacting the admin.`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...chatHistory,
      { role: 'user', content: userMessage },
    ];

    return await this.chat(messages, { temperature: 0.8, max_tokens: 1000 });
  }

  /**
   * Analyze attendance patterns using AI
   * @param {Object} attendanceData - Attendance data to analyze
   * @returns {Promise<Object>} - Analysis results
   */
  async analyzeAttendance(attendanceData) {
    const prompt = `Analisis data kehadiran berikut ini dan berikan insight:

Data Kehadiran:
${JSON.stringify(attendanceData, null, 2)}

Mohon berikan analisis mencakup:
1. Pola kehadiran (kapan karyawan paling sering absen/terlambat)
2. Karyawan dengan kinerja terbaik dan terburuk
3. Hari dengan tingkat ketidakhadiran tertinggi
4. Rekomendasi untuk perbaikan
5. Peringatan dini jika ada masalah

Jawab dalam format JSON:
{
  "summary": "ringkasan singkat",
  "patterns": ["pola yang ditemukan"],
  "topPerformers": ["nama karyawan"],
  "needsAttention": ["nama karyawan bermasalah"],
  "recommendations": ["rekomendasi"],
  "warnings": ["peringatan jika ada"]
}`;

    try {
      if (!this.apiKey || this.apiKey.includes('your-glm-api-key')) {
        throw new Error('API Key not configured');
      }

      const response = await this.chat([
        { role: 'system', content: 'You are an HR analyst specialized in attendance data analysis. Respond in Indonesian.' },
        { role: 'user', content: prompt },
      ], { temperature: 0.5, max_tokens: 2000 });

      // Try to parse JSON response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      // Fallback to text response
      return {
        summary: response,
        patterns: [],
        topPerformers: [],
        needsAttention: [],
        recommendations: [],
        warnings: [],
      };
    } catch (error) {
      console.warn('GLM Analysis Error (Fallling back to manual analysis):', error.message);

      // Manual Analysis Fallback
      const stats = this.calculateBasicStats(attendanceData);
      return {
        summary: `Analisis otomatis berdasarkan data kehadiran. Total kehadiran: ${stats.present}, Terlambat: ${stats.late}.`,
        patterns: [`Tingkat keterlambatan sekitar ${Math.round((stats.late / stats.total) * 100)}%`],
        topPerformers: ["Data performa individual belum tersedia"],
        needsAttention: ["Perlu pengecekan manual untuk karyawan yang sering terlambat"],
        recommendations: ["Pastikan karyawan melakukan clock-in tepat waktu", "Gunakan fitur pengingat"],
        warnings: stats.late > 5 ? ["Tingkat keterlambatan cukup tinggi hari ini"] : []
      };
    }
  }

  calculateBasicStats(data) {
    if (!data || !Array.isArray(data)) return { total: 0, present: 0, late: 0 };
    return {
      total: data.length,
      present: data.filter(d => d.status === 'PRESENT').length,
      late: data.filter(d => d.status === 'LATE').length,
    };
  }

  /**
   * Generate attendance report using AI
   * @param {Object} reportData - Data for the report
   * @param {string} reportType - Type of report (daily, weekly, monthly)
   * @returns {Promise<Object>} - Generated report
   */
  async generateReport(reportData, reportType = 'monthly') {
    const prompt = `Buat laporan kehadiran ${reportType} yang profesional dan lengkap.

Data Laporan:
${JSON.stringify(reportData, null, 2)}

Buat laporan dengan format:
1. Ringkasan Eksekutif
2. Statistik Utama (total kehadiran, ketidakhadiran, keterlambatan)
3. Analisis Per Karyawan
4. Insight dan Rekomendasi
5. Kesimpulan

Gunakan bahasa Indonesia yang formal dan profesional. Format output sebagai JSON:
{
  "title": "Judul Laporan",
  "period": "periode laporan",
  "executiveSummary": "ringkasan eksekutif",
  "keyMetrics": {
    "totalEmployees": 0,
    "attendanceRate": "0%",
    "absenceRate": "0%",
    "lateRate": "0%"
  },
  "employeeAnalysis": ["analisis per karyawan"],
  "insights": ["insight penting"],
  "recommendations": ["rekomendasi tindakan"],
  "conclusion": "kesimpulan"
}`;

    try {
      const response = await this.chat([
        { role: 'system', content: 'You are a professional HR report writer. Create detailed, formal reports in Indonesian.' },
        { role: 'user', content: prompt },
      ], { temperature: 0.6, max_tokens: 2500 });

      // Try to parse JSON response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      // Fallback to text response
      return {
        title: `Laporan Kehadiran ${reportType}`,
        content: response,
      };
    } catch (error) {
      console.error('Report Generation Error:', error);
      throw error;
    }
  }
}

module.exports = new GLMService();
