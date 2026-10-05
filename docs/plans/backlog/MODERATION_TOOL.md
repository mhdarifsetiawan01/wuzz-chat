# Backlog: Alat Moderasi Laporan (Halaman Web Moderator)

> Dibuat 2026-10-05. **Status: DIRENCANAKAN, BELUM DIKERJAKAN.** Keputusan pemilik proyek: **Pilihan 1 (halaman web khusus moderator)**.
> Dokumen ini ditulis agar developer berikutnya (atau sesi AI berikutnya) bisa langsung mengerjakan tanpa konteks percakapan.
> Fakta bertanda **(terverifikasi)** sudah dicek di kode per tanggal di atas; bertanda **(belum diverifikasi)** harus dicek dulu.

## 1. Latar belakang dan tujuan

Pengguna dapat menekan **Laporkan** pada pesan, postingan, komentar, profil, atau grup. Laporan tersimpan di tabel `content_reports`, tetapi **tidak ada tempat untuk membaca dan menindaklanjutinya**:
satu-satunya cara saat ini adalah memanggil API dengan token moderator atau SQL langsung. Akibatnya:
- Janji di `https://chat.wuzzhub.id/child-safety` ("laporan keselamatan anak ditinjau dengan prioritas tertinggi") tidak bisa dipenuhi secara praktis.
- Kebijakan konten buatan pengguna Google Play mengharapkan proses moderasi yang benar-benar berjalan.

**Tujuan:** halaman web (hanya untuk moderator) untuk melihat laporan, membaca isi yang dilaporkan, mengambil tindakan, dan mencatat keputusan (jejak audit). Tidak butuh build APK.

**Bukan tujuan (di luar lingkup tahap ini):** layar moderator di aplikasi mobile, moderasi otomatis/AI, banding oleh pengguna, dasbor analitik, pemindaian konten pesan langsung (E2EE, mustahil).

## 2. Kondisi saat ini (terverifikasi)

| Komponen | Lokasi | Keterangan |
|---|---|---|
| Tabel laporan | `backend/internal/store/report_store.go` (`content_reports`) | kolom: `id, tenant_id, reporter_id, target_type, target_id, target_user_id, reason, details, evidence, status, created_at`; unik per `(reporter_id, target_type, target_id)`; indeks `(tenant_id, status, created_at DESC)` |
| Jenis target | `ReportTarget*` | `message`, `user`, `post`, `comment`, `group` |
| Status | `ReportStatus*` | `open`, `resolved`, `dismissed` |
| Alasan | `report_handler.go` (`validReportReasons`) | `spam, harassment, hate, sexual, violence, illegal, impersonation, other` |
| Endpoint | `report_handler.go` | `POST /api/reports` (pengguna, 20/jam), `GET /api/reports?status=` (moderator), `PATCH /api/reports/{id}` (moderator: ubah status) |
| Pemeriksaan moderator | `report_handler.go` `isModerator` | `wuzz_moderator`, `admin`, `superadmin` |
| Peran di JWT | `auth/jwt.go` klaim `system_role` | disalin saat refresh |
| Peran di fitur Linimasa | `feed/entity.go` | `wuzz_admin` dan `wuzz_moderator`; staf boleh menghapus postingan tenant yang sama (`feed/service.go` `DeletePost`) |
| Cara mengangkat moderator | **hanya SQL** | tidak ada kode yang mengubah `users.system_role` |
| Gate web | `frontend/lib/app-download.ts` | web sedang dijeda; route yang dikecualikan harus ditambah agar halaman admin tetap terbuka |
| Bukti pesan E2EE | kolom `evidence` | satu-satunya bukti untuk pesan langsung; **server tidak bisa membaca DM** |

**Ketidakkonsistenan yang harus dibereskan:** `isModerator` di laporan menyebut `admin`/`superadmin` yang tidak dipakai di tempat lain, sedangkan Linimasa memakai `wuzz_admin`. Samakan (satu fungsi `IsStaff(role)` bersama).

**Belum ada sama sekali (terverifikasi):** mekanisme menangguhkan/memblokir akun (tidak ada kolom status/`suspended` di `users`, login tidak memeriksanya), jejak audit keputusan moderator, pemberitahuan laporan baru, dan akses baca ke konten yang dilaporkan lewat satu pintu.
**(belum diverifikasi)** apakah ada rute hapus komentar dan hapus pesan grup oleh staf (di `feed_handler.go` ada penanganan `comments`, tetapi belum diperiksa untuk DELETE).

## 3. Rancangan

### 3.1 Backend

**Migrasi (SQLite dan PostgreSQL, `CREATE ... IF NOT EXISTS` / `ALTER` idempoten seperti pola `autoMigrate`):**
- `users`: tambah `suspended_at TIMESTAMP NULL`, `suspended_reason VARCHAR(255) DEFAULT ''`, `suspended_by VARCHAR(64) DEFAULT ''`.
- `moderation_actions` (jejak audit, append-only): `id, tenant_id, report_id, moderator_id, action, target_type, target_id, target_user_id, note, created_at`.
  Aksi: `dismiss`, `resolve`, `delete_content`, `suspend_user`, `unsuspend_user`, `reopen`.
- `content_reports`: tambah `reviewed_by VARCHAR(64)`, `reviewed_at TIMESTAMP NULL`, `resolution_note TEXT` (atau cukup lewat `moderation_actions`; pilih satu, jangan ganda).

**Endpoint baru (semua `RequireJWT` + `IsStaff`, tenant-scoped, rate limit per moderator):**
| Endpoint | Fungsi |
|---|---|
| `GET /api/admin/reports?status=&target_type=&reason=&cursor=` | daftar berpaginasi; urutkan **keselamatan anak/seksual dan `illegal` dulu**, lalu terbaru |
| `GET /api/admin/reports/{id}` | detail: laporan + isi target (lihat 3.2) + laporan lain pada target yang sama + riwayat tindakan |
| `POST /api/admin/reports/{id}/action` | `{action, note}` untuk `dismiss`/`resolve`/`delete_content`/`suspend_user`; satu transaksi: ubah konten/akun + tutup laporan + tulis `moderation_actions` |
| `POST /api/admin/users/{id}/unsuspend` | buka tangguhan (tulis audit) |

**Penangguhan akun (efek yang harus ada):** (1) login ditolak dengan pesan jelas; (2) JWT yang sudah terbit dicabut (pakai `RevokeAllUserTokens`, seperti hapus akun) dan koneksi WebSocket ditendang; (3) pemeriksaan di `RequireJWT`/refresh agar token baru tidak bisa diterbitkan; (4) konten pengguna tetap, tetapi pengirim tidak bisa mengirim baru.
Penangguhan **tidak** menghapus data (beda dengan hapus akun); harus bisa dibalik.

### 3.2 Membaca isi yang dilaporkan, per jenis target
| Target | Cara mengambil isi | Catatan |
|---|---|---|
| `post` / `comment` | baca dari `feed_posts` / `feed_comments` (tenant-scoped) | tindakan: hapus (pakai logika yang ada di `feed/service.go`) |
| `message` grup/forum | baca `messages` (teks terbaca di server) + konteks beberapa pesan sebelum/sesudah | tindakan: hapus pesan |
| `message` DM (E2EE) | **tampilkan hanya `evidence` dari pelapor**, beri label "tidak dapat diverifikasi server" | tindakan terbatas pada penangguhan akun; jangan pernah mencoba mendekripsi |
| `user` | profil publik (nama, bio, avatar) | tindakan: tangguhkan |
| `group` | info grup dan beberapa pesan terakhir | tindakan: **(belum diputuskan)** menutup grup atau menangguhkan pembuatnya |
Jika konten sudah dihapus oleh pemiliknya, tampilkan "konten sudah dihapus" dan simpan `evidence` sebagai satu-satunya bukti; jangan mengembalikan 404 yang membingungkan.

### 3.3 Frontend (Next.js, `frontend/app/admin/reports/`)
- Halaman `/admin/reports` (daftar) dan `/admin/reports/[id]` (detail + tombol tindakan + catatan wajib untuk hapus/tangguhkan).
- **Autentikasi:** memakai sesi web yang sudah ada (JWT di `localStorage`); halaman memeriksa `system_role` dan menampilkan "akses ditolak" untuk non-staf. Pemeriksaan **sebenarnya ada di backend**, UI hanya kosmetik.
- Tambahkan `/admin` ke `WEB_PAUSED_EXEMPT_PREFIXES` (`frontend/lib/app-download.ts`) agar terbuka walau web pengguna dijeda; **jangan** mengaktifkan fitur chat web.
- Gaya mengikuti `frontend/DESIGN.md` (token CSS, tanpa hex mentah). Tidak diindeks mesin pencari (`robots: noindex`).
- **Keamanan tampilan:** semua teks pengguna (isi laporan, evidence, bio) dirender sebagai teks biasa (React meng-escape); jangan `dangerouslySetInnerHTML`; tautan dari konten pengguna diberi `rel="noopener noreferrer nofollow"` dan tidak dibuka otomatis.

### 3.4 Pemberitahuan (tahap 2)
Pilih satu (keputusan terbuka): **email** ke `SUPPORT_EMAIL` (butuh SMTP/penyedia email, belum ada), **webhook Telegram/Slack** (paling murah, satu env `MODERATION_WEBHOOK_URL`), atau hanya lencana jumlah laporan terbuka di halaman admin.
Laporan `sexual` yang menyebut anak, atau `illegal`, harus memicu pemberitahuan langsung. Tanpa pemberitahuan, laporan baru tidak akan dilihat tepat waktu.

## 4. Keamanan dan privasi (wajib)
- **Akses minimal:** hanya `wuzz_moderator`/`wuzz_admin`; peran diberikan lewat SQL oleh pemilik (`UPDATE users SET system_role='wuzz_moderator' WHERE username=...`) dan **dicatat**. Jangan membuat akun admin bawaan.
- **Isolasi tenant:** setiap kueri membawa `tenant_id` dari klaim; moderator satu tenant tidak melihat laporan tenant lain (pola yang sama dengan `ReportStore.List/SetStatus`). Uji lintas tenant.
- **Rate limit** per moderator (`api.UserRateLimitMsg`) dan **jejak audit** untuk setiap tindakan yang mengubah data.
- **Minimalkan data:** halaman hanya memuat yang diperlukan untuk memutuskan; jangan menampilkan alamat IP, token, kata sandi, atau kunci. `evidence` dari pelapor bisa memuat data pribadi: perlakukan sebagai data sensitif, batasi retensi (usulan: hapus `evidence` laporan yang sudah selesai setelah 90 hari, kecuali terkait kasus yang diteruskan ke pihak berwenang).
- **Penghapusan akun:** `account_eraser` tidak menghapus laporan (sengaja, untuk keamanan). Jika pelapor menghapus akun, `reporter_id` menjadi tombstone; laporan tetap valid. Dokumentasikan di `/privacy` bila retensi ini berubah.
- **Perbarui `/privacy`** dan `docs/PLAY_STORE_LISTING.md` (Data Safety) bila ada data baru (catatan moderasi, tanggal tangguhan).
- Kasus CSAM: **jangan** menyimpan salinan media di luar sistem; ikuti prosedur pelaporan ke pihak berwenang (lihat `/child-safety`); keputusan hukum di luar lingkup perangkat lunak.

## 5. Proses operasional (SOP) yang harus diputuskan pemilik
| Keputusan terbuka | Pilihan | Usulan awal |
|---|---|---|
| Siapa moderator pertama | pemilik sendiri, atau orang tepercaya | pemilik + satu cadangan |
| Target waktu tinjau | umum / keselamatan anak | umum <= 72 jam; `sexual`/`illegal`/anak: secepatnya, target <= 24 jam (selaras dengan janji di `/child-safety`) |
| Pelanggaran berat | tangguh permanen tanpa peringatan | ya, untuk CSAE; selain itu peringatan dulu |
| Banding | lewat email `SUPPORT_EMAIL`; belum ada UI | catat di `/terms` (sudah menyebut kontak banding) |
| Pemberitahuan laporan baru | email / webhook / lencana | webhook (paling murah) |
| Retensi `evidence` | 90 hari setelah selesai | sesuaikan dengan kebijakan hukum setempat |

## 6. Tahapan kerja yang disarankan
1. **P0 Backend (inti):** migrasi (`suspended_*`, `moderation_actions`), `IsStaff` bersama, endpoint admin (daftar, detail, aksi, unsuspend), pemeriksaan penangguhan di login/refresh/WS, transaksi aksi, tes (otorisasi, lintas tenant, rate limit, E2EE evidence-only, penangguhan mencabut token, aksi idempoten).
2. **P1 Frontend:** `/admin/reports` (daftar + filter + urutan prioritas), detail + tindakan + catatan, guard peran, `noindex`, pengecualian gate web, tes build.
3. **P2 Pemberitahuan:** webhook/email untuk laporan prioritas, ringkasan harian laporan terbuka.
4. **P3 Penyempurnaan:** kebijakan retensi `evidence` (pekerja pembersih), pencarian laporan per pengguna, opsi layar moderator di aplikasi bila dibutuhkan, UI banding.
Perkiraan: P0 sedang-besar (±1-2 hari kerja bersama tes), P1 sedang, P2 kecil, P3 bervariasi.

## 7. Kriteria penerimaan
- [ ] Moderator melihat daftar laporan terbuka, yang berisiko tinggi di atas, tanpa SQL.
- [ ] Detail memperlihatkan isi yang dilaporkan sesuai jenisnya; DM hanya menampilkan `evidence` dengan label yang jelas.
- [ ] Tindakan hapus/tangguhkan/tolak bekerja, menutup laporan, dan tercatat di `moderation_actions` (siapa, kapan, catatan).
- [ ] Akun yang ditangguhkan tidak bisa login atau memakai token lama, WebSocket-nya terputus, dan bisa dipulihkan (`unsuspend`).
- [ ] Pengguna non-moderator mendapat 403 di semua endpoint admin; moderator tenant lain tidak melihat data tenant ini (tes otomatis).
- [ ] Tidak ada data sensitif yang tampil berlebihan; semua teks pengguna aman dari XSS (tes render).
- [ ] `go test ./...`, `tsc`, `npm run test:unit` (mobile jika tersentuh), dan `npm run build` frontend lulus.
- [ ] `/privacy`, Data Safety, dan `docs/PLAY_STORE_LISTING.md` diperbarui bila ada data baru; SOP (bagian 5) disepakati dan dicatat.

## 8. Titik awal untuk pengerjaan
Mulai dari `backend/internal/api/report_handler.go` dan `backend/internal/store/report_store.go` (pola handler/store/test: `report_handler_test.go`), pola penangguhan token dari `store/account_eraser.go` dan `api/auth_handler.go` (`DeleteAccount`),
pola rate limit di `backend/internal/app/router.go`, dan pola halaman publik statis di `frontend/app/_legal/`. Dokumen terkait: `docs/PLAY_STORE_LISTING.md`, `docs/domains/AUTH_SESSION.md` (invarian 6), `docs/SECURITY_AND_PERFORMANCE.md`, `/child-safety` (`frontend/app/child-safety/page.tsx`).
