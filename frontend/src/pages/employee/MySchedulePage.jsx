import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getUserSchedule } from '../../services/scheduleService';
import Card from '../../components/shared/Card';
import Button from '../../components/shared/Button';
import Badge from '../../components/shared/Badge';
import MyClosingJobdeskWidget from '../../components/employee/MyClosingJobdeskWidget';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, Coffee, ChefHat } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, getDay, isToday } from 'date-fns';
import { id } from 'date-fns/locale';

const ROLE_GUIDE = [
    {
        role: 'A - MAIN COOK (Masak Utama)',
        tasks: ['Masak menu utama', 'Menjaga rasa & porsi tetap sama', 'Fokus di kompor & produksi'],
        custom_sections: [
            {
                title: 'Tanggung Jawab Tambahan',
                content: ['Menolak produksi jika bahan/alat tidak siap', 'Menentukan urutan masak saat ramai (persetujuan PIC)']
            },
            {
                title: 'Konsekuensi',
                content: ['Rasa konsisten = aman', 'Rasa berubah tanpa izin = evaluasi role']
            }
        ],
        dos: ['Masak sesuai resep', 'Koordinasi dengan Support / Runner'],
        donts: ['Hitung stok', 'Tinggal kompor tanpa pengganti', 'Ubah resep sendiri'],
        quote: 'Main Cook bertanggung jawab atas rasa, meskipun dibantu orang lain.',
        color: 'blue'
    },
    {
        role: 'B - SUPPORT COOK / SNACK',
        tasks: ['Bantu Main Cook', 'Pegang menu gorengan / snack', 'Backup kalau masakan utama ramai'],
        custom_sections: [
            {
                title: 'Aturan Tambahan',
                content: ['TIDAK BOLEH mengganti alur kerja tanpa instruksi Main Cook/PIC', 'Saat Main Cook kembali, WAJIB balik ke posisi awal']
            }
        ],
        dos: ['Masak menu snack', 'Siapkan bahan', 'Gantikan Main Cook sebentar kalau diminta'],
        donts: ['Jalan sendiri tanpa koordinasi', 'Ambil bahan tanpa izin Checker'],
        quote: 'Support membantu, bukan mengambil alih.',
        color: 'orange'
    },
    {
        role: 'C - CHECKER / STOCK',
        tasks: ['Cek pesanan sebelum keluar', 'Pastikan pesanan tidak salah', 'Catat stok yang keluar'],
        custom_sections: [
            {
                title: 'Hak Checker',
                content: ['BERHAK menahan order walau dapur ramai', 'BERHAK menegur siapa pun jika standar tidak sesuai']
            },
            {
                title: 'Tanggung Jawab',
                content: ['Order salah lolos = tanggung jawab Checker di shift itu']
            }
        ],
        dos: ['Koreksi plating', 'Menahan pesanan kalau salah', 'Lapor stok menipis'],
        donts: ['Masak sambil hitung stok', 'Biarkan pesanan salah keluar'],
        quote: 'Checker lebih tinggi dari kecepatan.',
        color: 'purple'
    },
    {
        role: 'D - RUNNER / AREA',
        tasks: ['Antar makanan ke server', 'Jaga area dapur tetap rapi', 'Isi ulang bahan di station'],
        custom_sections: [
            {
                title: 'Tanggung Jawab Tambahan',
                content: ['Melapor ke PIC jika area mulai kotor/licin', 'Menjadi orang pertama yang bantu sanitation saat dibutuhkan']
            }
        ],
        dos: ['Ambil & antar pesanan', 'Bersihkan area kerja'],
        donts: ['Ikut masak tanpa instruksi', 'Biarkan area kotor'],
        quote: 'Runner bukan tukang jalan, tapi penjaga alur.',
        color: 'indigo'
    },
    {
        role: 'E - HELPER / FLOATING',
        tasks: ['Bantu bagian yang paling sibuk', 'Fokus bersih-bersih & prep', 'Backup semua role kalau dibutuhkan'],
        custom_sections: [
            {
                title: 'Aturan Kunci',
                content: ['Helper bekerja BERDASARKAN ARAHAN PIC', 'Tanpa instruksi → fokus ke kebersihan & prep saja']
            }
        ],
        dos: ['Cuci alat', 'Potong bahan', 'Bantu siapa saja'],
        donts: ['Pegang kompor sendiri', 'Ambil keputusan tanpa izin'],
        quote: 'Helper bukan bebas, tapi fleksibel dengan arah.',
        color: 'teal'
    }
];

const ADDITIONAL_ROLES = [
    {
        title: '🍽️ DISHWASHER',
        tasks: ['Cuci alat makan & masak', 'Jaga area sink bersih'],
        custom_sections: [
            {
                title: 'Standar Wajib',
                content: ['Alat harus bebas sisa makanan & bau', 'Pisahkan alat mentah & matang', 'BERHAK lapor PIC jika alat menumpuk & produksi harus diperlambat']
            },
            {
                title: 'Larangan',
                content: ['Menumpuk alat kotor berjam-jam', 'Mengembalikan alat belum kering']
            }
        ],
        note: '📌 Alat bersih = dapur jalan.',
        color: 'gray'
    },
    {
        title: '🧾 PIC STOK (MINGGUAN)',
        tasks: ['Rekap stok mingguan', 'Belanja bahan yang kurang', 'Laporan stok ke owner / admin'],
        custom_sections: [
            {
                title: 'Aturan Kerja',
                content: ['Rekap dilakukan minimal 1x / minggu', 'Laporan stok SEBELUM bahan habis, bukan setelah']
            },
            {
                title: 'Tanggung Jawab',
                content: ['Bahan habis tanpa laporan = kesalahan PIC Stok']
            }
        ],
        note: '📌 Stok habis tanpa laporan = kegagalan sistem.',
        color: 'green'
    }
];

const INTRO_GUIDE = [
    {
        title: '1️⃣ APA ITU SOP?',
        content: [
            'SOP = aturan cara kerja yang harus diikuti semua orang.',
            'Tujuan: Supaya kerja rapi, tidak bingung "siapa ngapain", kualitas sama, dan dapur jalan walau orang ganti.',
            '📌 SOP bukan untuk menyulitkan, tapi supaya: Tidak ribut, Tidak saling lempar tugas, Tidak salah masak.',
            'Kalau tidak pakai SOP → dapur pasti kacau.'
        ]
    },
    {
        title: '2️⃣ APA ITU SISTEM KERJA?',
        content: [
            'Sistem kerja = cara dapur berjalan setiap hari.',
            'Di dapur kita: Setiap orang punya peran, punya tugas, saling bantu tapi tidak tumpang tindih.',
            '📌 Prinsip utama: Kerja sesuai peran, bukan sesuai mood.'
        ]
    },
    {
        title: '3️⃣ SIAPA YANG MENILAI?',
        content: [
            'Evaluasi pelanggaran SOP dilakukan oleh Shift PIC dan dilaporkan ke Owner/Admin.',
            'Jika jumlah personel kurang, PIC berhak menggabungkan tugas, TAPI tidak boleh menghilangkan Sanitation dan Checker.'
        ]
    }
];

const SANITATION_GUIDE = [
    {
        title: '1️⃣ APA ITU SANITATION?',
        content: [
            'Sanitation = semua kegiatan membersihkan dapur supaya makanan AMAN dimakan.',
            'Bukan sekadar "kelihatan bersih", tapi: Tidak ada bakteri, Tidak ada bau, Tidak ada sisa makanan lama.',
            '📌 Makanan enak tapi kotor = berbahaya.'
        ]
    },
    {
        title: '2️⃣ KENAPA SANITATION ITU PRIORITAS?',
        content: [
            'Satu kesalahan → pelanggan bisa sakit. Satu komplain → reputasi rusak.',
            '📌 Sanitation selalu lebih penting dari kecepatan.'
        ]
    },
    {
        title: '3️⃣ JENIS SANITATION DI DAPUR',
        content: [
            '🧼 OPEN (Pagi): Siapkan dapur SIAP & AMAN. Lap meja, cek kompor, pastikan alat bersih.',
            '📌 Dapur TIDAK BOLEH masak sebelum ini selesai.',
            '🧼 CLOSE (Malam): Cuci semua alat, pel lantai, buang sampah. Menentukan kualitas besok.'
        ]
    },
    {
        title: '4️⃣ APA ARTINYA "PRIORITY"?',
        content: [
            'Orang dengan badge [PRIORITY] FOKUS ke kebersihan.',
            'Boleh stop produksi sementara. Semua orang WAJIB membantu.',
            '📌 Order boleh menunggu, sanitation TIDAK.'
        ]
    },
    {
        title: '5️⃣ TANGGUNG JAWAB & LARANGAN',
        content: [
            'PIC Sanitation = Koordinator. Tapi SEMUA wajib jaga bersih.',
            '❌ DILARANG: Masak sambil cuci, Pakai alat kotor, Biarkan lantai licin.',
            '📌 Kotor sedikit = masalah besar.'
        ]
    },
    {
        title: '6️⃣ KONSEKUENSI',
        content: [
            'Pelanggaran = Teguran, Evaluasi, atau Dicabut dari role.',
            'Ini bukan soal rajin, ini soal KESELAMATAN pelanggan.'
        ]
    }
];

const PIC_GUIDE = [
    {
        title: '1️⃣ SHIFT PIC (Penanggung Jawab Shift)',
        content: [
            'Shift PIC = "pemimpin sementara". Bukan bos, tapi PUNYA HAK AMBIL KEPUTUSAN.',
            'Tugas: Mengatur alur, Membagi fokus, Stop kerja jika chaos.',
            '✅ BOLEH: Stop produksi, Tukar role, Menegur.',
            '❌ TIDAK BOLEH: Diam saat masalah, Lempar tanggung jawab, Ikut masak sampai lupa ngatur.',
            '📌 "Kalau bingung, cari PIC. Kalau PIC bicara, jalankan."'
        ]
    },
    {
        title: '2️⃣ PIC STOK (Penanggung Jawab Bahan)',
        content: [
            'PIC Stok = penjaga bahan (Mingguan). Memastikan dapur TIDAK KEHABISAN bahan.',
            'Tugas: Rekap stok, List belanja, Lapor owner.',
            '✅ BOLEH: Menahan bahan tanpa catatan.',
            '❌ TIDAK BOLEH: Asumsi "nanti dibeli", Diam saat kritis.',
            '📌 "Kalau ambil bahan, lapor ke Checker / PIC Stok."'
        ]
    },
    {
        title: '3️⃣ BEDANYA SHIFT PIC vs PIC STOK',
        content: [
            'Shift PIC: Urus HARI INI, Fokus Alur, Keputusan Cepat.',
            'PIC Stok: Urus MINGGU INI, Fokus Ketersediaan, Keputusan Logistik.',
            '📌 Satu orang bisa pegang dua role, tapi TIDAK BERSAMAAN di jam sibuk.'
        ]
    },
    {
        title: '4️⃣ KESALAHAN UMUM & ATURAN KERAS',
        content: [
            '❌ PIC dianggap "tukang bantu" (SALAH).',
            '❌ PIC tidak berani stop produksi (SALAH).',
            '⚠️ VERSI KERAS: Shift PIC BERTANGGUNG JAWAB. Tidak patuh = Pelanggaran SOP.',
            '📌 "Role boleh ganti, tapi tanggung jawab TIDAK BOLEH LEPAS."'
        ]
    }
];

const GENERAL_GUIDELINES = [
    {
        title: '5️⃣ KENAPA ADA PRIORITAS?',
        content: [
            'Kadang dapur ramai, kurang orang, banyak order.',
            'Urutan Prioritas:',
            '1. Kebersihan & keamanan makanan',
            '2. Stok & alat siap',
            '3. Produksi makanan',
            '📌 Order bisa menunggu, kesehatan & kebersihan tidak.'
        ]
    },
    {
        title: '6️⃣ KALAU TIDAK IKUT SOP?',
        content: [
            'Akibat: Kerja jadi berantakan, Salah paham antar tim, Kualitas turun.',
            'SOP dibuat bukan untuk menghukum, tapi supaya semua adil & jelas.'
        ]
    }
];

const MySchedulePage = () => {
    const { user } = useAuth();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [schedules, setSchedules] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showRoleInfo, setShowRoleInfo] = useState(false);

    const fetchSchedule = async () => {
        if (!user) {
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const start = startOfMonth(currentDate);
            const end = endOfMonth(currentDate);

            const response = await getUserSchedule(
                user.id,
                format(start, 'yyyy-MM-dd'),
                format(end, 'yyyy-MM-dd')
            );
            setSchedules(response.data.data || []);
        } catch (error) {
            console.error('Failed to fetch schedule:', error);
            setSchedules([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSchedule();
    }, [currentDate, user]);

    const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
    const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));
    const jumpToToday = () => setCurrentDate(new Date());

    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(monthStart);

    const startDayOfWeek = getDay(monthStart);
    const paddingDays = Array(startDayOfWeek).fill(null);
    const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
    const allDays = [...paddingDays, ...daysInMonth];

    const getScheduleForDay = (date) => {
        return schedules.find(s => isSameDay(new Date(s.date), date));
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <CalendarIcon className="w-6 h-6 text-primary-600" />
                        Jadwal Saya
                    </h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">
                        Lihat jadwal kerja dan role harian Anda
                    </p>
                </div>

                <div className="flex items-center gap-2 bg-white dark:bg-gray-800 p-1 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
                    <button onClick={prevMonth} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">
                        <ChevronLeft className="w-5 h-5" />
                    </button>
                    <span className="font-semibold px-4 min-w-[140px] text-center">
                        {format(currentDate, 'MMMM yyyy', { locale: id })}
                    </span>
                    <button onClick={nextMonth} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">
                        <ChevronRight className="w-5 h-5" />
                    </button>
                    <button onClick={jumpToToday} className="ml-2 px-3 py-1 text-xs font-medium bg-primary-50 text-primary-700 rounded hover:bg-primary-100 dark:bg-primary-900/30 dark:text-primary-300">
                        Hari Ini
                    </button>
                </div>
            </div>

            {/* Jobdesk Closing Ramadhan — hanya muncul jika user ada di tim closing */}
            <MyClosingJobdeskWidget />

            <Card className="p-6">
                {/* Desktop Calendar View */}
                <div className="hidden md:block">
                    <div className="grid grid-cols-7 gap-px bg-gray-200 dark:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                        {['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'].map((day) => (
                            <div key={day} className="bg-gray-50 dark:bg-gray-800 p-2 text-center text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                                {day}
                            </div>
                        ))}

                        {allDays.map((day, idx) => {
                            if (!day) return <div key={`pad-${idx}`} className="bg-white dark:bg-gray-800 min-h-[140px]" />;

                            const schedule = getScheduleForDay(day);
                            const isTodayDate = isToday(day);

                            return (
                                <div
                                    key={day.toISOString()}
                                    className={`bg-white dark:bg-gray-800 min-h-[140px] p-2 border-t border-gray-100 dark:border-gray-700 relative hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${isTodayDate ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''
                                        }`}
                                >
                                    <div className={`text-sm font-medium mb-1 ${isTodayDate ? 'text-primary-600 bg-primary-100 dark:bg-primary-900 rounded-full w-7 h-7 flex items-center justify-center' : 'text-gray-700 dark:text-gray-300'}`}>
                                        {format(day, 'd')}
                                    </div>

                                    {loading ? (
                                        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-3/4 mx-auto mt-4"></div>
                                    ) : schedule ? (
                                        schedule.isOffDay ? (
                                            <div className="flex flex-col items-center justify-center h-full pb-8">
                                                <div className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1">
                                                    <Coffee className="w-3 h-3" /> LIBUR
                                                </div>
                                            </div>
                                        ) : schedule.shift ? (
                                            <div className="space-y-1.5">
                                                {/* Shift Badge */}
                                                <div className={`text-xs font-medium px-2 py-0.5 rounded text-center border ${schedule.shift.id === 1
                                                    ? 'bg-blue-50 text-blue-700 border-blue-100 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800'
                                                    : 'bg-orange-50 text-orange-700 border-orange-100 dark:bg-orange-900/20 dark:text-orange-300 dark:border-orange-800'
                                                    }`}>
                                                    {schedule.shift.name} {/* Pagi / Siang */}
                                                </div>

                                                {/* Kitchen Station (Full Display) */}
                                                {/* Kitchen Station (Blue Badge) */}
                                                {schedule.kitchenStation && (
                                                    <div className="flex flex-col gap-1 mt-1">
                                                        <div className="w-full text-[10px] leading-tight font-bold text-blue-700 bg-blue-50 dark:text-blue-300 dark:bg-blue-900/30 px-1.5 py-1 rounded border border-blue-100 dark:border-blue-800 text-center whitespace-normal break-words">
                                                            {/* Display only Role Code & Name (A - Main Cook) */}
                                                            <span>{schedule.kitchenStation.split(' + ')[0]}</span>

                                                            {/* LOCKED SLOT INDICATOR for Role C */}
                                                            {schedule.kitchenStation.startsWith('C') && (
                                                                <div className="mt-0.5 pt-0.5 border-t border-blue-200 dark:border-blue-700 w-full flex items-center justify-center gap-0.5 text-[8px] font-extrabold text-red-600 dark:text-red-400">
                                                                    <Clock className="w-2 h-2" />
                                                                    <span>LOCK 14:00</span>
                                                                </div>
                                                            )}
                                                        </div>

                                                        {/* Control Role (Green Badge - Max 1) */}
                                                        {schedule.isInventoryController ? (
                                                            <div className="text-[9px] font-bold text-green-700 bg-green-100 border border-green-200 px-1 py-0.5 rounded text-center leading-none mx-auto w-fit">
                                                                PIC STOK (SENIN)
                                                            </div>
                                                        ) : schedule.isShiftPic ? (
                                                            <div className="text-[9px] font-bold text-green-700 bg-green-100 border border-green-200 px-1 py-0.5 rounded text-center leading-none mx-auto w-fit">
                                                                SHIFT PIC
                                                            </div>
                                                        ) : schedule.isSanitationLead ? (
                                                            <div className="text-[9px] font-bold text-white bg-teal-600 border border-teal-700 px-1 py-0.5 rounded text-center leading-none mx-auto w-fit">
                                                                SANITATION {schedule.shift.id === 1 ? 'OPEN' : 'CLOSE'} (PRIORITY C)
                                                            </div>
                                                        ) : null}

                                                        {/* Dishwasher Badge for Role D & E */}
                                                        {(schedule.kitchenStation.startsWith('D') || schedule.kitchenStation.startsWith('E')) && (
                                                            <div className="text-[9px] font-bold text-gray-700 bg-gray-100 border border-gray-300 px-1 py-0.5 rounded text-center leading-none mx-auto w-fit">
                                                                DISHWASHER
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="text-xs text-gray-400 text-center italic mt-4">
                                                -
                                            </div>
                                        )
                                    ) : (
                                        <div className="text-xs text-gray-400 text-center italic mt-4 opacity-50">
                                            -
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Mobile List View */}
                <div className="md:hidden space-y-3">
                    {daysInMonth.map((day) => {
                        const schedule = getScheduleForDay(day);
                        const isTodayDate = isToday(day);

                        return (
                            <div key={day.toISOString()} className={`flex items-start justify-between p-3 rounded-lg border ${isTodayDate
                                ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                                : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800'
                                }`}>
                                <div className="flex items-start gap-3 w-full">
                                    <div className="flex flex-col items-center justify-center w-10 pt-1">
                                        <span className="text-xs uppercase font-bold text-gray-500 dark:text-gray-400">
                                            {format(day, 'EEE', { locale: id })}
                                        </span>
                                        <span className={`text-lg font-bold ${isTodayDate ? 'text-primary-600' : 'text-gray-900 dark:text-white'}`}>
                                            {format(day, 'd')}
                                        </span>
                                    </div>
                                    <div className="w-px self-stretch bg-gray-300 dark:bg-gray-600 mx-1"></div>
                                    <div className="flex-1">
                                        {schedule?.isOffDay ? (
                                            <span className="text-red-600 dark:text-red-400 font-bold flex items-center gap-1 mt-1">
                                                <Coffee className="w-4 h-4" /> LIBUR KERJA
                                            </span>
                                        ) : schedule?.shift ? (
                                            <div className="grid grid-cols-1 gap-1">
                                                <div className="flex justify-between items-center">
                                                    <p className="font-semibold text-gray-900 dark:text-white">{schedule.shift.name}</p>
                                                    <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                                                        <Clock className="w-3 h-3" />
                                                        {schedule.shift.startTime.slice(0, 5)} - {schedule.shift.endTime.slice(0, 5)}
                                                    </p>
                                                </div>

                                                {schedule.kitchenStation && (
                                                    <div className="mt-1 flex flex-wrap gap-1">
                                                        <div className="inline-flex items-center gap-2 text-xs font-medium text-purple-700 bg-purple-50 dark:text-purple-300 dark:bg-purple-900/20 px-2 py-1 rounded border border-purple-100 dark:border-purple-800">
                                                            <ChefHat className="w-3 h-3" />
                                                            <span>{schedule.kitchenStation}</span>
                                                        </div>

                                                        {schedule.isInventoryController && (
                                                            <span className="inline-block text-[9px] font-bold text-white bg-green-600 px-1.5 py-0.5 rounded">
                                                                PIC STOK
                                                            </span>
                                                        )}
                                                        {schedule.isShiftPic && (
                                                            <span className="inline-block text-[9px] font-bold text-white bg-indigo-600 px-1.5 py-0.5 rounded">
                                                                SHIFT PIC
                                                            </span>
                                                        )}
                                                        {schedule.isSanitationLead && (
                                                            <span className="inline-block text-[9px] font-bold text-white bg-teal-600 px-1.5 py-0.5 rounded">
                                                                SANITATION (PRIORITY)
                                                            </span>
                                                        )}
                                                        {(schedule.kitchenStation.startsWith('D') || schedule.kitchenStation.startsWith('E')) && (
                                                            <span className="inline-block text-[9px] font-bold text-gray-700 bg-gray-200 px-1.5 py-0.5 rounded border border-gray-300">
                                                                DISHWASHER
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <span className="text-gray-400 italic text-sm mt-1 block">Tidak ada jadwal</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </Card>

            {/* Detailed Role Guide Section */}
            <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between mb-3 cursor-pointer" onClick={() => setShowRoleInfo(!showRoleInfo)}>
                    <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                        <ChefHat className="w-4 h-4" />
                        Panduan Lengkap Role & SOP
                    </h3>
                    <Button variant="ghost" size="sm">
                        {showRoleInfo ? 'Sembunyikan' : 'Tampilkan'}
                    </Button>
                </div>

                {showRoleInfo && (
                    <div className="space-y-6 mt-4 animate-in fade-in duration-300">
                        {/* 0. Intro Section */}
                        <div className="bg-yellow-50 dark:bg-yellow-900/10 p-5 rounded-lg border border-yellow-100 dark:border-yellow-800">
                            <h3 className="font-bold text-yellow-800 dark:text-yellow-300 mb-4 text-center text-lg">PENJELASAN SOP, SISTEM KERJA, & TUGAS KERJA</h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                {INTRO_GUIDE.map((sect) => (
                                    <div key={sect.title} className="text-sm">
                                        <strong className="block text-gray-900 dark:text-white mb-2 text-base">{sect.title}</strong>
                                        <ul className="space-y-2 text-xs text-gray-700 dark:text-gray-300 leading-relaxed">
                                            {sect.content.map((line, i) => (
                                                <li key={i} className={line.startsWith('📌') ? 'font-bold mt-1 text-yellow-800 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/30 p-1.5 rounded' : ''}>
                                                    {line}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* 0.5 Sanitation Section */}
                        <div className="bg-teal-50 dark:bg-teal-900/10 p-5 rounded-lg border border-teal-100 dark:border-teal-800">
                            <h3 className="font-bold text-teal-800 dark:text-teal-300 mb-4 text-center text-lg flex items-center justify-center gap-2">
                                <span className="bg-teal-600 text-white text-xs px-2 py-0.5 rounded">WAJIB</span>
                                PENJELASAN KEBERSIHAN (SANITATION)
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {SANITATION_GUIDE.map((sect) => (
                                    <div key={sect.title} className="text-sm">
                                        <strong className="block text-teal-900 dark:text-teal-200 mb-2 text-base">{sect.title}</strong>
                                        <ul className="space-y-2 text-xs text-gray-700 dark:text-gray-300 leading-relaxed">
                                            {sect.content.map((line, i) => (
                                                <li key={i} className={line.startsWith('📌') ? 'font-bold mt-1 text-teal-800 dark:text-teal-400 bg-teal-100 dark:bg-teal-900/30 p-1.5 rounded' : ''}>
                                                    {line}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* 0.7 PIC Section - NEW */}
                        <div className="bg-indigo-50 dark:bg-indigo-900/10 p-5 rounded-lg border border-indigo-100 dark:border-indigo-800">
                            <h3 className="font-bold text-indigo-800 dark:text-indigo-300 mb-4 text-center text-lg flex items-center justify-center gap-2">
                                <span className="bg-indigo-600 text-white text-xs px-2 py-0.5 rounded">LEADERSHIP</span>
                                PENJELASAN ROLE PIC (WAJIB DIBACA)
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
                                {PIC_GUIDE.map((sect) => (
                                    <div key={sect.title} className="text-sm">
                                        <strong className="block text-indigo-900 dark:text-indigo-200 mb-2 text-base">{sect.title}</strong>
                                        <ul className="space-y-2 text-xs text-gray-700 dark:text-gray-300 leading-relaxed">
                                            {sect.content.map((line, i) => (
                                                <li key={i} className={line.startsWith('📌') || line.startsWith('⚠️') ? 'font-bold mt-1 text-indigo-800 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-900/30 p-1.5 rounded' : ''}>
                                                    {line}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* 1. Main Roles Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {ROLE_GUIDE.map((guide) => (
                                <div key={guide.role} className={`p-4 rounded-lg border bg-white dark:bg-gray-800 border-${guide.color}-100 dark:border-${guide.color}-900 shadow-sm transition-all hover:shadow-md`}>
                                    <h4 className={`font-bold text-gray-900 dark:text-white mb-3 border-b pb-2 flex items-center justify-between`}>
                                        {guide.role}
                                        <span className={`text-xs px-2 py-0.5 rounded-full bg-${guide.color}-100 text-${guide.color}-800`}>Role</span>
                                    </h4>

                                    <div className="space-y-3 text-xs">
                                        <div>
                                            <strong className="block text-gray-700 dark:text-gray-300 mb-1">Tugas Utama:</strong>
                                            <ul className="list-disc pl-4 space-y-0.5 text-gray-600 dark:text-gray-400">
                                                {guide.tasks.map((t, i) => <li key={i}>{t}</li>)}
                                            </ul>
                                        </div>

                                        {/* Custom Sections (Specific Rules/Consequences) */}
                                        {guide.custom_sections && guide.custom_sections.map((section, idx) => (
                                            <div key={idx} className="bg-gray-50 dark:bg-gray-700/50 p-2 rounded border border-gray-100 dark:border-gray-600">
                                                <strong className="block text-gray-800 dark:text-gray-200 mb-1 text-[10px] uppercase tracking-wider">{section.title}:</strong>
                                                <ul className="list-disc pl-3 space-y-0.5 text-gray-600 dark:text-gray-400 text-[10px]">
                                                    {section.content.map((c, i) => <li key={i}>{c}</li>)}
                                                </ul>
                                            </div>
                                        ))}

                                        <div className="grid grid-cols-2 gap-2 h-full">
                                            <div className="bg-green-50 dark:bg-green-900/10 p-2 rounded">
                                                <strong className="block text-green-700 dark:text-green-400 mb-1">✅ Boleh:</strong>
                                                <ul className="list-disc pl-3 space-y-0.5 text-gray-600 dark:text-gray-400 text-[10px]">
                                                    {guide.dos.map((t, i) => <li key={i}>{t}</li>)}
                                                </ul>
                                            </div>
                                            <div className="bg-red-50 dark:bg-red-900/10 p-2 rounded">
                                                <strong className="block text-red-700 dark:text-red-400 mb-1">❌ TIDAK Boleh:</strong>
                                                <ul className="list-disc pl-3 space-y-0.5 text-gray-600 dark:text-gray-400 text-[10px]">
                                                    {guide.donts.map((t, i) => <li key={i}>{t}</li>)}
                                                </ul>
                                            </div>
                                        </div>

                                        <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700 text-center italic font-medium text-gray-500">
                                            " {guide.quote} "
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* 2. Additional Roles (Dishwasher & PIC Stok) */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {ADDITIONAL_ROLES.map((role) => (
                                <div key={role.title} className="p-4 rounded-lg bg-gray-50 dark:bg-gray-700/30 border border-gray-200 dark:border-gray-600">
                                    <h4 className="font-bold text-gray-800 dark:text-gray-200 mb-2">{role.title}</h4>
                                    <ul className="list-disc pl-4 text-xs text-gray-600 dark:text-gray-400 mb-2">
                                        {role.tasks.map((t, i) => <li key={i}>{t}</li>)}
                                    </ul>

                                    {/* Custom Sections (Specific Rules) */}
                                    {role.custom_sections && role.custom_sections.map((section, idx) => (
                                        <div key={idx} className="bg-white dark:bg-gray-800 p-2 rounded border border-gray-200 dark:border-gray-600 mb-2">
                                            <strong className="block text-gray-800 dark:text-gray-200 mb-1 text-[10px] uppercase tracking-wider">{section.title}:</strong>
                                            <ul className="list-disc pl-3 space-y-0.5 text-gray-600 dark:text-gray-400 text-[10px]">
                                                {section.content.map((c, i) => <li key={i}>{c}</li>)}
                                            </ul>
                                        </div>
                                    ))}

                                    <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mt-2 bg-white dark:bg-gray-800 p-2 rounded border border-gray-200 dark:border-gray-600">
                                        {role.note}
                                    </p>
                                </div>
                            ))}
                        </div>

                        {/* 3. General Guidelines */}
                        <div className="bg-blue-50 dark:bg-blue-900/10 p-4 rounded-lg border border-blue-100 dark:border-blue-800">
                            <h3 className="font-bold text-blue-800 dark:text-blue-300 mb-3 text-center">PEDOMAN OPERASIONAL (SOP)</h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                {GENERAL_GUIDELINES.map((sect) => (
                                    <div key={sect.title} className="text-sm">
                                        <strong className="block text-gray-900 dark:text-white mb-2">{sect.title}</strong>
                                        <ul className="space-y-1 text-xs text-gray-700 dark:text-gray-300">
                                            {sect.content.map((line, i) => (
                                                <li key={i} className={line.startsWith('📌') ? 'font-semibold mt-1 text-blue-700 dark:text-blue-400' : ''}>
                                                    {line}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <div className="flex gap-4 text-sm text-gray-600 dark:text-gray-400 px-2 justify-center sm:justify-start">
                <span className="text-xs italic text-gray-400">* Klik "Tampilkan" di atas untuk melihat pedoman lengkap.</span>
            </div>
        </div>
    );
};

export default MySchedulePage;
