/**
 * Shared state machine for ShiftSwap and OffDayRequest
 * 
 * Valid status transitions:
 *   PENDING_VALIDATION  → PENDING_TARGET_RESPONSE (system validates)
 *                        → REJECTED_BY_SYSTEM (system rejects)
 *   PENDING_TARGET_RESPONSE → PENDING_APPROVAL (target accepts)
 *                            → REJECTED_BY_TARGET (target rejects)
 *                            → CANCELLED (requester cancels)
 *   PENDING_APPROVAL  → APPROVED (admin approves)
 *                      → REJECTED_BY_APPROVER (admin rejects)
 *   APPROVED, REJECTED_BY_SYSTEM, REJECTED_BY_TARGET, REJECTED_BY_APPROVER, CANCELLED → (terminal, no further transitions)
 */

const VALID_STATUSES = [
  'PENDING_VALIDATION',
  'PENDING_TARGET_RESPONSE',
  'REJECTED_BY_SYSTEM',
  'REJECTED_BY_TARGET',
  'PENDING_APPROVAL',
  'REJECTED_BY_APPROVER',
  'APPROVED',
  'CANCELLED',
];

const TERMINAL_STATUSES = [
  'REJECTED_BY_SYSTEM',
  'REJECTED_BY_TARGET',
  'REJECTED_BY_APPROVER',
  'APPROVED',
  'CANCELLED',
];

/**
 * Check if a transition from currentStatus to a new status is valid
 * based on the action being performed and the role of the user.
 * 
 * @param {string} currentStatus - Current status from DB
 * @param {string} action - One of: 'SYSTEM_VALIDATE', 'SYSTEM_REJECT', 'TARGET_ACCEPT', 'TARGET_REJECT', 'ADMIN_APPROVE', 'ADMIN_REJECT', 'REQUESTER_CANCEL'
 * @returns {{ valid: boolean, nextStatus: string|null, allowedStatuses: string[], error: string|null }}
 */
function canTransition(currentStatus, action) {
  // Ensure currentStatus is valid
  if (!currentStatus || !VALID_STATUSES.includes(currentStatus)) {
    return {
      valid: false,
      nextStatus: null,
      allowedStatuses: [],
      error: `Status saat ini '${currentStatus}' tidak dikenali.`,
    };
  }

  // Terminal statuses cannot be transitioned
  if (TERMINAL_STATUSES.includes(currentStatus)) {
    return {
      valid: false,
      nextStatus: null,
      allowedStatuses: [],
      error: `Pengajuan dengan status '${currentStatus}' bersifat final dan tidak dapat diproses ulang.`,
    };
  }

  const transitions = {
    'PENDING_VALIDATION': {
      'SYSTEM_VALIDATE': 'PENDING_TARGET_RESPONSE',
      'SYSTEM_REJECT': 'REJECTED_BY_SYSTEM',
      'REQUESTER_CANCEL': 'CANCELLED',
    },
    'PENDING_TARGET_RESPONSE': {
      'TARGET_ACCEPT': 'PENDING_APPROVAL',
      'TARGET_REJECT': 'REJECTED_BY_TARGET',
      'REQUESTER_CANCEL': 'CANCELLED',
      // Admin dapat membersihkan permintaan yang stuck menunggu respons karyawan
      'ADMIN_REJECT': 'REJECTED_BY_APPROVER',
    },
    'PENDING_APPROVAL': {
      'ADMIN_APPROVE': 'APPROVED',
      'ADMIN_REJECT': 'REJECTED_BY_APPROVER',
    },
  };

  const allowedFromCurrent = transitions[currentStatus];
  if (!allowedFromCurrent) {
    return {
      valid: false,
      nextStatus: null,
      allowedStatuses: [],
      error: `Status '${currentStatus}' tidak memiliki transisi yang diizinkan.`,
    };
  }

  const nextStatus = allowedFromCurrent[action];

  if (!nextStatus) {
    return {
      valid: false,
      nextStatus: null,
      allowedStatuses: Object.keys(allowedFromCurrent),
      error: `Aksi '${action}' tidak diizinkan untuk status '${currentStatus}'. Aksi yang diizinkan: ${Object.keys(allowedFromCurrent).join(', ')}`,
    };
  }

  return {
    valid: true,
    nextStatus,
    allowedStatuses: Object.keys(allowedFromCurrent),
    error: null,
  };
}

/**
 * Get all allowed actions for a given status
 * @param {string} currentStatus
 * @returns {string[]}
 */
function getAllowedActions(currentStatus) {
  if (!currentStatus || !VALID_STATUSES.includes(currentStatus)) return [];
  if (TERMINAL_STATUSES.includes(currentStatus)) return [];

  const transitions = {
    'PENDING_VALIDATION': ['SYSTEM_VALIDATE', 'SYSTEM_REJECT', 'REQUESTER_CANCEL'],
    'PENDING_TARGET_RESPONSE': ['TARGET_ACCEPT', 'TARGET_REJECT', 'REQUESTER_CANCEL', 'ADMIN_REJECT'],
    'PENDING_APPROVAL': ['ADMIN_APPROVE', 'ADMIN_REJECT'],
  };

  return transitions[currentStatus] || [];
}

module.exports = {
  canTransition,
  getAllowedActions,
  VALID_STATUSES,
  TERMINAL_STATUSES,
};