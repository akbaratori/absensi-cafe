import { useState, useEffect } from "react";
import { Check, XCircle, AlertTriangle } from "lucide-react";
import Card from "../../components/shared/Card";
import Button from "../../components/shared/Button";
import Modal from "../../components/shared/Modal";
import { getOffDayRequests } from "../../services/offDayService";
import api from "../../services/api"; // Direct API for approve/reject short-circuit
import { showSuccess, showError } from "../../hooks/useToast";

const OffDayApprovalPage = () => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [filterStatus, setFilterStatus] = useState("PENDING");

  // Confirmation Modal State
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    type: null, // 'approve' | 'reject'
    data: null
  });

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const response = await getOffDayRequests(filterStatus === "ALL" ? undefined : filterStatus, true);
      setRequests(response.data?.data?.requests || []);
    } catch (error) {
      console.error("Failed to fetch requests:", error);
      showError(error.response?.data?.message || "Gagal memuat data");
      setRequests([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, [filterStatus]);

  const openConfirmModal = (type, req) => {
    setConfirmModal({
      isOpen: true,
      type,
      data: req
    });
  };

  const closeConfirmModal = () => {
    setConfirmModal({
      isOpen: false,
      type: null,
      data: null
    });
  };

  const handleExecuteAction = async () => {
    const { type, data } = confirmModal;
    if (!type || !data) return;

    setActionLoading(data.id);
    closeConfirmModal(); // Close modal immediately

    try {
      if (type === 'approve') {
        await api.patch(`/off-days/${data.id}/approve`);
        showSuccess("Permintaan disetujui");
      } else {
        await api.patch(`/off-days/${data.id}/reject`);
        showSuccess("Permintaan ditolak");
      }
      fetchRequests();
    } catch (error) {
      showError(error.response?.data?.message || `Gagal ${type === 'approve' ? 'menyetujui' : 'menolak'}`);
    } finally {
      setActionLoading(null);
    }
  };

  // Helper to format date
  const formatDate = (date) => {
    return new Date(date).toLocaleDateString("id-ID", {
      weekday: "long",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Persetujuan Tukar Libur</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Review permintaan tukar hari libur karyawan.</p>
        </div>

        <div className="flex bg-gray-100 dark:bg-gray-700 p-1 rounded-lg">
          <button
            onClick={() => setFilterStatus("PENDING")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${filterStatus === "PENDING" ? "bg-white dark:bg-gray-600 text-primary-600 shadow-sm" : "text-gray-600 dark:text-gray-300 hover:text-gray-900"}`}
          >
            Pending
          </button>
          <button
            onClick={() => setFilterStatus("ALL")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${filterStatus === "ALL" ? "bg-white dark:bg-gray-600 text-primary-600 shadow-sm" : "text-gray-600 dark:text-gray-300 hover:text-gray-900"}`}
          >
            Semua
          </button>
        </div>
      </div>

      <Card>
        {/* Desktop View (Table) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Pemohon</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Ingin Libur (Off)</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Ganti Masuk (Work)</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Alasan</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Aksi</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {loading ? (
                <tr>
                  <td colSpan="6" className="px-6 py-12 text-center text-gray-500">
                    Loading...
                  </td>
                </tr>
              ) : requests.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-12 text-center text-gray-500">
                    Tidak ada data.
                  </td>
                </tr>
              ) : (
                requests.map((req) => (
                  <tr key={req.id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">{req.user?.fullName}</div>
                      <div className="text-xs text-gray-500">{req.user?.employeeId}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600 font-medium">{formatDate(req.offDate)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 font-medium">{formatDate(req.workDate)}</td>
                    <td className="px-6 py-4 text-sm text-gray-500 italic max-w-xs truncate">{req.reason}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium border capitalize
                                                ${req.status === "APPROVED" ? "bg-green-100 text-green-800 border-green-200" : ""}
                                                ${req.status === "REJECTED" ? "bg-red-100 text-red-800 border-red-200" : ""}
                                                ${req.status === "PENDING" ? "bg-yellow-100 text-yellow-800 border-yellow-200" : ""}
                                            `}
                      >
                        {req.status.toLowerCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      {req.status === "PENDING" && (
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="text"
                            className="text-green-600 hover:text-green-700 bg-green-50 hover:bg-green-100"
                            onClick={() => openConfirmModal('approve', req)}
                            loading={actionLoading === req.id}
                            disabled={actionLoading !== null}
                          >
                            <Check className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="text"
                            className="text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100"
                            onClick={() => openConfirmModal('reject', req)}
                            loading={actionLoading === req.id}
                            disabled={actionLoading !== null}
                          >
                            <XCircle className="w-4 h-4" />
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile View (Cards) */}
        <div className="block md:hidden divide-y divide-gray-200 dark:divide-gray-700">
          {loading ? (
            <div className="p-6 text-center text-gray-500">Loading...</div>
          ) : requests.length === 0 ? (
            <div className="p-6 text-center text-gray-500">Tidak ada data.</div>
          ) : (
            requests.map((req) => (
              <div key={req.id} className="p-4 space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-white">
                      {req.user?.fullName}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{req.user?.employeeId}</p>
                    <span
                      className={`px-2 py-0.5 mt-1 inline-block rounded-full text-xs font-medium border capitalize
                                    ${req.status === "APPROVED" ? "bg-green-100 text-green-800 border-green-200" : ""}
                                    ${req.status === "REJECTED" ? "bg-red-100 text-red-800 border-red-200" : ""}
                                    ${req.status === "PENDING" ? "bg-yellow-100 text-yellow-800 border-yellow-200" : ""}
                                `}
                    >
                      {req.status.toLowerCase()}
                    </span>
                  </div>
                  <div className="text-right">
                    {req.status === "PENDING" && (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="text"
                          className="text-green-600 hover:text-green-700 bg-green-50"
                          onClick={() => openConfirmModal('approve', req)}
                          loading={actionLoading === req.id}
                          disabled={actionLoading !== null}
                        >
                          <Check className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="text"
                          className="text-red-600 hover:text-red-700 bg-red-50"
                          onClick={() => openConfirmModal('reject', req)}
                          loading={actionLoading === req.id}
                          disabled={actionLoading !== null}
                        >
                          <XCircle className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm bg-gray-50 dark:bg-gray-700/50 p-3 rounded-lg">
                  <div>
                    <p className="text-xs text-gray-500">Ingin Libur</p>
                    <p className="font-medium text-red-600">{formatDate(req.offDate)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Ganti Masuk</p>
                    <p className="font-medium text-green-600">{formatDate(req.workDate)}</p>
                  </div>
                  <div className="col-span-2 border-t border-gray-200 dark:border-gray-600 pt-2 mt-1">
                    <p className="text-xs text-gray-500">Alasan</p>
                    <p className="italic text-gray-700 dark:text-gray-300">{req.reason}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      {/* Confirmation Modal */}
      <Modal
        isOpen={confirmModal.isOpen}
        onClose={closeConfirmModal}
        title={confirmModal.type === 'approve' ? 'Setujui Permintaan' : 'Tolak Permintaan'}
        size="md"
      >
        <div className="space-y-4">
          <div className={`p-4 rounded-lg flex items-start gap-3 ${confirmModal.type === 'approve' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
            {confirmModal.type === 'approve' ? <Check className="w-5 h-5 mt-0.5" /> : <AlertTriangle className="w-5 h-5 mt-0.5" />}
            <div>
              <p className="font-medium">
                Apakah Anda yakin ingin {confirmModal.type === 'approve' ? 'menyetujui' : 'menolak'} permintaan ini?
              </p>
              {confirmModal.data && (
                <div className="mt-2 text-sm opacity-90 space-y-1">
                  <p><strong>Karyawan:</strong> {confirmModal.data.user?.fullName}</p>
                  <p><strong>Libur (Off):</strong> {formatDate(confirmModal.data.offDate)}</p>
                  <p><strong>Masuk (Work):</strong> {formatDate(confirmModal.data.workDate)}</p>
                  <p><strong>Alasan:</strong> {confirmModal.data.reason}</p>
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={closeConfirmModal}>
              Batal
            </Button>
            <Button
              variant={confirmModal.type === 'approve' ? 'primary' : 'danger'}
              onClick={handleExecuteAction}
            >
              Ya, {confirmModal.type === 'approve' ? 'Setujui' : 'Tolak'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default OffDayApprovalPage;
