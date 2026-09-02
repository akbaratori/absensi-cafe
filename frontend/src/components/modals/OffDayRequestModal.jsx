import { useState, useEffect } from "react";
import Modal from "../shared/Modal";
import Button from "../shared/Button";
import Input from "../shared/Input";
import { useAuth } from "../../contexts/AuthContext";
import { createOffDayRequest } from "../../services/offDayService";
import { getAllSchedules } from "../../services/scheduleService";
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
    const [y,m,d] = s.split('-').map(Number);
    return getDayName(new Date(y, m-1, d).getDay());
  };

  // Fetch rekan kerja yang terjadwal masuk di offDate yang dipilih
  useEffect(() => {
    const fetchTargets = async () => {
      if (!formData.offDate || !user) { setPotentialTargets([]); return; }
      setLoadingTargets(true);
      try {
        const res = await getAllSchedules({ startDate: formData.offDate, endDate: formData.offDate });
        const all = res.data?.data || res.data || [];
        setPotentialTargets(
          all.filter(s => s.userId !== user.id && !s.isOffDay)
             .map(s => ({ userId: s.userId, fullName: s.user?.fullName || s.userId, shiftName: s.shift?.name || "Shift" }))
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

  // Validasi real-time
  useEffect(() => {
    const idx = user?.offDay || 0;
    const today = new Date(); today.setHours(0,0,0,0);
    const v = { offDate: { isValid: null, message: "" }, workDate: { isValid: null, message: "" } };

    if (!formData.offDate) {
      v.offDate = { isValid: null, message: "Pilih hari kerja yang ingin Anda liburkan" };
    } else {
      const d = new Date(formData.offDate); d.setHours(0,0,0,0);
      if (d <= today) v.offDate = { isValid: false, message: "Tanggal harus di masa depan" };
      else if (d.getDay() === idx) v.offDate = { isValid: false, message: `Ini hari libur rutin Anda (${getDayName(idx)})` };
      else v.offDate = { isValid: true, message: `Valid: Hari ${getDayNameFromDate(formData.offDate)} (Hari Kerja)` };
    }

    if (!formData.workDate) {
      v.workDate = { isValid: null, message: `Pilih hari ${getDayName(idx)} sebagai pengganti` };
    } else {
      const d = new Date(formData.workDate); d.setHours(0,0,0,0);
      if (d <= today) v.workDate = { isValid: false, message: "Tanggal harus di masa depan" };
      else if (d.getDay() !== idx) v.workDate = { isValid: false, message: `Harap pilih hari ${getDayName(idx)} (Libur Rutin)` };
      else if (formData.offDate && new Date(formData.offDate).getTime() === d.getTime()) v.workDate = { isValid: false, message: "Tanggal tidak boleh sama" };
      else v.workDate = { isValid: true, message: `Valid: Hari ${getDayNameFromDate(formData.workDate)} (Hari Libur)` };
    }
    setValidation(v);
  }, [formData.offDate, formData.workDate, user]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.targetUserId) { showError("Pilih rekan kerja terlebih dahulu"); return; }
    if (validation.offDate.isValid === false || validation.workDate.isValid === false) { showError("Perbaiki kesalahan pada formulir"); return; }
    setLoading(true);
    try {
      await createOffDayRequest(formData);
      showSuccess("Permintaan tukar libur berhasil dikirim");
      onSuccess?.();
      onClose();
    } catch (err) {
      showError(err.response?.data?.error?.message || err.response?.data?.message || "Gagal mengirim permintaan");
    } finally {
      setLoading(false);
    }
  };

  const idx = user?.offDay || 0;

  return (
    <Modal isOpen={true} onClose={onClose} title="Ajukan Tukar Libur">
      <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500 rounded text-sm">
        <p className="font-semibold text-blue-800 dark:text-blue-200 mb-1">Panduan Tukar Libur</p>
        <ul className="list-disc pl-4 space-y-1 text-gray-700 dark:text-gray-300">
          <li><strong>Hari Libur Rutin Anda:</strong> {getDayName(idx)}</li>
          <li><strong>Tanggal Ingin Libur:</strong> Hari kerja yang ingin Anda liburkan.</li>
          <li><strong>Tanggal Pengganti:</strong> Hari {getDayName(idx)} di mana Anda akan masuk sebagai gantinya.</li>
          <li><strong>Rekan Kerja:</strong> Karyawan yang masuk di hari libur Anda (perlu konfirmasi).</li>
        </ul>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Tanggal Ingin Libur */}
        <Input
          label="Tanggal Ingin Libur (Off Date)"
          name="offDate" type="date"
          value={formData.offDate} onChange={handleChange} required
          helperText={validation.offDate.message}
          className={validation.offDate.isValid === false ? "border-red-500" : validation.offDate.isValid === true ? "border-green-500" : ""}
        />

        {/* Pilih Rekan Kerja */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Rekan Kerja yang Masuk di Hari Itu
          </label>
          <select
            name="targetUserId"
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 px-3 py-2 focus:ring-primary-500 focus:border-primary-500 disabled:opacity-50"
            value={formData.targetUserId}
            onChange={(e) => setFormData({ ...formData, targetUserId: e.target.value })}
            required
            disabled={!formData.offDate || loadingTargets || validation.offDate.isValid !== true}
          >
            <option value="">
              {loadingTargets ? "Memuat jadwal..."
                : !formData.offDate || validation.offDate.isValid !== true ? "-- Pilih Tanggal Libur Dulu --"
                : potentialTargets.length === 0 ? "-- Tidak ada rekan kerja di hari ini --"
                : "-- Pilih Rekan Kerja --"}
            </option>
            {potentialTargets.map(t => (
              <option key={t.userId} value={t.userId}>{t.fullName} — {t.shiftName}</option>
            ))}
          </select>
          {formData.offDate && validation.offDate.isValid === true && !loadingTargets && potentialTargets.length === 0 && (
            <p className="text-xs text-orange-500 mt-1">Tidak ada rekan kerja terjadwal masuk di tanggal ini.</p>
          )}
        </div>

        {/* Tanggal Pengganti Kerja */}
        <Input
          label={`Tanggal Pengganti Kerja (Work Date) — harus hari ${getDayName(idx)}`}
          name="workDate" type="date"
          value={formData.workDate} onChange={handleChange} required
          helperText={validation.workDate.message}
          className={validation.workDate.isValid === false ? "border-red-500" : validation.workDate.isValid === true ? "border-green-500" : ""}
        />

        {/* Alasan */}
        <Input
          label="Alasan"
          name="reason"
          value={formData.reason} onChange={handleChange} required
          placeholder="Contoh: Ada acara keluarga"
        />

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
          <Button type="submit" variant="primary" loading={loading}
            disabled={!formData.targetUserId || validation.offDate.isValid === false || validation.workDate.isValid === false}>
            Kirim Pengajuan
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default OffDayRequestModal;