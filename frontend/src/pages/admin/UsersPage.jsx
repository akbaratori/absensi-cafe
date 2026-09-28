import { useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import Card from '../../components/shared/Card';
import Button from '../../components/shared/Button';
import Modal from '../../components/shared/Modal';
import Avatar from '../../components/shared/Avatar';
import { getUsers, updateUser, deleteUser, bulkDeleteUsers } from '../../services/adminService';
import { formatRole } from '../../utils/formatters';
import { SkeletonTable } from '../../components/shared/Loading';
import UserModal from './UserModal';
import { showSuccess, showError } from '../../hooks/useToast';
import { useAuth } from '../../contexts/AuthContext';

// Batas id per request, harus sama dengan bulkDeleteUsersSchema di backend.
const BULK_DELETE_LIMIT = 100;

const UsersPage = () => {
  const { user: currentUser } = useAuth();
  const [usersData, setUsersData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  // Id user yang dicentang di tabel (pakai Set supaya toggle/clear mudah dibaca).
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [isBulkConfirmOpen, setIsBulkConfirmOpen] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  const fetchUsers = async () => {
    try {
      const response = await getUsers({ limit: 50 });
      setUsersData(response.data);
      // Setelah refetch, id yang sudah hilang dari daftar dibuang dari pilihan —
      // kalau tidak, hitungan "Hapus N pengguna" menunjuk baris yang tak tampak.
      const visibleIds = new Set((response.data?.users || []).map((u) => u.id));
      setSelectedIds((prev) => new Set([...prev].filter((id) => visibleIds.has(id))));
    } catch (error) {
      console.error('Failed to fetch users:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  /**
   * Daftar user yang boleh dicentang.
   *
   * Akun sendiri sengaja tidak boleh dicentang — bukan cuma backend yang
   * menolak, tapi checkbox-nya juga dimatikan supaya admin tidak membuang
   * pilihan lalu gagal submit.
   */
  const selectableUsers = (usersData?.users || []).filter((u) => u.id !== currentUser?.id);

  const toggleSelectUser = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allSelected = selectableUsers.length > 0 && selectableUsers.every((u) => selectedIds.has(u.id));

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(selectableUsers.map((u) => u.id)));
  };

  const handleBulkDelete = async () => {
    const ids = [...selectedIds];

    if (ids.length === 0) {
      showError('Pilih minimal satu pengguna untuk dihapus.');
      return;
    }

    // Backend menolak > 100 id, jadi dicegat di sini supaya tidak membuang
    // pilihan admin karena satu request yang pasti gagal.
    if (ids.length > BULK_DELETE_LIMIT) {
      showError(`Maksimal ${BULK_DELETE_LIMIT} pengguna per aksi. Sekarang ${ids.length} pengguna terpilih.`);
      return;
    }

    setIsBulkDeleting(true);
    try {
      const response = await bulkDeleteUsers(ids);
      const result = response?.data || {};

      if (result.failed?.length > 0) {
        // Sebagian gagal: tampilkan alasannya per pengguna, jangan hanya "gagal".
        showError(
          `${result.deletedCount} pengguna dihapus, ${result.failed.length} gagal: ` +
          result.failed.map((f) => `${f.username || f.id} (${f.reason})`).join('; ')
        );
      } else {
        showSuccess(`${result.deletedCount ?? ids.length} pengguna berhasil dihapus.`);
      }

      setIsBulkConfirmOpen(false);
      setSelectedIds(new Set());
      await fetchUsers();
    } catch (error) {
      showError(error?.response?.data?.error?.message || 'Gagal menghapus pengguna terpilih.');
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const handleAddUser = () => {
    setSelectedUser(null);
    setIsModalOpen(true);
  };

  const handleEditUser = (user) => {
    setSelectedUser(user);
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setSelectedUser(null);
  };

  const handleModalSuccess = () => {
    fetchUsers();
  };

  const handleToggleStatus = async (user) => {
    if (user.isActive && user.role === 'ADMIN') {
      showError('Akun admin tidak dapat dinonaktifkan.');
      return;
    }

    if (!window.confirm(`Are you sure you want to ${user.isActive ? 'deactivate' : 'activate'} this user?`)) {
      return;
    }

    try {
      await updateUser(user.id, { isActive: !user.isActive });
      showSuccess(`User ${user.isActive ? 'deactivated' : 'activated'} successfully`);
      fetchUsers();
    } catch (error) {
      showError(error?.response?.data?.error?.message || 'Failed to update user status');
    }
  };

  const handleDeleteUser = async (user) => {
    if (user.id === currentUser?.id) {
      showError('Anda tidak dapat menghapus akun Anda sendiri.');
      return;
    }

    if (!window.confirm(`Are you sure you want to DELETE user ${user.username}? This action cannot be undone.`)) {
      return;
    }

    try {
      await deleteUser(user.id);
      showSuccess('User deleted successfully');
      fetchUsers();
    } catch (error) {
      showError('Failed to delete user');
    }
  };

  if (loading) {
    return <SkeletonTable rows={10} />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Users</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Manage user accounts</p>
        </div>
        <Button variant="primary" onClick={handleAddUser}>
          <Plus className="w-4 h-4" />
          Add User
        </Button>
      </div>

      {/* Toolbar aksi massal — hanya muncul saat ada baris terpilih */}
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900/40 dark:bg-red-900/20">
          <span className="text-sm font-medium text-red-800 dark:text-red-200">
            {selectedIds.size} pengguna terpilih
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
              Batal pilih
            </Button>
            <Button variant="danger" size="sm" onClick={() => setIsBulkConfirmOpen(true)}>
              <Trash2 className="w-4 h-4" />
              Hapus {selectedIds.size} pengguna
            </Button>
          </div>
        </div>
      )}

      {/* Users Table */}
      <Card>
        {/* Desktop View (Table) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 dark:bg-gray-700/50">
              <tr>
                <th className="px-6 py-3 w-10">
                  <input
                    type="checkbox"
                    aria-label="Pilih semua pengguna di halaman ini"
                    className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    disabled={selectableUsers.length === 0}
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  User
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Peran
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Dept
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Shift
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Last Login
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {usersData?.users?.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <input
                      type="checkbox"
                      aria-label={`Pilih ${user.username}`}
                      className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 disabled:opacity-40"
                      checked={selectedIds.has(user.id)}
                      onChange={() => toggleSelectUser(user.id)}
                      disabled={user.id === currentUser?.id}
                      title={user.id === currentUser?.id ? 'Akun Anda sendiri tidak dapat dihapus' : undefined}
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <Avatar name={user.fullName} size="sm" className="mr-3" />
                      <div>
                        <div className="text-sm font-medium text-gray-900 dark:text-white">{user.fullName}</div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">{user.username}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex flex-col gap-1">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 w-fit">
                        {formatRole(user.role)}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${user.department === 'KITCHEN'
                      ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300'
                      : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'}`}>
                      {user.department || 'BAR'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">
                      {user.shift ? `${user.shift.name} (${user.shift.startTime})` : 'No Shift'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${user.isActive
                      ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                      : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                      }`}>
                      {user.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                    {user.lastLoginAt
                      ? new Date(user.lastLoginAt).toLocaleDateString()
                      : 'Never'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <button
                      onClick={() => handleEditUser(user)}
                      className="text-primary-600 hover:text-primary-900 dark:text-primary-400 dark:hover:text-primary-300 mr-3"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleToggleStatus(user)}
                      className={`${user.isActive ? 'text-yellow-600 hover:text-yellow-900 dark:text-yellow-400 dark:hover:text-yellow-300' : 'text-green-600 hover:text-green-900 dark:text-green-400 dark:hover:text-green-300'} mr-3`}
                    >
                      {user.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                    <button
                      onClick={() => handleDeleteUser(user)}
                      className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile View (Cards) */}
        <div className="block md:hidden divide-y divide-gray-200 dark:divide-gray-700">
          {usersData?.users?.map((user) => (
            <div key={user.id} className="p-4 space-y-3">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  aria-label={`Pilih ${user.username}`}
                  className="h-4 w-4 shrink-0 rounded border-gray-300 text-primary-600 focus:ring-primary-500 disabled:opacity-40"
                  checked={selectedIds.has(user.id)}
                  onChange={() => toggleSelectUser(user.id)}
                  disabled={user.id === currentUser?.id}
                />
                <Avatar name={user.fullName} size="sm" />
                <div>
                  <div className="font-medium text-gray-900 dark:text-white">{user.fullName}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{user.username}</div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 text-xs">
                <span className="px-2 py-1 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                  {formatRole(user.role)}
                </span>
                <span className={`px-2 py-1 rounded-full ${user.department === 'KITCHEN' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300' : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'}`}>
                  {user.department || 'BAR'}
                </span>
                <span className={`px-2 py-1 rounded-full ${user.isActive ? 'bg-green-100 text-green-800 dark:bg-green-900/30' : 'bg-red-100 text-red-800 dark:bg-red-900/30'}`}>
                  {user.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>

              <div className="text-xs text-gray-600 dark:text-gray-400">
                <p>Shift: {user.shift ? user.shift.name : 'No Shift'}</p>
                <p>Login: {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString() : 'Never'}</p>
              </div>

              <div className="flex justify-end gap-3 pt-2 border-t border-gray-100 dark:border-gray-700">
                <button onClick={() => handleEditUser(user)} className="text-sm text-primary-600">Edit</button>
                <button onClick={() => handleToggleStatus(user)} className={`text-sm ${user.isActive ? 'text-yellow-600' : 'text-green-600'}`}>
                  {user.isActive ? 'Deactivate' : 'Activate'}
                </button>
                <button onClick={() => handleDeleteUser(user)} className="text-sm text-red-600">Delete</button>
              </div>
            </div>
          ))}
        </div>

        {usersData?.users?.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500 dark:text-gray-400">No users found</p>
          </div>
        )}
      </Card>

      <UserModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        user={selectedUser}
        onSuccess={handleModalSuccess}
      />

      {/* Konfirmasi hapus massal — daftar nama ditampilkan supaya admin tahu
          persis siapa yang akan hilang, bukan cuma jumlahnya. */}
      <Modal
        isOpen={isBulkConfirmOpen}
        onClose={() => !isBulkDeleting && setIsBulkConfirmOpen(false)}
        title={`Hapus ${selectedIds.size} pengguna?`}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Tindakan ini <strong>permanen</strong> dan tidak dapat dibatalkan. Data absensi,
            jadwal, dan pengajuan milik pengguna berikut akan ikut terhapus.
          </p>

          <div className="max-h-56 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700">
            <ul className="divide-y divide-gray-200 dark:divide-gray-700">
              {(usersData?.users || [])
                .filter((u) => selectedIds.has(u.id))
                .map((u) => (
                  <li key={u.id} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span className="text-gray-900 dark:text-white">{u.fullName}</span>
                    <span className="text-gray-500 dark:text-gray-400">{u.username}</span>
                  </li>
                ))}
            </ul>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="secondary"
              onClick={() => setIsBulkConfirmOpen(false)}
              disabled={isBulkDeleting}
            >
              Batal
            </Button>
            <Button variant="danger" onClick={handleBulkDelete} loading={isBulkDeleting}>
              {isBulkDeleting ? 'Menghapus...' : `Hapus ${selectedIds.size} pengguna`}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default UsersPage;
