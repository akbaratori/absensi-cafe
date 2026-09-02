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
  // Jadwal user bulan ini — dipakai untuk validasi dan info hari libur
  const [myMonthSchedule, setMyMonthSchedule] = useState([]);
  const [loadingSchedule, setLoadingSchedule] = useState(true);
  const [validation, setValidation] = useState({
    offDate: { isValid: null, message: "" },
    workDate: { isValid: null, message: "" }
  });

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
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

  // Ambil jadwal user bulan ini untuk menentukan hari libur aktual
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

  // Hari libur aktual user bulan ini berdasarkan jadwal (isOffDay: true)
  const myOffDays = myMonthSchedule
    .filter(s => s.isOffDay)
    .map(s => toDateStr(s.date))
    .sort();

  // Hari kerja aktual user bulan ini berdasarkan jadwal (isOffDay: false)
  const myWorkDays = myMonthSchedule
    .filter(s => !s.isOffDay)
    .map(s => toDateStr(s.date));

  // Fetch rekan kerja yang terjadwal masuk di offDate yang dipilih
  useEffect(() => {
    const fetchTargets = async () => {
      if (!formData.offDate || !user) { setPotentialTargets([]); return; }
      setLoadingTargets(true);
      try {
        const res = await getAllSchedules({ startDate: formData.offDate, endDate: formData.offDate });
        const all = res.data?.data || res.data || [];
        setPotentialTargets(
          (Array.isArray(all) ? all : [])
            .filter(s => s.userId !== user.id && !s.isOffDay)
            .map(s => ({ userId: s.userId, fullName: s.user?.fullName || String(s.userId), shiftName: s.shift?.name || "Shift" }))
        );
        setFormData(prev => ({ ...prev, targetUserId: "" }));
      } catch {
        setPotentialTargets([]);
      } finally {
        setLoadingTargets(false);
      }
    };
    const t = setTimeout(fetchTargets, 300);
    return () => clearTimeout(t);
  }, [formData.offDate, user]);

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
        v.offDate = { isValid: false, message: `Tanggal ${formData.offDate} bukan hari libur Anda. Pilih salah satu dari hari libur di jadwal Anda.` };
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
      } else if (myWorkDays.length > 0 && !myWorkDays.includes(formData.workDate)) {
        v.workDate = { isValid: false, message: `Tanggal ${formData.workDate} bukan hari kerja Anda di jadwal. Pilih hari yang Anda terjadwal masuk.` };
      } else if (formData.offDate && formData.workDate === formData.offDate) {
        v.workDate = { isValid: false, message: "Tanggal ganti masuk tidak boleh sama dengan tanggal libur" };
      } else {
        v.workDate = { isValid: true, message: `Valid: ${getDayNameFromDate(formData.workDate)} — hari kerja Anda` };
      }
    }

    setValidation(v);
  }, [formData.offDate, formData.workDate, myOffDays, myWorkDays, loadingSchedule, myMonthSchedule.length]);

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

        {/* Info: Hari libur user bulan ini */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-xl p-4">
          <p className="text-sm font-semibold text-blue-800 dark:text-blue-200 mb-2">📅 Jadwal Libur Anda Bulan Ini</p>
          {loadingSchedule ? (
            <p className="text-xs text-blue-600 dark:text-blue-400 animate-pulse">Memuat jadwal...</p>
          ) : myOffDays.length === 0 ? (
            <p className="text-xs text-gray-500 dark:text-gray-400 italic">Tidak ada hari libur terjadwal bulan ini.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {myOffDays.map(d => (
                <span key={d} className="inline-flex items-center px-2 py-1 rounded-lg bg-blue-100 dark:bg-blue-800 text-blue-800 dark:text-blue-200 text-xs font-medium">
                  🏖️ {formatDateID(d)}
                </span>
              ))}
            </div>
          )}
          <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
            Pilih salah satu tanggal di atas sebagai <strong>"Tanggal Libur yang Ingin Ditukar"</strong>.
          </p>
        </div>

        {/* Tanggal libur yang ingin ditukar (harus hari libur user) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Tanggal Libur yang Ingin Ditukar <span className="text-red-500">*</span>
          </label>
          <Input
            type="date"
            name="offDate"
            value={formData.offDate}
            onChange={handleChange}
            min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)}
            className={validation.offDate.isValid === false ? "border-red-400" : validation.offDate.isValid === true ? "border-green-400" : ""}
          />
          {formData.offDate && (
            <p className={`text-xs mt-1 ${
              validation.offDate.isValid === false ? "text-red-500" :
              validation.offDate.isValid === true ? "text-green-600" : "text-gray-500"
            }`}>
              {validation.offDate.isValid === false ? "❌" : validation.offDate.isValid === true ? "✅" : "ℹ️"} {validation.offDate.message}
            </p>
          )}
        </div>

        {/* Pilih rekan kerja yang akan menggantikan */}
        {formData.offDate && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Rekan Kerja Pengganti <span className="text-red-500">*</span>
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

        {/* Tanggal ganti masuk (harus hari kerja user) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Tanggal Ganti Masuk (Anda akan masuk di hari ini) <span className="text-red-500">*</span>
          </label>
          <Input
            type="date"
            name="workDate"
            value={formData.workDate}
            onChange={handleChange}
            min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)}
            className={validation.workDate.isValid === false ? "border-red-400" : validation.workDate.isValid === true ? "border-green-400" : ""}
          />
          {formData.workDate && (
            <p className={`text-xs mt-1 ${
              validation.workDate.isValid === false ? "text-red-500" :
              validation.workDate.isValid === true ? "text-green-600" : "text-gray-500"
            }`}>
              {validation.workDate.isValid === false ? "❌" : validation.workDate.isValid === true ? "✅" : "ℹ️"} {validation.workDate.message}
            </p>
          )}
          {myWorkDays.length > 0 && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Pilih tanggal yang Anda terjadwal masuk (bukan hari libur di jadwal Anda).
            </p>
          )}
        </div>

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
            <p className="font-semibold text-amber-800 dark:text-amber-200 mb-2">📋 Ringkasan Permintaan</p>
            <ul className="space-y-1 text-amber-700 dark:text-amber-300 text-xs">
              <li>🏖️ Anda libur pada: <strong>{formatDateID(formData.offDate)}</strong></li>
              <li>💼 Anda masuk ganti pada: <strong>{formatDateID(formData.workDate)}</strong></li>
              <li>👤 Rekan pengganti: <strong>{potentialTargets.find(t => String(t.userId) === String(formData.targetUserId))?.fullName || "-"}</strong></li>
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