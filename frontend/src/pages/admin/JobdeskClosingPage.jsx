import { useEffect, useMemo, useState } from 'react';
import Card from '../../components/shared/Card';
import { getUsers } from '../../services/adminService';
import { getClosingConfig, saveClosingConfig } from '../../services/scheduleService';
import {
  DAY_SHORT,
  MONTH_SHORT,
  mondayOf,
  toDateKey,
  generateOpeningClosingRoster,
  validateFourStaff,
  OPENING_CLOSING_CONFIG_KEY,
} from '../../utils/openingClosing';

const today = new Date();
const fmt = (date) => `${DAY_SHORT[date.getDay()]}, ${date.getDate()} ${MONTH_SHORT[date.getMonth()]}`;
const blankStaff = () => Array.from({ length: 4 }, () => ({ id: '', name: '' }));

export default function JobdeskClosingPage() {
  const [employees, setEmployees] = useState([]);
  const [staff, setStaff] = useState(blankStaff);
  const [startDate, setStartDate] = useState(mondayOf(toDateKey(today)));
  const [roster, setRoster] = useState(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [details, setDetails] = useState(false);

  useEffect(() => {
    getUsers({ limit: 100, page: 1, status: 'active' })
      .then((r) => {
        const list = r?.data?.users ?? r?.users ?? [];
        setEmployees(list.filter((u) => u.role === 'EMPLOYEE'));
      })
      .catch(() => {});

    const apply = (c) => {
      if (!Array.isArray(c?.staff)) return;
      setStaff(Array.from({ length: 4 }, (_, i) => c.staff[i] || { id: '', name: '' }));
      if (c.startDate) setStartDate(mondayOf(c.startDate));
    };
    getClosingConfig()
      .then((r) => apply(r?.data?.config))
      .catch(() => {
        try { apply(JSON.parse(localStorage.getItem(OPENING_CLOSING_CONFIG_KEY))); } catch { /* none */ }
      });
  }, []);

  const changeStaff = (i, id) => {
    const u = employees.find((x) => String(x.id) === String(id));
    setStaff((old) => old.map((s, j) => (j === i ? (u ? { id: u.id, name: u.fullName } : { id: '', name: '' }) : s)));
    setSaved(false);
    setRoster(null);
  };

  const generate = () => {
    try {
      if (staff.some((s) => !s.id || !s.name)) throw new Error('Pilih tepat 4 staf dapur (terisi, tanpa duplikat).');
      const monday = mondayOf(startDate);
      setStartDate(monday);
      setRoster(generateOpeningClosingRoster({ staff, startDate: monday }));
      setError('');
      setSaved(false);
    } catch (e) {
      setError(e.message);
    }
  };

  const save = async () => {
    try {
      if (!validateFourStaff(staff) || !roster) throw new Error('Lengkapi 4 staf lalu Generate dulu.');
      const cfg = { version: 2, startDate, staff };
      localStorage.setItem(OPENING_CLOSING_CONFIG_KEY, JSON.stringify(cfg));
      await saveClosingConfig(cfg);
      setSaved(true);
      setError('');
    } catch (e) {
      setError(`Gagal menyimpan: ${e.message}`);
    }
  };

  const fairness = useMemo(() => {
    if (!roster) return {};
    const out = Object.fromEntries(
      staff.map((s) => [s.name, { dapur: 0, area: 0, openCombined: 0, jalur1: 0, jalur2: 0, closeCombined: 0, stock: 0, off: 0 }]),
    );
    const keyFor = (job, combined) => (job.id === combined ? combined : job.id);
    roster.forEach((r) => {
      r.opening.forEach(({ job, person }) => { if (out[person.name]) out[person.name][keyFor(job, 'openCombined')] += 1; });
      r.closing.forEach(({ job, person }) => { if (out[person.name]) out[person.name][keyFor(job, 'closeCombined')] += 1; });
      if (r.stockChecker && out[r.stockChecker.name]) out[r.stockChecker.name].stock += 1;
      if (r.off && out[r.off.name]) out[r.off.name].off += 1;
    });
    return out;
  }, [roster, staff]);

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-4">
      <header>
        <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">🍳 Jobdesk Opening &amp; Closing Dapur</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Jadwal simulasi 4 staf untuk 4 minggu — shift bertukar tiap minggu, pos bergilir tiap hari.</p>
      </header>

      <Card>
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {staff.map((person, i) => (
              <label key={i} className="block text-xs font-semibold text-gray-500">
                Staf {i + 1} · Kelompok {i < 2 ? '1 (Staf 1–2)' : '2 (Staf 3–4)'}
                <select
                  className="mt-1 w-full rounded-md border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 p-2 text-sm"
                  value={person.id}
                  onChange={(e) => changeStaff(i, e.target.value)}
                >
                  <option value="">— pilih staf —</option>
                  {employees.map((u) => (
                    <option key={u.id} value={u.id} disabled={staff.some((p, j) => j !== i && String(p.id) === String(u.id))}>
                      {u.fullName}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs font-semibold text-gray-500">
              Mulai (Senin)
              <input
                type="date"
                className="mt-1 block rounded-md border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 p-2"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </label>
            <button onClick={generate} className="rounded-md bg-indigo-600 hover:bg-indigo-700 px-4 py-2 text-sm font-medium text-white">Generate Jadwal</button>
            {roster && (
              <button onClick={save} className="rounded-md bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-sm font-medium text-white">
                {saved ? '✓ Tersimpan' : 'Simpan'}
              </button>
            )}
          </div>

          <p className="text-xs text-gray-400">Libur Senin–Kamis (satu orang per hari, urutan diputar tiap minggu); Jumat–Minggu semua masuk. Kalau satu orang libur di shift-nya, pos digabung.</p>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      </Card>

      {roster && (
        <>
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-gray-900 dark:text-white">Jadwal 4 Minggu</h2>
            <button onClick={() => setDetails((d) => !d)} className="text-xs text-indigo-600 underline">{details ? 'Sembunyikan rincian' : 'Tampilkan rincian tugas'}</button>
          </div>
          {[1, 2, 3, 4].map((week) => (
            <Card key={week}>
              <div className="p-3 overflow-x-auto">
                <h3 className="font-bold text-sm mb-2">Minggu {week} · {week % 2 === 1 ? 'Kelompok 1 Opening, Kelompok 2 Closing' : 'Kelompok 2 Opening, Kelompok 1 Closing'}</h3>
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 uppercase">
                      <th className="py-2 pr-3">Hari</th>
                      <th className="py-2 pr-3">Libur</th>
                      <th className="py-2 pr-3">Opening (Shift 1)</th>
                      <th className="py-2 pr-3">Closing (Shift 2)</th>
                      <th className="py-2">📋 Stok</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {roster.filter((r) => r.week === week).map((r) => (
                      <tr key={r.dateKey} className={toDateKey(today) === r.dateKey ? 'bg-indigo-50 dark:bg-indigo-900/30' : ''}>
                        <td className="py-2 pr-3 whitespace-nowrap font-medium">{fmt(r.date)}</td>
                        <td className="py-2 pr-3 text-gray-500">{r.off?.name || '—'}</td>
                        <td className="py-2 pr-3">
                          {r.opening.map(({ job, person }) => (
                            <div key={job.id}><b>{person.name}</b> · {job.label}{details && <ul className="ml-4 list-disc text-xs text-gray-500">{job.tasks.map((t) => <li key={t}>{t}</li>)}</ul>}</div>
                          ))}
                        </td>
                        <td className="py-2 pr-3">
                          {r.closing.map(({ job, person }) => (
                            <div key={job.id}><b>{person.name}</b> · {job.label}{details && <ul className="ml-4 list-disc text-xs text-gray-500">{job.tasks.map((t) => <li key={t}>{t}</li>)}</ul>}</div>
                          ))}
                        </td>
                        <td className="py-2 text-gray-500">{r.stockChecker?.name || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}

          <Card>
            <div className="p-4 overflow-x-auto">
              <h3 className="font-bold mb-3">⚖️ Ringkasan Keadilan</h3>
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 uppercase">
                    {['Nama', 'Dapur', 'Area', 'Dapur+Area', 'Jalur 1', 'Jalur 2', 'Jalur 1+2', 'Stok', 'Libur'].map((h) => <th key={h} className="px-2 py-1">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(fairness).map(([name, c]) => (
                    <tr key={name}>
                      <td className="py-1 px-2 font-medium">{name}</td>
                      {['dapur', 'area', 'openCombined', 'jalur1', 'jalur2', 'closeCombined', 'stock', 'off'].map((k) => <td key={k} className="py-1 px-2 text-center">{c[k]}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-gray-400">Laporan stok DD9 dicek Senin &amp; Kamis oleh pasangan shift 2. Angka dihitung ulang saat Generate.</p>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}