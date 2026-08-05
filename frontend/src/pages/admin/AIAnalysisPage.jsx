import { useState, useEffect } from 'react';
import { Brain, AlertTriangle, CheckCircle, User } from 'lucide-react';
import Card from '../../components/shared/Card';
import Button from '../../components/shared/Button';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import api from '../../services/api';

const COLORS = ['#10B981', '#F59E0B', '#EF4444', '#3B82F6'];

const AIAnalysisPage = () => {
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState(null);

  const performAnalysis = async () => {
    setLoading(true);
    try {
      // Fetch data specifically for analysis - currently pulling from history/summary
      // For demo, we trigger the analyze endpoint which does internal logic
      // Ideally we pass date range data here.
      const attendanceResponse = await api.get('/attendance/history?limit=100');
      const attendanceData = attendanceResponse.data.records;

      const response = await api.post('/glm/analyze', { attendanceData });
      setAnalysis(response.data.data.analysis);
    } catch (error) {
      console.error('Analysis failed:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    performAnalysis();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Brain className="text-primary-600" />
            AI Attendance Insights
          </h1>
          <p className="text-gray-600 mt-1">Analisis cerdas performa kehadiran karyawan</p>
        </div>
        <Button onClick={performAnalysis} loading={loading}>
          Analisis Ulang
        </Button>
      </div>

      {analysis && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">Ringkasan Eksekutif</h3>
              <p className="text-gray-700 leading-relaxed">{analysis.summary}</p>

              {analysis.patterns && (
                <div className="mt-4">
                  <h4 className="font-medium text-gray-900 mb-2">Pola Terdeteksi:</h4>
                  <ul className="list-disc pl-5 space-y-1">
                    {analysis.patterns.map((p, i) => (
                      <li key={i} className="text-gray-600 font-medium">{p}</li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>

            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">Rekomendasi Tindakan</h3>
              <div className="space-y-3">
                {analysis.recommendations?.map((rec, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-blue-700 dark:text-blue-300">
                    <CheckCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
                    <p>{rec}</p>
                  </div>
                ))}
                {(!analysis.recommendations || analysis.recommendations.length === 0) && (
                  <p className="text-gray-500 italic">Tidak ada rekomendasi khusus saat ini.</p>
                )}
              </div>

              {analysis.warnings?.length > 0 && (
                <div className="mt-6">
                  <h4 className="font-medium text-red-600 mb-2 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    Perhatian Diperlukan
                  </h4>
                  <ul className="space-y-2">
                    {analysis.warnings.map((w, i) => (
                      <li key={i} className="text-red-600 text-sm">• {w}</li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          </div>

          {/* Charts Section - Using Dummy Data for Visualization if specific stats aren't in AI response, 
              or we could parse them. For now, showing a placeholder chart structure. */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">Distribusi Kehadiran</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Hadir', value: 30 }, // Dummy values for visuals
                        { name: 'Terlambat', value: 5 },
                        { name: 'Absen', value: 2 },
                      ]}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {COLORS.map((color, index) => (
                        <Cell key={`cell-${index}`} fill={color} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
};

export default AIAnalysisPage;
