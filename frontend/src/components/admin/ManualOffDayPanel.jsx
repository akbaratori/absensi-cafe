import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import rotationService from '../../services/rotationService';

export default function ManualOffDayPanel({ weekStart, roster }) {
  const [manualOffDays, setManualOffDays] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (weekStart) fetchManualOffDays();
  }, [weekStart]);

  const fetchManualOffDays = async () => {
    try {
      const res = await rotationService.getManualOffDays(weekStart);
      setManualOffDays(res.data.data);
    } catch (err) {
      toast.error('Gagal memuat data libur manual');
    }
  };

  const toggleOffDay = (userId, date) => {
    const dateStr = new Date(date).toISOString().split('T')[0];
    const exists = manualOffDays.find(m => m.userId === userId && new Date(m.date).toISOString().split('T')[0] === dateStr);
    
    if (exists) {
      setManualOffDays(prev => prev.filter(m => !(m.userId === userId && new Date(m.date).toISOString().split('T')[0] === dateStr)));
    } else {
      setManualOffDays(prev => [...prev, { userId, date }]);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      await rotationService.saveManualOffDays(weekStart, manualOffDays);
      toast.success('Libur manual berhasil disimpan');
    } catch (err) {
      toast.error('Gagal menyimpan libur manual');
    } finally {
      setLoading(false);
    }
  };

  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  return (
    <div className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow-md mt-4">
      <h3 className="text-lg font-semibold mb-4">Konfirmasi Libur Manual</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="p-2 border">Pegawai</th>
              {weekDates.map(d => <th key={d} className="p-2 border">{d.toLocaleDateString('id-ID', { weekday: 'short' })}</th>)}
            </tr>
          </thead>
          <tbody>
            {roster.map(member => (
              <tr key={member.userId}>
                <td className="p-2 border font-medium">{member.user.name}</td>
                {weekDates.map(d => {
                  const dateStr = d.toISOString().split('T')[0];
                  const isChecked = manualOffDays.some(m => m.userId === member.userId && new Date(m.date).toISOString().split('T')[0] === dateStr);
                  return (
                    <td key={d} className="p-2 border text-center">
                      <input 
                        type="checkbox" 
                        checked={isChecked}
                        onChange={() => toggleOffDay(member.userId, d)}
                        className="h-4 w-4"
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button 
        onClick={handleSave}
        disabled={loading}
        className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? 'Menyimpan...' : 'Simpan Konfirmasi'}
      </button>
    </div>
  );
}