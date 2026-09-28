import { useCallback, useEffect, useState } from 'react';

/**
 * Buka/tutup sebuah panel yang keadaannya diingat per perangkat.
 *
 * Dipakai panel analitik yang bisa mengganggu (mis. Rekap Keadilan Jobdesk):
 * admin yang tidak sedang butuh tinggal menutup sekali, dan pilihannya bertahan
 * di kunjungan berikutnya lewat `localStorage`. `fallback` dipakai kalau
 * localStorage tidak tersedia (mode privat / storage penuh) supaya panel tetap
 * bisa dibuka-tutup walau pilihannya tidak tersimpan.
 *
 * @param {string} key       - kunci penyimpanan, harus unik per panel
 * @param {boolean} fallback - keadaan awal bila belum ada pilihan tersimpan
 * @returns {[boolean, () => void, (v: boolean) => void]} [terbuka, toggle, set]
 */
export function usePersistentToggle(key, fallback = true) {
    const [open, setOpen] = useState(() => {
        try {
            const saved = window.localStorage.getItem(key);
            return saved === null ? fallback : saved === '1';
        } catch {
            return fallback;
        }
    });

    useEffect(() => {
        try {
            window.localStorage.setItem(key, open ? '1' : '0');
        } catch {
            // localStorage diblokir — cukup dibiarkan, panel tetap berfungsi.
        }
    }, [key, open]);

    const toggle = useCallback(() => setOpen(v => !v), []);

    return [open, toggle, setOpen];
}

export default usePersistentToggle;
