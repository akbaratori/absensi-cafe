import { useState, useEffect } from "react";
import { X, Check, XCircle } from "lucide-react";
import Button from "../shared/Button";
import { getOffDayInbox, respondToOffDayRequest } from "../../services/offDayService";
import { showSuccess, showError } from "../../hooks/useToast";

const OffDayInboxModal = ({ onClose, onUpdate }) => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);

  const fetchInbox = async () => {
    setLoading(true);
    try {
      const res = await getOffDayInbox();
      const data = res.data?.data;
      setRequests(Array.isArray(data) ? data : data?.requests || []);
    } catch (err) {
      console.error("Failed to fetch off-day inbox", err);
      showError("Gagal memuat inbox tukar libur");
      setRequests([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchInbox(); }, []);

  const handleRespond = async (id, action) => {
    setActionLoading(`${id}-${action}`);
    try {
      await respondToOffDayRequest(id, action);
      showSuccess(action === "ACCEPT" ? "Permintaan diterima" : "Permintaan ditolak");
      onUpdate?.();
      fetchInbox();
    } catch (err) {
      showError(err.response?.data?.message || "Gagal merespons permintaan");
    } finally {
      setActionLoading(null);
    }
  };

  const formatDate = (s) => !s ? "-" : new Date(s).toLocaleDateString("id-ID", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Inbox Tukar Libur</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">Permintaan tukar libur yang perlu ditanggapi</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {loading ? (
            <div className="flex justify-center items-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
            </div>
          ) : requests.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-4xl mb-3">📭</p>
              <p className="text-gray-500 dark:text-gray-400 font-medium">Tidak ada permintaan masuk</p>
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Saat ada rekan yang mengajukan tukar libur ke Anda, akan muncul di sini.</p>
            </div>
          ) : (
            requests.map((req) => (
              <div key={req.id} className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-primary-100 dark:bg-primary-900 flex items-center justify-center text-primary-700 dark:text-primary-300 font-bold text-sm">
                    {req.user?.fullName?.charAt(0) || "?"}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-white text-sm">{req.user?.fullName || "Karyawan"}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">ID: {req.user?.employeeId || "-"}</p>
                  </div>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">Ingin Libur:</span>
                    <span className="font-medium text-gray-900 dark:text-white">{formatDate(req.offDate)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">Ganti Masuk:</span>
                    <span className="font-medium text-gray-900 dark:text-white">{formatDate(req.workDate)}</span>
                  </div>
                  {req.reason && (
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">Alasan: </span>
                      <span className="text-gray-700 dark:text-gray-300 italic">"{req.reason}"</span>
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="primary" size="sm" className="flex-1"
                    loading={actionLoading === `${req.id}-ACCEPT`} disabled={!!actionLoading}
                    onClick={() => handleRespond(req.id, "ACCEPT")}>
                    <Check size={14} className="mr-1" /> Terima
                  </Button>
                  <Button variant="danger" size="sm" className="flex-1"
                    loading={actionLoading === `${req.id}-REJECT`} disabled={!!actionLoading}
                    onClick={() => handleRespond(req.id, "REJECT")}>
                    <XCircle size={14} className="mr-1" /> Tolak
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          <Button variant="outline" className="w-full" onClick={onClose}>Tutup</Button>
        </div>
      </div>
    </div>
  );
};

export default OffDayInboxModal;