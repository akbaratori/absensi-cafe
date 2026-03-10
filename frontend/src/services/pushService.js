import api from './api';

const STORAGE_KEY = 'push_subscribed';

/**
 * Convert a URL-safe base64 string to a Uint8Array (required for VAPID public key)
 */
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

/**
 * Register the Service Worker. Call once at app startup.
 * @returns {Promise<ServiceWorkerRegistration|null>}
 */
export async function registerServiceWorker() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        console.log('[Push] Service Worker or PushManager not supported');
        return null;
    }
    try {
        const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        console.log('[Push] Service Worker registered:', registration.scope);
        return registration;
    } catch (error) {
        console.error('[Push] Service Worker registration failed:', error);
        return null;
    }
}

/**
 * Check if push notifications are supported and permission is granted
 */
export function isPushSupported() {
    return 'serviceWorker' in navigator && 'PushManager' in window;
}

/**
 * Get current notification permission status
 */
export function getPermissionStatus() {
    if (!('Notification' in window)) return 'unsupported';
    return Notification.permission; // 'default', 'granted', 'denied'
}

/**
 * Subscribe the user to push notifications.
 * Fetches VAPID public key from backend, subscribes via browser API,
 * and sends the subscription object to the backend.
 * @returns {Promise<boolean>} true if subscribed successfully
 */
export async function subscribeToPush() {
    try {
        if (!isPushSupported()) return false;

        // Request notification permission
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            console.log('[Push] Permission denied');
            return false;
        }

        // Get VAPID public key from backend
        const { data } = await api.get('/notifications/vapid-key');
        const vapidPublicKey = data.data.publicKey;

        // Get the service worker registration
        const registration = await navigator.serviceWorker.ready;

        // Subscribe to push
        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
        });

        // Send subscription to backend
        const subJson = subscription.toJSON();
        await api.post('/notifications/subscribe', {
            endpoint: subJson.endpoint,
            keys: {
                p256dh: subJson.keys.p256dh,
                auth: subJson.keys.auth
            }
        });

        localStorage.setItem(STORAGE_KEY, 'true');
        console.log('[Push] Subscribed successfully');
        return true;
    } catch (error) {
        console.error('[Push] Subscribe error:', error);
        return false;
    }
}

/**
 * Unsubscribe from push notifications (call on logout).
 */
export async function unsubscribeFromPush() {
    try {
        if (!isPushSupported()) return;

        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();

        if (subscription) {
            // Notify backend to remove it
            await api.delete('/notifications/unsubscribe', {
                data: { endpoint: subscription.endpoint }
            }).catch(() => { });

            await subscription.unsubscribe();
        }

        localStorage.removeItem(STORAGE_KEY);
        console.log('[Push] Unsubscribed');
    } catch (error) {
        console.error('[Push] Unsubscribe error:', error);
    }
}

/**
 * Check if user has already subscribed (client-side cache check)
 */
export function isSubscribed() {
    return localStorage.getItem(STORAGE_KEY) === 'true';
}
