import React, { useState, useEffect } from 'react';
import { Bell, BellOff, X } from 'lucide-react';
import { isPushSupported, getPermissionStatus, subscribeToPush, isSubscribed } from '../../services/pushService';

/**
 * A dismissible banner that asks the user to enable push notifications.
 * Shows once per session if notifications are not yet enabled.
 */
const NotificationPermissionBanner = () => {
    const [visible, setVisible] = useState(false);
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        // Only show if: push is supported, permission not yet granted, and user hasn't subscribed
        const shouldShow =
            isPushSupported() &&
            getPermissionStatus() === 'default' &&
            !isSubscribed();

        // Small delay so it doesn't flash immediately on page load
        const timer = setTimeout(() => setVisible(shouldShow), 2000);
        return () => clearTimeout(timer);
    }, []);

    const handleEnable = async () => {
        setLoading(true);
        const subscribed = await subscribeToPush();
        setLoading(false);
        if (subscribed) {
            setSuccess(true);
            setTimeout(() => setVisible(false), 2500);
        } else {
            setVisible(false);
        }
    };

    if (!visible) return null;

    return (
        <div style={{
            position: 'fixed',
            bottom: '1rem',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 'calc(100% - 2rem)',
            maxWidth: '480px',
            zIndex: 9999,
            background: success
                ? 'linear-gradient(135deg, #10b981, #059669)'
                : 'linear-gradient(135deg, #6c63ff, #4f46e5)',
            borderRadius: '1rem',
            boxShadow: '0 8px 32px rgba(108, 99, 255, 0.4)',
            padding: '1rem 1.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            color: 'white',
            animation: 'slideUp 0.4s ease',
        }}>
            <style>{`
                @keyframes slideUp {
                    from { opacity: 0; transform: translateX(-50%) translateY(20px); }
                    to { opacity: 1; transform: translateX(-50%) translateY(0); }
                }
            `}</style>

            {/* Icon */}
            <div style={{
                background: 'rgba(255,255,255,0.2)',
                borderRadius: '50%',
                width: '40px',
                height: '40px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
            }}>
                {success ? <Bell size={20} /> : <Bell size={20} />}
            </div>

            {/* Text */}
            <div style={{ flex: 1 }}>
                {success ? (
                    <p style={{ margin: 0, fontWeight: 600, fontSize: '0.9rem' }}>
                        ✅ Notifikasi berhasil diaktifkan!
                    </p>
                ) : (
                    <>
                        <p style={{ margin: 0, fontWeight: 600, fontSize: '0.9rem' }}>
                            Aktifkan notifikasi
                        </p>
                        <p style={{ margin: 0, fontSize: '0.78rem', opacity: 0.85 }}>
                            Dapatkan pengingat shift & konfirmasi absensi
                        </p>
                    </>
                )}
            </div>

            {/* Actions */}
            {!success && (
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <button
                        onClick={handleEnable}
                        disabled={loading}
                        style={{
                            background: 'white',
                            color: '#4f46e5',
                            border: 'none',
                            borderRadius: '0.5rem',
                            padding: '0.4rem 0.9rem',
                            fontWeight: 700,
                            fontSize: '0.82rem',
                            cursor: loading ? 'wait' : 'pointer',
                            whiteSpace: 'nowrap',
                            transition: 'opacity 0.2s',
                            opacity: loading ? 0.7 : 1
                        }}
                    >
                        {loading ? '...' : 'Aktifkan'}
                    </button>
                    <button
                        onClick={() => setVisible(false)}
                        style={{
                            background: 'rgba(255,255,255,0.2)',
                            border: 'none',
                            borderRadius: '50%',
                            width: '28px',
                            height: '28px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            color: 'white',
                            flexShrink: 0
                        }}
                        title="Tutup"
                    >
                        <X size={14} />
                    </button>
                </div>
            )}
        </div>
    );
};

export default NotificationPermissionBanner;
