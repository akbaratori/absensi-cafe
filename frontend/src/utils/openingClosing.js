/**
 * Rotasi Opening & Closing dapur — 4 staf, sesuai dokumen
 * "Simulasi Pembagian Jobdesk Dapur: Opening & Closing".
 *
 * Aturan yang dipakai generateOpeningClosingRoster():
 *  - Kelompok: staf[0]+staf[1] vs staf[2]+staf[3], bertukar shift tiap minggu.
 *  - Opening (shift 1): Dapur + Area; Closing (shift 2): Jalur 1 + Jalur 2.
 *  - Pos bertukar tiap hari (indeks hari % 2).
 *  - Libur hanya Senin–Kamis, urutan staff off ditentukan offOrder (diputar tiap minggu),
 *    tiap staf libur 1x per minggu (4x per bulan). Jumat–Minggu semua masuk (4 orang).
 *  - Kalau yang libur dari shift 1: opening digabung "Dapur + Area".
 *    Kalau dari shift 2: closing digabung "Jalur 1 + Jalur 2".
 *  - Pengecek laporan stok: Senin & Kamis, dipegang pasangan shift 2
 *    (Senin anggota ke-2, Kamis anggota ke-1, urutan ditukar tiap kali kelompok
 *    itu menjadi shift 2); kalau yang bersangkutan libur, digantikan pasangannya.
 */

export const OPENING_JOBS = [
    { id: 'dapur', label: 'Dapur', icon: '🍳', tasks: ['Kompor', 'Penggorengan', 'Kuah pangsit', 'Nasi', 'Kondimen (kerupuk, bahan showcase, dll)'] },
    { id: 'area', label: 'Area', icon: '🧹', tasks: ['Tangga', 'Meja dan kursi', 'Lantai', 'Stok tisu', 'Kesiapan musala', 'Kaca lantai 2 dan wastafel', 'Tempat sampah'] },
];

export const CLOSING_JOBS = [
    { id: 'jalur1', label: 'Jalur 1', icon: '🍽️', tasks: ['Dishwasher', 'Cuci lap', 'WC', 'Pel area'] },
    { id: 'jalur2', label: 'Jalur 2', icon: '🧽', tasks: ['Lap meja dan kompor', 'Lantai', 'Sapu area'] },
];

export const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
export const DAY_SHORT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
export const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

export const toDateKey = (date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export const localDate = (key) => new Date(`${key}T00:00:00`);

/** Senin (YYYY-MM-DD) dari minggu yang memuat `dateKey`. */
export const mondayOf = (dateKey) => {
    const d = localDate(dateKey);
    const offset = (d.getDay() + 6) % 7; // Senin=0 ... Minggu=6
    d.setDate(d.getDate() - offset);
    return toDateKey(d);
};

/** Rotasi array ke kiri sebanyak `offset`. */
export const rotate = (arr, offset) => arr.map((_, i) => arr[(i + offset) % arr.length]);

export const OPENING_CLOSING_CONFIG_KEY = 'opening_closing_jobdesk_config';

/**
 * Generate jadwal 4 minggu (28 hari) untuk 4 staf.
 *
 * @param {Object} params
 * @param {Array<{id: number|string, name: string}>} params.staff - tepat 4 staf
 * @param {string} params.startDate - "YYYY-MM-DD", harus Senin
 * @param {number[]} [params.offOrder=[0,1,2,3]] - urutan staf libur Senin→Kamis
 *   minggu pertama (diputar otomatis minggu berikutnya).
 * @returns {Array<Object>} baris per hari: { dateKey, date, week, dayName, off,
 *   opening: [{ job, person }], closing: [{ job, person }], stockChecker }
 */
export function generateOpeningClosingRoster({ staff, startDate, offOrder = [0, 1, 2, 3] }) {
    if (!validateFourStaff(staff)) throw new Error('Pilih tepat 4 staf dapur (id & nama terisi, tanpa duplikat).');
    if (!startDate || localDate(startDate).getDay() !== 1) throw new Error('Tanggal mulai harus hari Senin.');
    if (offOrder.length !== 4 || new Set(offOrder).size !== 4 || offOrder.some((i) => i < 0 || i > 3)) {
        throw new Error('Urutan libur harus berisi 4 indeks staf yang berbeda.');
    }

    const rows = [];
    for (let week = 0; week < 4; week += 1) {
        const groupOne = staff.slice(0, 2); // staf 1 & 2
        const groupTwo = staff.slice(2, 4); // staf 3 & 4
        const opening = week % 2 === 0 ? groupOne : groupTwo; // shift 1 minggu ini
        const closing = week % 2 === 0 ? groupTwo : groupOne; // shift 2 minggu ini

        for (let day = 0; day < 7; day += 1) {
            const date = localDate(startDate);
            date.setDate(date.getDate() + week * 7 + day);
            const isReportDay = day === 0 || day === 3; // Senin / Kamis

            // Libur hanya Senin–Kamis (day 0..3), urutan diputar tiap minggu
            const offIndex = day < 4 ? offOrder[(day + week) % 4] : null;
            const off = offIndex === null ? null : staff[offIndex];

            // Opening (shift 1)
            const openWorkers = opening.filter((person) => person.id !== off?.id);
            const openingAssign = openWorkers.length === 1
                ? [{
                    job: { id: 'gabung-open', label: 'Dapur + Area', icon: '🍳🧹', tasks: [...OPENING_JOBS[0].tasks, ...OPENING_JOBS[1].tasks] },
                    person: openWorkers[0],
                }]
                : rotate(openWorkers, day % 2).map((person, i) => ({ job: OPENING_JOBS[i], person }));

            // Closing (shift 2)
            const closeWorkers = closing.filter((person) => person.id !== off?.id);
            const closingAssign = closeWorkers.length === 1
                ? [{
                    job: { id: 'gabung-close', label: 'Jalur 1 + Jalur 2', icon: '🍽️🧽', tasks: [...CLOSING_JOBS[0].tasks, ...CLOSING_JOBS[1].tasks] },
                    person: closeWorkers[0],
                }]
                : rotate(closeWorkers, day % 2).map((person, i) => ({ job: CLOSING_JOBS[i], person }));

            // Pengecek laporan stok (Senin & Kamis) dari pasangan shift 2.
            // Urutan pasangan ditukar tiap kali kelompok itu jadi shift 2 (minggu ganjil/genap).
            let stockChecker = null;
            if (isReportDay) {
                const pair = rotate(closing, Math.floor(week / 2) % 2);
                stockChecker = pair[day === 0 ? 0 : 1];
                if (stockChecker.id === off?.id) {
                    stockChecker = pair.find((person) => person.id !== off.id) ?? null;
                }
            }

            rows.push({
                dateKey: toDateKey(date),
                date,
                week: week + 1,
                dayName: DAY_NAMES[date.getDay()],
                off,
                opening: openingAssign,
                closing: closingAssign,
                stockChecker,
            });
        }
    }
    return rows;
}

/** Validasi daftar staf: tepat 4 orang, id & nama terisi, tidak ada duplikat. */
export function validateFourStaff(staff) {
    return (
        Array.isArray(staff) &&
        staff.length === 4 &&
        staff.every((person) => person && person.id != null && String(person.name || '').trim() !== '') &&
        new Set(staff.map((person) => String(person.id))).size === 4
    );
}
