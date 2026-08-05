import toast from 'react-hot-toast';

/**
 * Show success toast
 */
export const showSuccess = (message) => {
  return toast.success(message);
};

/**
 * Show error toast
 */
export const showError = (message) => {
  return toast.error(message);
};

/**
 * Show loading toast
 */
export const showLoading = (message) => {
  return toast.loading(message);
};

/**
 * Dismiss toast
 */
export const dismissToast = (toastId) => {
  toast.dismiss(toastId);
};

/**
 * Promise toast - shows loading, then success or error
 */
export const toastPromise = (promise, messages) => {
  return toast.promise(promise, messages);
};
