import { useState, useEffect } from "react";
import Modal from "../shared/Modal";
import Button from "../shared/Button";
import Input from "../shared/Input";
import { useAuth } from "../../contexts/AuthContext";
import { createOffDayRequest } from "../../services/offDayService";
import { getAllSchedules, getUserSchedule } from "../../services/scheduleService";
import { showSuccess, showError } from "../../hooks/useToast";

const OffDayRequestModal = ({ onClose, onSuccess }) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    targetUserId: "",
    offDate: "",
    workDate: "",
    reason: "",
  });
  const [potentialTargets, setPotentialTargets] = useState([]);
  const [loadingTargets, setLoadingTargets] = useState(false);
  
  // Jadwal user bulan ini — dipakai untuk daftar hari libur pemohon
  const [myMonthSchedule, setMyMonthSchedule] = useState([]);
  const [loadingSchedule, setLoadingSchedule] = useState(true);

  // Jadwal target bulan ini — dipakai untuk daftar hari libur target (workDate)
  const [targetMonthSchedule, setTargetMonthSchedule] = useState([]);
  const [loadingTargetSchedule, setLoadingTargetSchedule] = useState(false);

  const [validation, setValidation] = useState({
    offDate: { isValid: null, message: "" },
    workDate: { isValid: null, message: "" }
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === "targetUserId") {
      setFormData(prev => ({ ...prev, targetUserId: value, workDate: "" }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const getDayName = (i) => ["Minggu","Senin","Selasa","Rabu","Kamis","Jumat","Sabtu"][i];
  const getDayNameFromDate = (s) => {
    if (!s) return "";
    const [y,m,d] = s.split("-").map(Number);
    return getDayName(new Date(y, m-1, d).getDay());
  };

  // Normalisasi tanggal dari API (ISO string atau Date) ke format YYYY-MM-DD
  const toDateStr = (val) => {
    if (!val) return "";
    if (typeof val === "string") return val.slice(0, 10);
    return new Date(val).toISOString().slice(0, 10);
  };

  // Ambil jadwal pemohon bulan ini untuk menentukan hari libur pemohon
  useEffect(() => {
    const fetchMySchedule = async () => {
      if (!user) return;
      setLoadingSchedule(true);
      try {
        const now = new Date();
        const startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
        const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
        const res = await getUserSchedule(user.id, startDate, endDate);
        const raw = res.data?.data || res.data || [];
        setMyMonthSchedule(Array.isArray(raw) ? raw : []);
      } catch {
        setMyMonthSchedule([]);
      } finally {
        setLoadingSchedule(false);
      }
    };
    fetchMySchedule();
  }, [user]);

  // Hari libur aktual pemohon (isOffDay: true)
  const myOffDays = myMonthSchedule
    .filter(s => s.isOffDay)
    .map(s => toDateStr(s.date))
    .sort();

  // Hari kerja pemohon
  const myWorkDays = myMonthSchedule
    .filter(s => !s.isOffDay)
    .map(s => toDateStr(s.date));

  // Fetch rekan kerja yang terjadwal MASUK (bekerja) di offDate yang dipilih
  useEffect(() => {
    const fetchTargets = async () => {
      if (!formData.offDate || !user) { 
        setPotentialTargets([]); 
        return; 
      }
      setLoadingTargets(true);
      try {
        const res = await getAllSchedules({ startDate: formData.offDate, endDate: formData.offDate });
        const all = res.data?.data || res.data || [];
        setPotentialTargets(
          (Array.isArray(all) ? all : [])
            .filter(s => s.userId !== user.id && !s.isOffDay)
            .map(s => ({ userId: s.userId, fullName: s.user?.fullName || String(s.userId), shiftName: s.shift?.name || "Shift" }))
        );
        setFormData(prev => ({ ...prev, targetUserId: "", workDate: "" }));
      } catch {
        setPotentialTargets([]);
      } finally {
        setLoadingTargets(false);
      }
    };
    const t = setTimeout(fetchTargets, 300);
    return () => clearTimeout(t);
  }, [formData.offDate, user]);

  // Ambil jadwal rekan kerja terpilih untuk menentukan hari libur rekan pengganti
  useEffect(() => {
    const fetchTargetSchedule = async () => {
      if (!formData.targetUserId) {
        setTargetMonthSchedule([]);
        return;
      }
      setLoadingTargetSchedule(true);
      try {
        const now = new Date();
        const startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
        const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
        const res = await getUserSchedule(formData.targetUserId, startDate, endDate);
        const raw = res.data?.data || res.data || [];
        setTargetMonthSchedule(Array.isArray(raw) ? raw : []);
      } catch {
        setTargetMonthSchedule([]);
      } finally {
        setLoadingTargetSchedule(false);
      }
    };
    fetchTargetSchedule();
  }, [formData.targetUserId]);

  // Hari libur rekan terpilih (hanya hari di mana rekan libur)
  const targetOffDays = targetMonthSchedule
    .filter(s => s.isOffDay)
    .map(s => toDateStr(s.date))
    .sort();

  const selectedTargetName = potentialTargets.find(t => String(t.userId) === String(formData.targetUserId))?.fullName || "Rekan Kerja";

  // Validasi real-time berdasarkan jadwal aktual
  useEffect(() => {
    if (loadingSchedule) return;
    const today = new Date(); today.setHours(0,0,0,0);
    const v = {
      offDate: { isValid: null, message: "" },
      workDate: { isValid: null, message: "" }
    };

    if (formData.offDate) {
      const [y,m,d] = formData.offDate.split("-").map(Number);
      const chosen = new Date(y, m-1, d);
      if (chosen <= today) {
        v.offDate = { isValid: false, message: "Tanggal harus setelah hari ini" };
      } else if (myOffDays.length > 0 && !myOffDays.includes(formData.offDate)) {
        v.offDate = { isValid: false, message: `Tanggal ${formData.offDate} bukan hari libur Anda. Pilih salah satu dari jadwal libur Anda.` };
      } else if (myOffDays.length === 0 && myMonthSchedule.length > 0) {
        v.offDate = { isValid: null, message: "Tidak ada hari libur di jadwal bulan ini" };
      } else {
        v.offDate = { isValid: true, message: `Valid: ${getDayNameFromDate(formData.offDate)} — hari libur Anda` };
      }
    }

    if (formData.workDate) {
      const [y,m,d] = formData.workDate.split("-").map(Number);
      const chosen = new Date(y, m-1, d);
      if (chosen <= today) {
        v.workDate = { isValid: false, message: "Tanggal harus setelah hari ini" };
      } else if (targetOffDays.length > 0 && !targetOffDays.includes(formData.workDate)) {
        v.workDate = { isValid: false, message: `Tanggal ${formData.workDate} bukan hari libur ${selectedTargetName}. Pilih salah satu hari libur rekan pengganti.` };
      } else if (myOffDays.includes(formData.workDate)) {
        v.workDate = { isValid: false, message: "Anda juga libur pada tanggal ini. Pilih hari di mana Anda terjadwal masuk bekerja." };
      } else if (formData.offDate && formData.workDate === formData.offDate) {
        v.workDate = { isValid: false, message: "Tanggal ganti libur tidak boleh sama dengan tanggal libur Anda" };
      } else {
        v.workDate = { isValid: true, message: `Valid: ${getDayNameFromDate(formData.workDate)} — ${selectedTargetName} libur & Anda masuk` };
      }
    }

    setValidation(v);
  }, [formData.offDate, formData.workDate, myOffDays, myWorkDays, targetOffDays, selectedTargetName, loadingSchedule, myMonthSchedule.length]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.targetUserId || !formData.offDate || !formData.workDate) {
      showError("Lengkapi semua field yang wajib diisi");
      return;
    }
    if (validation.offDate.isValid === false || validation.workDate.isValid === false) {
      showError("Perbaiki kesalahan pada form sebelum submit");
      return;
    }
    setLoading(true);
    try {
      await createOffDayRequest({
        targetUserId: Number(formData.targetUserId),
        offDate: formData.offDate,
        workDate: formData.workDate,
        reason: formData.reason,
      });
      showSuccess("Permintaan tukar libur berhasil dikirim!");
      onSuccess?.();
      onClose();
    } catch (err) {
      showError(err.response?.data?.message || "Gagal mengirim permintaan");
    } finally {
      setLoading(false);
    }
  };

  const formatDateID = (s) => {
    if (!s) return "-";
    const [y,m,d] = s.split("-").map(Number);
    const names = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
    return `${getDayNameFromDate(s)}, ${d} ${names[m-1]} ${y}`;
  };

  return (
    <Modal isOpen={true} onClose={onClose} title="Ajukan Tukar Hari Libur">
      <form onSubmit={handleSubmit} className="space-y-4">

        {/* Info & Pilihan: Hari Libur Pemohon */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-xl p-4">
          <p className="text-sm font-semibold text-blue-800 dark:text-blue-200 mb-2">📅 1. Pilih Jadwal Libur Anda yang Ingin Ditukar</p>
          {loadingSchedule ? (
            <p className="text-xs text-blue-600 dark:text-blue-400 animate-pulse">Memuat jadwal...</p>
          ) : myOffDays.length === 0 ? (
            <p className="text-xs text-gray-500 dark:text-gray-400 italic">Tidak ada hari libur terjadwal bulan ini.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {myOffDays.map(d => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, offDate: d }))}
                  className={`inline-flex items-center px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    formData.offDate === d
                      ? "bg-blue-600 text-white shadow"
                      : "bg-blue-100 dark:bg-blue-800 text-blue-800 dark:text-blue-200 hover:bg-blue-200 dark:hover:bg-blue-700"
                  }`}
                >
                  🏖️ {formatDateID(d)}
                </button>
              ))}
            </div>
          )}
          {formData.offDate && (
            <p className={`text-xs mt-2 ${
              validation.offDate.isValid === false ? "text-red-500" :
              validation.offDate.isValid === true ? "text-green-600 dark:text-green-400 font-medium" : "text-gray-500"
            }`}>
              {validation.offDate.isValid === false ? "❌" : validation.offDate.isValid === true ? "✅" : "ℹ️"} {validation.offDate.message}
            </p>
          )}
        </div>

        {/* Pilih Rekan Kerja yang Masuk di offDate */}
        {formData.offDate && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              2. Pilih Rekan Kerja Pengganti (yang masuk di tanggal libur Anda) <span className="text-red-500">*</span>
            </label>
            {loadingTargets ? (
              <p className="text-xs text-gray-500 animate-pulse">Mencari rekan yang masuk pada tanggal tersebut...</p>
            ) : potentialTargets.length === 0 ? (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                ⚠️ Tidak ada rekan yang terjadwal masuk pada tanggal ini.
              </p>
            ) : (
              <select
                name="targetUserId"
                value={formData.targetUserId}
                onChange={handleChange}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                required
              >
                <option value="">-- Pilih rekan kerja --</option>
                {potentialTargets.map(t => (
                  <option key={t.userId} value={t.userId}>
                    {t.fullName} ({t.shiftName})
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        {/* Pilihan Hari Libur Pengganti (Hari libur milik targetUserId) */}
        {formData.targetUserId && (
          <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700 rounded-xl p-4">
            <p className="text-sm font-semibold text-purple-800 dark:text-purple-200 mb-2">
              🔄 3. Pilih Jadwal Libur {selectedTargetName} (Hari Libur Pengganti Anda)
            </p>
            {loadingTargetSchedule ? (
              <p className="text-xs text-purple-600 dark:text-purple-400 animate-pulse">Memuat jadwal libur {selectedTargetName}...</p>
            ) : targetOffDays.length === 0 ? (
              <p className="text-xs text-amber-600 dark:text-amber-400 italic">
                {selectedTargetName} tidak memiliki jadwal libur yang tersedia bulan ini.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto">
                {targetOffDays.map(d => {
                  const isRequesterAlsoOff = myOffDays.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      disabled={isRequesterAlsoOff}
                      onClick={() => setFormData(prev => ({ ...prev, workDate: d }))}
                      className={`inline-flex items-center px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        formData.workDate === d
                          ? "bg-purple-600 text-white shadow"
                          : isRequesterAlsoOff
                          ? "bg-gray-200 dark:bg-gray-800 text-gray-400 cursor-not-allowed line-through"
                          : "bg-purple-100 dark:bg-purple-800 text-purple-800 dark:text-purple-200 hover:bg-purple-200 dark:hover:bg-purple-700"
                      }`}
                    >
                      🏖️ {formatDateID(d)} {isRequesterAlsoOff ? "(Anda juga libur)" : ""}
                    </button>
                  );
                })}
              </div>
            )}
            {formData.workDate && (
              <p className={`text-xs mt-2 ${
                validation.workDate.isValid === false ? "text-red-500" :
                validation.workDate.isValid === true ? "text-green-600 dark:text-green-400 font-medium" : "text-gray-500"
              }`}>
                {validation.workDate.isValid === false ? "❌" : validation.workDate.isValid === true ? "✅" : "ℹ️"} {validation.workDate.message}
              </p>
            )}
            <p className="text-xs text-purple-600 dark:text-purple-400 mt-2">
              Pada tanggal ini, <strong>{selectedTargetName}</strong> akan masuk dan <strong>Anda</strong> libur menggantikannya.
            </p>
          </div>
        )}

        {/* Alasan */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Alasan</label>
          <textarea
            name="reason"
            value={formData.reason}
            onChange={handleChange}
            rows={3}
            placeholder="Tuliskan alasan pengajuan tukar libur..."
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
          />
        </div>

        {/* Ringkasan */}
        {formData.offDate && formData.workDate && formData.targetUserId && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl p-4 text-sm">
            <p className="font-semibold text-amber-800 dark:text-amber-200 mb-2">📋 Ringkasan Pertukaran Libur</p>
            <ul className="space-y-1 text-amber-700 dark:text-amber-300 text-xs">
              <li>🏖️ <strong>{formatDateID(formData.offDate)}</strong>: Rekan <strong>{selectedTargetName}</strong> masuk menggantikan libur Anda (Anda bekerja di hari pengganti).</li>
              <li>💼 <strong>{formatDateID(formData.workDate)}</strong>: Anda libur pada hari libur milik rekan <strong>{selectedTargetName}</strong>.</li>
              <li>👤 Rekan yang ditukar: <strong>{selectedTargetName}</strong></li>
            </ul>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose} disabled={loading}>
            Batal
          </Button>
          <Button
            type="submit"
            variant="primary"
            className="flex-1"
            loading={loading}
            disabled={loading || !formData.targetUserId || !formData.offDate || !formData.workDate || validation.offDate.isValid === false || validation.workDate.isValid === false}
          >
            Kirim Permintaan
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default OffDayRequestModal;
