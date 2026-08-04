# 📱 Laporan Mobile-Friendliness — Absensi Cafe

**Tanggal Audit:** 4 Agustus 2026
**Scope:** Frontend (React + Vite + Tailwind CSS)

---

## Ringkasan

| Status | Jumlah |
|--------|--------|
| ✅ Sudah mobile-friendly | 18 file |
| ⚠️ Perlu perbaikan | 6 file |
| 🐛 Bug ditemukan | 1 file |

---

## ✅ Komponen yang Sudah Mobile-Friendly

### Layout & Navigasi
| File | Keterangan |
|------|------------|
| `frontend/index.html` | Meta viewport sudah ada |
| `frontend/tailwind.config.js` | Breakpoints default (sm/md/lg/xl) OK |
| `frontend/src/layouts/MainLayout.jsx` | Sidebar off-canvas di mobile |
| `frontend/src/layouts/Sidebar.jsx` | Off-canvas + backdrop click-to-close |
| `frontend/src/layouts/TopBar.jsx` | Hamburger menu mobile + dropdown responsif |
| `frontend/src/layouts/AuthLayout.jsx` | Container `max-w-md` |

### Halaman dengan Mobile Card View ✅
| File | Pola |
|------|------|
| `frontend/src/pages/employee/AttendancePage.jsx` | `hidden md:block` (tabel) + `block md:hidden` (cards) |
| `frontend/src/pages/employee/MySchedulePage.jsx` | Kalender desktop + list view mobile |
| `frontend/src/pages/admin/UsersPage.jsx` | Tabel desktop + cards mobile |
| `frontend/src/pages/admin/AttendanceAdminPage.jsx` | Tabel desktop + cards mobile |
| `frontend/src/pages/admin/LeaveApprovalPage.jsx` | Tabel desktop + cards mobile |
| `frontend/src/pages/admin/SwapApprovalPage.jsx` | Tabel desktop + cards mobile |
| `frontend/src/pages/admin/OffDayApprovalPage.jsx` | Tabel desktop + cards mobile |

### Komponen Shared
| File | Keterangan |
|------|------------|
| `frontend/src/components/shared/Modal.jsx` | `max-w-*` + `p-4` + scrollable |
| `frontend/src/components/shared/Button.jsx` | Size sm/md/lg, flex |
| `frontend/src/components/shared/Input.jsx` | `w-full` |
| `frontend/src/components/shared/Card.jsx` | Responsif |
| `frontend/src/index.css` | Class `.btn`, `.input`, `.card` responsif |

### Modals
| File | Keterangan |
|------|------------|
| `frontend/src/components/modals/ChangePasswordModal.jsx` | OK |
| `frontend/src/components/modals/OffDayRequestModal.jsx` | OK |
| `frontend/src/components/modals/SwapInboxModal.jsx` | `flex-col sm:flex-row` |
| `frontend/src/components/modals/SwapRequestModal.jsx` | OK |

---

## ⚠️ Halaman yang Perlu Perbaikan

### 1. `frontend/src/pages/admin/ShiftManagementPage.jsx`
**Masalah:**
- Header `flex justify-between items-center` — tombol "Add Shift" bisa terpotong di layar < 360px
- Tabel hanya `overflow-x-auto` tanpa mobile card view
- Modal form `grid grid-cols-2 gap-4` untuk Start/End Time — terlalu sempit di mobile

**Rekomendasi:**
- Header: `flex flex-col sm:flex-row sm:items-center justify-between gap-4`
- Tambah mobile card view (`block md:hidden`)
- Modal: `grid grid-cols-1 sm:grid-cols-2 gap-4`

### 2. `frontend/src/pages/admin/PayrollPage.jsx`
**Masalah:**
- Tabel payroll (6 kolom) hanya `overflow-x-auto` — user harus scroll horizontal

**Rekomendasi:**
- Tambah mobile card view (`block md:hidden`) menampilkan nama, total jam, estimasi gaji

### 3. `frontend/src/pages/admin/ReportsPage.jsx`
**Masalah:**
- Tabel report (6 kolom) hanya `overflow-x-auto`
- Filter `min-w-[200px]` untuk dropdown employee — OK tapi bisa lebih rapi

**Rekomendasi:**
- Tambah mobile card view (`block md:hidden`)

### 4. `frontend/src/pages/admin/JobdeskClosingPage.jsx`
**Masalah:**
- Tabel "Semua Hari" (5 kolom) hanya `overflow-x-auto`
- Tabel "Ringkasan Keadilan" hanya `overflow-x-auto`
- **🐛 Bug:** Line 399 `jobs.map` → `ReferenceError: jobs is not defined`, harusnya `JOBS.map`

**Rekomendasi:**
- Fix bug `jobs.map` → `JOBS.map`
- Tambah mobile card view untuk tabel "Semua Hari"

### 5. `frontend/src/pages/employee/LeavePage.jsx`
**Masalah:**
- Header `flex justify-between items-center` — tombol "New Request" bisa terpotong
- Tabel riwayat cuti hanya `overflow-x-auto`
- Modal form `grid grid-cols-2 gap-4` untuk Start/End Date — terlalu sempit

**Rekomendasi:**
- Header: `flex flex-col sm:flex-row sm:items-center justify-between gap-4`
- Tambah mobile card view
- Modal: `grid grid-cols-1 sm:grid-cols-2 gap-4`

### 6. `frontend/src/pages/employee/DashboardPage.jsx`
**Masalah:**
- Tombol aksi (Clock In/Out) di header bisa overflow di layar sangat kecil

**Rekomendasi:**
- Gunakan `flex flex-col sm:flex-row` + `w-full sm:w-auto` untuk tombol

---

## 🐛 Bug yang Ditemukan

### `frontend/src/pages/admin/JobdeskClosingPage.jsx` — Line 399
```jsx
// ❌ Salah — ReferenceError: jobs is not defined
{jobs.map((j) => (

// ✅ Benar
{JOBS.map((j) => (
```
**Dampak:** Halaman "Ringkasan Keadilan Rotasi" akan crash saat dirender.

---

## Kesimpulan

Secara keseluruhan, **arsitektur mobile-first sudah diterapkan dengan baik** — mayoritas halaman sudah punya mobile card view, layout off-canvas, dan komponen responsif. Namun ada **6 halaman** yang masih mengandalkan scroll horizontal untuk tabel, dan **1 bug** yang perlu diperbaiki di JobdeskClosingPage.