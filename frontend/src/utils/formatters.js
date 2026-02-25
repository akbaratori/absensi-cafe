/**
 * Format date to readable string
 */
export const formatDate = (date) => {
  if (!date) return '-';
  const d = new Date(date);
  return d.toLocaleDateString('id-ID', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

/**
 * Format time to readable string
 */
export const formatTime = (date) => {
  if (!date) return '-';
  const d = new Date(date);
  return d.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
  });
};

/**
 * Format date and time
 */
export const formatDateTime = (date) => {
  if (!date) return '-';
  const d = new Date(date);
  return d.toLocaleString('id-ID', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/**
 * Format status to display text
 */
export const formatStatus = (status) => {
  if (!status) return '-';
  const lowerStatus = status.toLowerCase();
  const statusMap = {
    present: 'Hadir',
    late: 'Terlambat',
    absent: 'Absen',
    half_day: 'Setengah Hari',
    leave: 'Cuti',
    pending: 'Menunggu',
    rejected: 'Ditolak',
    approved: 'Disetujui',
  };
  return statusMap[lowerStatus] || status;
};

/**
 * Get status badge color class
 */
export const getStatusBadgeClass = (status) => {
  if (!status) return 'badge-gray';
  const lowerStatus = status.toLowerCase();
  const badgeMap = {
    present: 'badge-success',
    late: 'badge-warning',
    absent: 'badge-danger',
    half_day: 'badge-info',
    approved: 'badge-success',
    rejected: 'badge-danger',
    pending: 'badge-warning',
  };
  return badgeMap[lowerStatus] || 'badge-gray';
};

/**
 * Get status icon
 */
export const getStatusIcon = (status) => {
  const iconMap = {
    present: '✓',
    late: '⚠',
    absent: '✕',
    half_day: '◐',
  };
  return iconMap[status] || '•';
};

/**
 * Calculate duration between two dates in hours
 */
export const calculateHours = (start, end) => {
  if (!start || !end) return 0;
  const diff = new Date(end) - new Date(start);
  return (diff / (1000 * 60 * 60)).toFixed(2);
};

/**
 * Get greeting based on time of day
 */
export const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 11) return 'Selamat Pagi';
  if (hour < 15) return 'Selamat Siang';
  if (hour < 18) return 'Selamat Sore';
  return 'Selamat Malam';
};

/**
 * Get initials from name
 */
export const getInitials = (name) => {
  if (!name) return '?';
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
};

/**
 * Format role for display
 */
export const formatRole = (role) => {
  const roleMap = {
    admin: 'Administrator',
    employee: 'Karyawan',
  };
  return roleMap[role?.toLowerCase()] || role;
};
