import React, { useState } from 'react';
import { Clock, X } from 'lucide-react';

/**
 * Banner pengingat yang muncul setelah login berhasil.
 * Mengingatkan pegawai: kehadiran dihitung 1 hari hanya jika
 * absen masuk DAN absen pulang lengkap.
 *
 * Muncul sekali per sesi login (state lokal) — tombol tutup menghilangkan
 * banner sampai halaman di-refresh / login berikutnya.
 */
const ClockOutReminderBanner = () => {
    const [visible, setVisible] = useState(true);

    if (!visible) return null;

    return (
        <div style={{
            position: 'fixed',
            bottom: '1rem',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 'calc(100% - 2rem)',
            maxWidth: '480px',
            zIndex: 9998,
            background: 'linear-gradient(135deg, #f59e0b, #d97706)',
            borderRadius: '1rem',
            boxShadow: '0 8px 32px rgba(245, 158, 11, 0.4)',
            padding: '1rem 1.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            color: 'white',
            animation: 'clockOutReminderSlideUp 0.4s ease',
        }}>
            <style>{`
                @keyframes clockOutReminderSlideUp {
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
                <Clock size={20} />
            </div>

            {/* Text */}
            <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontWeight: 600, fontSize: '0.9rem' }}>
                    Jangan lupa absen pulang!
                </p>
                <p style={{ margin: 0, fontSize: '0.78rem', opacity: 0.9 }}>
                    Kehadiran dihitung 1 hari jika absen masuk dan absen pulang lengkap.
                </p>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <button
                    onClick={() => setVisible(false)}
                    style={{
                        background: 'white',
                        color: '#b45309',
                        border: 'none',
                        borderRadius: '0.5rem',
                        padding: '0.4rem 0.9rem',
                        fontWeight: 700,
                        fontSize: '0.82rem',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        transition: 'opacity 0.2s',
                    }}
                >
                    Mengerti
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
                    aria-label="Tutup"
                >
                    <X size={14} />
                </button>
            </div>
        </div>
    );
};

export default ClockOutReminderBanner;