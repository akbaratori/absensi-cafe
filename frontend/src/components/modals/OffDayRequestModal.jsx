import { useState, useEffect } from "react";
import Modal from "../shared/Modal";
import Button from "../shared/Button";
import Input from "../shared/Input";
import { useAuth } from "../../contexts/AuthContext";
import { createOffDayRequest } from "../../services/offDayService";
import { showSuccess, showError } from "../../hooks/useToast";

const OffDayRequestModal = ({ onClose, onSuccess }) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    offDate: "",
    workDate: "",
    reason: "",
  });

  const [validation, setValidation] = useState({
    offDate: { isValid: null, message: "" }, // null = not touched/empty
    workDate: { isValid: null, message: "" }
  });

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  // Helper to get day name
  const getDayName = (dayIndex) => {
    const days = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
    return days[dayIndex];
  };

  const getDayNameFromDate = (dateStr) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    return getDayName(date.getDay());
  };

  // Real-time validation
  useEffect(() => {
    const validate = () => {
      const offDayIndex = user?.offDay || 0;
      const newValidation = { ...validation };
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Validate Off Date (Tanggal Ingin Libur)
      if (!formData.offDate) {
        newValidation.offDate = { isValid: null, message: `Pilih hari selain ${getDayName(offDayIndex)}` };
      } else {
        const date = new Date(formData.offDate);
        date.setHours(0, 0, 0, 0);

        if (date <= today) {
          newValidation.offDate = { isValid: false, message: "❌ Tanggal harus di masa depan" };
        } else if (date.getDay() === offDayIndex) {
          newValidation.offDate = { isValid: false, message: `❌ Tanggal ini adalah hari libur rutin Anda (${getDayName(offDayIndex)})` };
        } else {
          newValidation.offDate = { isValid: true, message: `✅ Valid: Hari ${getDayNameFromDate(formData.offDate)} (Hari Kerja)` };
        }
      }

      // Validate Work Date (Tanggal Pengganti)
      if (!formData.workDate) {
        newValidation.workDate = { isValid: null, message: `Pilih hari ${getDayName(offDayIndex)}` };
      } else {
        const date = new Date(formData.workDate);
        date.setHours(0, 0, 0, 0);

        if (date <= today) {
          newValidation.workDate = { isValid: false, message: "❌ Tanggal harus di masa depan" };
        } else if (date.getDay() !== offDayIndex) {
          newValidation.workDate = { isValid: false, message: `❌ Harap pilih hari ${getDayName(offDayIndex)} (Hari Libur Rutin Anda)` };
        } else if (formData.offDate && new Date(formData.offDate).getTime() === date.getTime()) {
          newValidation.workDate = { isValid: false, message: "❌ Tanggal tidak boleh sama" };
        } else {
          newValidation.workDate = { isValid: true, message: `✅ Valid: Hari ${getDayNameFromDate(formData.workDate)} (Hari Libur)` };
        }
      }

      setValidation(newValidation);
    };

    validate();
  }, [formData.offDate, formData.workDate, user]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Final check before submit
    if (validation.offDate.isValid === false || validation.workDate.isValid === false) {
      showError("Harap perbaiki kesalahan pada formulir");
      return;
    }

    setLoading(true);

    try {
      await createOffDayRequest(formData);
      showSuccess("Permintaan tukar libur berhasil dikirim");
      onSuccess();
      onClose();
    } catch (error) {
      const errorMessage = error.response?.data?.error?.message || error.response?.data?.message || error.message || "Gagal mengirim permintaan";
      showError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Example dates helper
  const getExampleDates = () => {
    const today = new Date();
    const offDayIndex = user?.offDay || 0;

    // Find next non-off-day (work day)
    let workDayExample = new Date(today);
    workDayExample.setDate(workDayExample.getDate() + 1);
    while (workDayExample.getDay() === offDayIndex) {
      workDayExample.setDate(workDayExample.getDate() + 1);
    }

    // Find next off day
    let offDayExample = new Date(today);
    while (offDayExample.getDay() !== offDayIndex) {
      offDayExample.setDate(offDayExample.getDate() + 1);
    }

    return {
      workDay: workDayExample.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
      offDay: offDayExample.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
    };
  };

  const examples = getExampleDates();

  return (
    <Modal isOpen={true} onClose={onClose} title="Ajukan Tukar Libur">
      <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500 rounded text-sm">
        <h4 className="font-bold text-blue-800 dark:text-blue-200 mb-2">Panduan Tukar Libur</h4>
        <p className="text-gray-700 dark:text-gray-300 mb-2">
          Fitur ini digunakan untuk <strong>menukar hari libur rutin</strong> Anda (Minggu) dengan hari lain.
        </p>
        <ul className="list-disc pl-4 space-y-1 text-gray-700 dark:text-gray-300">
          <li><strong>Hari Libur Rutin Anda:</strong> {getDayName(user?.offDay || 0)}</li>
          <li><strong>Tanggal Ingin Libur:</strong> Pilih hari kerja biasa yang ingin Anda liburkan.</li>
          <li><strong>Tanggal Pengganti:</strong> Pilih hari {getDayName(user?.offDay || 0)} di mana Anda akan masuk kerja sebagai gantinya.</li>
        </ul>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Tanggal Ingin Libur (Off Date)"
          name="offDate"
          type="date"
          value={formData.offDate}
          onChange={handleChange}
          required
          helperText={validation.offDate.message}
          className={validation.offDate.isValid === false ? "border-red-500" : validation.offDate.isValid === true ? "border-green-500" : ""}
        />

        <Input
          label="Tanggal Pengganti Kerja (Work Date)"
          name="workDate"
          type="date"
          value={formData.workDate}
          onChange={handleChange}
          required
          helperText={validation.workDate.message}
          className={validation.workDate.isValid === false ? "border-red-500" : validation.workDate.isValid === true ? "border-green-500" : ""}
        />

        <Input
          label="Alasan"
          name="reason"
          value={formData.reason}
          onChange={handleChange}
          required
          placeholder="Contoh: Ada acara keluarga"
        />

        <div className="flex justify-end gap-2 mt-6">
          <Button type="button" variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button type="submit" variant="primary" loading={loading} disabled={validation.offDate.isValid === false || validation.workDate.isValid === false}>
            Kirim Pengajuan
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default OffDayRequestModal;
