# AGENTS.md — Workspace Rules: wuzz-chat

## 🛑 Server Lifecycle Rule (MANDATORY)

**Setelah menjalankan server untuk keperluan testing/verifikasi, AI WAJIB mematikan server tersebut sebelum mengakhiri respons.**

### Aturan konkret:

1. **Setiap kali AI menjalankan server** (backend Go, frontend Next.js, atau proses apapun yang listen di port), wajib dicatat port yang digunakan.

2. **Setelah verifikasi selesai**, AI harus langsung kill port tersebut dengan:
   ```bash
   fuser -k <port>/tcp
   ```

3. **AI tidak boleh meninggalkan server berjalan** di background tanpa sepengetahuan user.

4. **User yang memutuskan kapan server dijalankan** — AI hanya boleh menjalankan server sementara untuk verifikasi cepat (misal: `curl` test), lalu segera matikan.

5. **Exceptions** — Server boleh dibiarkan jalan hanya jika user secara eksplisit meminta:
   - *"biarkan jalan"*
   - *"jangan dimatikan"*
   - *"keep running"*

### Contoh flow yang benar:

```
AI: [jalankan server di port 3000 untuk test]
AI: [curl test → OK]
AI: [kill port 3000]  ← WAJIB sebelum selesai respons
AI: "Selesai verifikasi. Silakan jalankan sendiri dengan: npm run dev"
```

---

## 📚 Tiered Documentation Synchronization Rule (MANDATORY)

**Pembaruan dokumentasi diatur berdasarkan skala perubahan secara bertingkat (Tiered), untuk menjaga akurasi tanpa memboroskan token context.**

### Aturan konkret & SOP Audit Dokumentasi:

1. **Tier 1: Targeted Documentation Sync (Default untuk Bug Fix / Micro-Task / Single Feature)**:
   - AI **HANYA** memeriksa dan memperbarui dokumen yang secara langsung berkaitan dengan kode yang diubah:
     - 🔌 **Perubahan REST API / WebSocket / E2EE / Wire Format** ➔ Update [`docs/BACKEND_API.md`](../docs/BACKEND_API.md) & log ringkas di [`docs/PROGRESS.md`](../docs/PROGRESS.md).
     - 🏛️ **Perubahan Schema Database / Entity / System Flow** ➔ Update [`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md).
     - 📱 **Perubahan WebRTC Signaling / Mobile Flow** ➔ Update [`docs/MOBILE_INTEGRATION_GUIDE.md`](../docs/MOBILE_INTEGRATION_GUIDE.md).
     - 🛡️ **Perubahan Security / Rate Limiting / Query Performance** ➔ Update [`docs/SECURITY_AND_PERFORMANCE.md`](../docs/SECURITY_AND_PERFORMANCE.md).
     - 📈 **Seluruh Task / Bug Fix / Refactor** ➔ Catat ringkasan pengerjaan di [`docs/PROGRESS.md`](../docs/PROGRESS.md).
   - **DILARANG** membaca atau mengedit dokumen lain yang tidak terdampak untuk menghemat token dan context window.

2. **Tier 2: Comprehensive All-Docs Audit (Khusus Akhir Milestone / Perintah Eksplisit)**:
   - Audit menyeluruh ke 8 dokumen (`README.md`, `BACKEND_API.md`, `ROADMAP.md`, `PROGRESS.md`, `ARCHITECTURE.md`, `SECURITY_AND_PERFORMANCE.md`, `MOBILE_INTEGRATION_GUIDE.md`, `PROMPT.md`) **HANYA** dijalankan jika:
     - Pengguna secara eksplisit meminta: *"audit semua docs"*, *"sinkronkan seluruh dokumentasi"*, atau *"full docs sync"*.
     - Penyelesaian sebuah Milestone / Fase besar (misal: penutupan Fase 4 atau Fase 5 di `ROADMAP.md`).
     - Rilis versi baru (*Production Release Tag*).

3. **Langkah Kerja Eksekusi SOP (*Step-by-Step Execution*)**:
   - **Langkah 1 (Klasifikasi Dampak)**: Identifikasi file mana saja dari kode yang berubah dan tentukan dokumen target (Tier 1).
   - **Langkah 2 (Targeted Range Inspection)**: Buka hanya section dokumen yang relevan menggunakan range reading (`StartLine`/`EndLine`).
   - **Langkah 3 (Sinkronisasi Konten)**: Perbarui informasi secara presisi dan konsisten.
   - **Langkah 4 (Laporan Ringkas)**: Cantumkan dokumen apa saja yang diperbarui dalam laporan akhir ke pengguna.

---

## 🧪 Mandatory Post-Task Automated Testing & Reporting Rule (No Live Browser Required) (MANDATORY)

**Setiap kali AI menyelesaikan pengerjaan suatu tugas/fitur/perbaikan kode, AI WAJIB SELALU melakukan testing otomatis terlebih dahulu, melaporkan hasil tugas beserta bukti hasil testingnya kepada pengguna, dan DILARANG melakukan commit sebelum pengguna menyatakan "selesai". Pastikan seluruh pekerjaan dilakukan di branch yang tepat dan TIDAK BOLEH bekerja di branch `main`.**

### Aturan konkret:

1. **Wajib Automated Testing Setiap Selesai Tugas**:
   - Setiap kali pengerjaan kode selesai, AI **WAJIB** mengeksekusi automated testing sebelum membuat laporan akhir ke pengguna:
     - **Frontend**: Jalankan `npm run build` di direktori `frontend/` (memastikan lolos kompilasi Next.js/Turbopack dan 0 error TypeScript/lint).
     - **Backend**: Jalankan `go test -v ./...` di direktori `backend/` (memastikan seluruh unit & integration test lolos 100%).
   - Jika terdapat error kompilasi, tipe data, atau test gagal, AI wajib mendiagnosis dan memperbaikinya terlebih dahulu sebelum melaporkan ke pengguna.

2. **Tidak Perlu Live Browser Testing**:
   - AI **TIDAK PERLU** menjalankan browser interaktif (browser subagent / headless Chromium / browser session) untuk pengujian UI, kecuali jika pengguna secara eksplisit meminta live test.
   - Cukup buktikan kebenaran implementasi melalui automated build, typecheck gate, serta automated test suite.

3. **Wajib Laporkan Hasil Tugas Beserta Hasil Testing**:
   - AI wajib menyajikan laporan ringkas dan terstruktur kepada pengguna yang memuat:
     - **Rincian Perubahan**: Apa saja yang telah diubah/ditambahkan pada kode.
     - **Bukti Hasil Testing**: Status dan bukti kelulusan `npm run build` dan `go test -v ./...`.
     - **Pertanyaan Konfirmasi**: Menanyakan apakah tugas sudah sesuai dan dianggap selesai oleh pengguna.

4. **Gerbang Audit Dokumentasi Sebelum Commit**:
   - Setelah pengguna menyatakan **"selesai"**, AI **WAJIB terlebih dahulu melakukan audit dan memperbarui dokumentasi proyek jika diperlukan** (README, API spec, architecture, roadmap, progress, security, mobile guide, prompt) agar selalu sinkron dengan kondisi kode terkini.
   - **DILARANG commit sebelum dokumentasi dipastikan mutakhir**.

5. **Proteksi Branch `main` (Strict Dev-Only Work)**:
   - AI **DILARANG KERAS** bekerja, mengedit file, menjalankan tugas, atau melakukan commit di branch `main`.
   - Seluruh pekerjaan wajib dilakukan di branch `dev` atau feature branch. Jika branch aktif terdeteksi `main`, AI wajib segera beralih ke `dev` sebelum menyentuh kode apapun.

---

## 🔒 Mandatory Git Commit Approval & Post-Commit Promotion Confirmation Rule (MANDATORY)

**AI DILARANG KERAS melakukan `git commit` tanpa persetujuan eksplisit ("selesai"), dan WAJIB mengonfirmasi pilihan promosi merge/push segera setelah commit selesai.**

### Aturan konkret:

1. **Konfirmasi Sebelum Commit**: Setiap kali sebuah task/tugas dalam 1 sesi selesai dikerjakan dan diverifikasi, AI **TIDAK BOLEH** langsung melakukan `git commit`. AI wajib mengonfirmasi ke user terlebih dahulu:
   - Menjelaskan apa yang telah diubah/diperbaiki.
   - Menunjukkan bukti hasil testing otomatis.
   - Menanyakan apakah hasilnya sudah sesuai dengan harapan user.

2. **Urutan Eksekusi Setelah User Menyatakan "Selesai"**:
   - **Langkah 1 (Audit & Update Dokumentasi)**: Cek seluruh dokumentasi terkait dan lakukan pembaruan agar 100% mutakhir dengan perubahan kode terbaru.
   - **Langkah 2 (Pengarsipan Rencana)**: Arsipkan file `docs/plans/active/` ke `docs/plans/archived/` dan reset active plan ke standby.
   - **Langkah 3 (Eksekusi Commit)**: Lakukan `git add -A && git commit -m "..."` di branch `dev`.

3. **Wajib Konfirmasi Promosi Pasca-Commit (Merge / Push Gate)**:
   - Tepat setelah commit di branch `dev` berhasil dilakukan, AI **WAJIB menawarkan dan meminta konfirmasi tindakan lanjutan kepada pengguna**:
     - **Opsi A**: Merge ke branch `main` dan langsung push ke GitHub (`git push origin main`).
     - **Opsi B**: Hanya merge ke branch `main` saja secara lokal (tanpa push ke remote).
     - **Opsi C**: Tetap di branch `dev` saja (tidak melakukan merge atau push saat ini).
   - AI **DILARANG** melakukan merge ke `main` atau menjalankan `git push` tanpa instruksi/pilihan eksplisit yang dipilih pengguna.

---

## 📱💻 Mandatory Dual-Platform Frontend Architecture Rule (Mobile & Desktop) (MANDATORY)

**Setiap modifikasi frontend (CSS, komponen React, state management, routing, atau event handling) WAJIB mempertimbangkan dan menguji kompatibilitas untuk KEDUA platform: Mobile (Handphone) dan Desktop (Laptop/PC). Dilarang hanya mempertimbangkan salah satunya.**

### Aturan konkret:

1. **Perbedaan Pola Arsitektur Layout yang Wajib Diakomodasi**:
   - **Desktop / Laptop (Split 2-Column Mode)**:
     - Sidebar (daftar chat) dan Chat Main Pane (ruang obrolan) aktif berdampingan di satu layar.
     - Event chat masuk langsung ter-append secara live ke timeline chat aktif via `ADD_MESSAGE`.
   - **Mobile / Handphone (WhatsApp Single-Screen Flow)**:
     - Layar bergantian penuh: **Layar 1 (Daftar Chat Fullscreen)** ⇄ **Layar 2 (Ruang Obrolan Fullscreen)**.
     - Transisi antar layar menggunakan tombol `← Back` (`activeRoomId = ''`).

2. **Kaidah Penanganan State & Lifecycle pada Mobile Transitions**:
   - **Anti-Stale Reprocessing**: Event listener atau `useEffect` yang memantau pesan masuk **DILARANG** memproses ulang pesan lama saat `activeRoomId` berganti (misal saat user menekan tombol `← Back` di HP). Gunakan guard ref (`lastHandledMsgIdRef`).
   - **Clean History State Sync**: Saat berpindah dari Home HP ke ruang obrolan, state timeline pesan (`state.messages`) harus di-reset bersih dan diisi utuh dari riwayat server (`SET_MESSAGES`), bukan digabungkan secara acak di depan state lama.
   - **Optimistic Unread Reset & Receipt Sync**: Begitu room dibuka di HP, unread badge harus langsung 0ms ter-reset, dan saat kembali ke Home (`onBack`), status tanda terima (`✓` / `✓✓`) harus 100% sinkron.

3. **Standar Viewport & Responsivitas Mobile**:
   - **Dynamic Viewport Height**: Wajib menggunakan `100dvh` (fallback `100%`) dan `overflow: hidden` pada kontainer root untuk mencegah layout terpotong oleh address bar dynamic browser HP (Chrome/Safari Android/iOS).
   - **Safe Area Inset**: Wajib menyertakan `padding-bottom: max(..., env(safe-area-inset-bottom, 0px))` pada bottom navigation, FAB, dan chat input area.
   - **Sticky Header**: Header (`.status-bar`, `.sidebar-header`) wajib dikunci dengan `position: sticky; top: 0; z-index: 50; flex-shrink: 0;`.

4. **Standar Penanganan Virtual Keyboard & Isolasi Header (Android 11–16+ & iOS)**:
   - **Header Layar Wajib di Luar KAV**: Komponen header (beserta safe area inset top) **DILARANG KERAS** dimasukkan ke dalam `KeyboardAvoidingView`. KAV hanya boleh membungkus area konten dinamis/scrollable (`FlatList`/`ScrollView`) dan input bar. Hal ini mutlak untuk mencegah header terdorong naik ke atas dan hilang dari layar saat keyboard muncul pada Android versi lama (Android 11/12).
   - **KAV pada Modal Dialog & Bottom Sheet Wajib `behavior='height'`**: Komponen `<Modal>` React Native berjalan pada sub-window native tersendiri. Pada Android 16+ (API 35+ edge-to-edge), KAV di dalam Modal **WAJIB** menggunakan `behavior={Platform.OS === 'ios' ? 'padding' : 'height'}`. **DILARANG** menggunakan `undefined` untuk Android di dalam Modal karena akan membuat input form tertutup total oleh keyboard.
   - **Kunci `windowSoftInputMode="adjustResize"`**: Pada `AndroidManifest.xml` (`MainActivity`) dan `app.json`, wajib dikunci ke `adjustResize` / `"softwareKeyboardLayoutMode": "resize"`. **DILARANG** menggunakan `adjustPan`.

5. **Standar Baku Kontras Warna Teks & Tombol (Anti Same-Color Contrast Bug)**:
   - **DILARANG KERAS Teks Sama Warna dengan Tombol**: Seluruh teks tombol wajib memenuhi standar rasio kontras WCAG 2.1 AA (kontras minimal 4.5:1 untuk teks biasa dan 3:1 untuk tombol tebal/bold).
   - **Tombol Sekunder / Berlatar Terang**: Seluruh tombol dengan `variant="secondary"` atau berlatar putih/terang (`colors.bgSurface`, `colors.bgCard`, `colors.bgElevated`) **WAJIB MENGGUNAKAN TEKS GELAP** `colors.textPrimary` (`#0f172a`) atau `colors.textSecondary` (`#64748b`). **DILARANG KERAS** menggunakan `colors.textOnAccent` (putih) di atas tombol terang.
   - **Indikator Spinner Loading**: Tombol terang/sekunder saat `isLoading={true}` wajib menggunakan spinner berwarna kontras (`colors.accentPrimary`), bukan putih.
   - **Latar Belakang Loading Primer**: Saat tombol primer dalam keadaan loading, latar belakangnya **DILARANG** berubah menjadi putih/pucat yang menyamarkan spinner putih.

6. **Standar Baku Bottom Sheet Modal (Flush Bottom & Edge-to-Edge Alignment)**:
   - **Mepet Bawah Tanpa Celah (*Flush Bottom*)**: Modal bertipe bottom sheet (`EditProfileModal`, `CreatePostModal`, `PostCommentsModal`, `CreateSubGroupModal`, `BottomSheetModal`) **WAJIB MENEMPEL RAPAT DI DASAR LAYAR HP (`bottom: 0`)**. **DILARANG KERAS** membiarkan kartu modal melayang (*floating*) atau menyisakan celah/gap gelap di atas bottom tab bar navigasi.
   - **Wajib `statusBarTranslucent={true}`**: Komponen `<Modal>` pada React Native Android **WAJIB** menyertakan `statusBarTranslucent={true}` agar sub-window modal merender penuh *edge-to-edge* melewati window insets sistem.
   - **Hirarki Kontainer KAV**: `KeyboardAvoidingView` **WAJIB** menjadi container overlay terluar dengan `style={{ flex: 1, justifyContent: 'flex-end' }}` didampingi `TouchableOpacity`/`Pressable` backdrop ber-style `StyleSheet.absoluteFill`.
   - **Safe-Area Bottom Clearance**: Kontainer kartu modal (`styles.card`) **WAJIB** memiliki bantalan bawah dinamis: `paddingBottom: Math.max(insets.bottom, spacing.lg)` agar tombol aksi berada aman di atas gesture navigation bar Android / home indicator iOS tanpa terpotong, namun latar kartu tetap menempel sempurna ke dasar layar.
   - **Scrollable Form Dinamis**: Komponen ScrollView di dalam modal bottom sheet **WAJIB** menggunakan `flexShrink: 1` dengan `showsVerticalScrollIndicator={false}`. **DILARANG** menggunakan fixed `maxHeight` kaku yang memotong konten.

7. **Definition of Done (DoD) untuk Setiap Perubahan Frontend & Mobile**:
   Setiap perubahan frontend & mobile **TIDAK BOLEH** dinyatakan selesai sebelum lolos verifikasi mental/smoke test pada skenario berikut:
   1. ✅ **Desktop Flow**: Buka chat di laptop, kirim/terima pesan, pastikan 2 kolom tetap sinkron.
   2. ✅ **Mobile Flow 1 (Home Incoming)**: Terima pesan saat di Home HP ➔ Unread badge muncul di list dan bottom nav ➔ Klik chat ➔ Pesan terbaru langsung tampil di bawah ➔ Klik `← Back` ➔ Unread badge hilang sempurna dan centang biru tersinkronisasi.
   3. ✅ **Mobile Flow 2 (Active Room Incoming)**: Terima pesan saat berada di dalam room di HP ➔ Pesan muncul seketika di timeline.
   4. ✅ **Mobile Flow 3 (Keyboard & Header Stability)**: Buka chat di HP (Android 11 maupun Android 16), fokus ke input keyboard ➔ Header chat tetap diam di tempatnya (tidak terdorong hilang), linimasa pesan dan input bar naik tepat di atas keyboard.
   5. ✅ **Mobile Flow 4 (Modal Form Keyboard Clearance)**: Buka modal dialog/bottom sheet ber-input (misal buat postingan, komentar, buat sub-group) ➔ Fokus ke input ➔ Seluruh form dan tombol submit naik secara mulus di atas keyboard tanpa terpotong di Android 11 maupun Android 16+.
   6. ✅ **Mobile Flow 5 (Bottom Sheet Flush & Button Contrast Clarity)**: Buka modal bottom sheet (Edit Profil, Create Post, dsb.) ➔ Kartu menempel rapat di batas paling bawah layar tanpa gap/celah hitam, tombol aksi memiliki safe-area clearance di atas gesture bar, dan seluruh tombol (primer, sekunder, bahaya) memiliki teks dengan kontras tajam yang 100% terbaca.

---

## 🌿 Strict Branching Strategy & Promotion Lifecycle Rule (MANDATORY)

**DILARANG KERAS melakukan perubahan, modifikasi kode, atau mengerjakan tugas langsung di branch `main`.**

### Alur Kerja Branching (SOP):

1. **Aturan Larangan Branch `main`**:
   - Branch `main` adalah branch produksi murni (*production release branch*).
   - Setiap kali memulai tugas baru, perbaikan bug, atau penambahan fitur, AI **WAJIB memastikan branch aktif BUKAN `main`**. Pekerjaan wajib dilakukan di:
     - Branch `dev` (untuk pengembangan reguler), ATAU
     - Feature branch baru yang dibuat dari `dev` (misal: `feature/webrtc-calling`, `fix/cors-origin`).

2. **Proses Penggabungan Bertingkat (Gradual Promotion Flow)**:
   - **Tahap 1 (Feature ➔ `dev`)**: Jika bekerja di feature branch, setelah tugas selesai dan diverifikasi, lakukan merge ke branch `dev`.
   - **Tahap 2 (Verifikasi di `dev`)**: Pastikan seluruh test (`go test ./...` & `npm run build`) lulus 100% dan kondisi branch `dev` stabil.
   - **Tahap 3 (`dev` ➔ `main`)**: Hanya setelah branch `dev` dinyatakan aman, stabil, dan atas persetujuan user, lakukan merge dari `dev` ke `main` sebagai persiapan rilis.
   - **Tahap 4 (`main` ➔ GitHub Remote)**: Eksekusi `git push origin main` hanya dilakukan setelah `main` siap dan terdapat instruksi/persetujuan tertulis eksplisit dari pengguna.

3. **Guards & Verification**:
   - Jika AI mendeteksi branch aktif adalah `main` saat pengguna memberikan instruksi pengerjaan fitur/perbaikan kode, AI **WAJIB STOP**, memperingatkan bahwa branch `main` terproteksi, dan beralih ke branch `dev` atau feature branch sebelum menyentuh file kode apapun.

---

## 🏷️ Mandatory Conventional Commits & Semantic Versioning Rule (MANDATORY)

**AI dan Developer WAJIB SELALU menggunakan format pesan Git Commit berstandar Conventional Commits. Format ini secara otomatis dianalisis oleh `smart-bump.js` saat build rilis aplikasi (`./gradlew assembleRelease`) untuk menentukan kenaikan versi (Major, Minor, Patch, Build).**

### Aturan Konkret & Pola Format:
Format standar: `<type>(<optional scope>): <description>`

1. **`feat` ➔ Memicu Kenaikan MINOR Version (`1.0.0` ➔ `1.1.0`, build +1)**:
   - Digunakan saat menambahkan fitur fungsionalitas baru ke aplikasi atau backend.
   - Contoh:
     - `feat(mobile): tambah panggilan suara webrtc`
     - `feat(backend): implementasi endpoint search kontak`
     - `feat: dukung integrasi groq memory worker`

2. **`fix` / `perf` / `refactor` / `style` ➔ Memicu Kenaikan PATCH Version (`1.0.0` ➔ `1.0.1`, build +1)**:
   - `fix`: Perbaikan bug atau penanganan error.
   - `perf`: Peningkatan performa / efisiensi kueri / memori.
   - `refactor`: Perapihan kode tanpa mengubah fungsionalitas.
   - `style`: Penyesuaian kosmetik UI/CSS.
   - Contoh:
     - `fix(mobile): cegah keyboard menutupi modal bottom sheet`
     - `fix(backend): atasi race condition duplicate answer`
     - `perf: optimasi cursor pagination query`

3. **`BREAKING CHANGE:` atau `!:` ➔ Memicu Kenaikan MAJOR Version (`1.x.x` ➔ `2.0.0`, build +1)**:
   - Digunakan jika terjadi perubahan yang merusak kompatibilitas lama (breaking API, perubahan skema database besar, perombakan protokol enkripsi E2EE, atau full redesign).
   - Contoh:
     - `feat(auth)!: rombak total sistem autentikasi ke passkeys`
     - `fix(e2ee)!: upgrade protokol e2ee ke double ratchet v2`
     - Atau menyertakan footer `BREAKING CHANGE: skema api lama /api/v1 dinonaktifkan.`

4. **`chore` / `docs` / `test` ➔ HANYA Memicu Kenaikan BUILD Number (`versionCode + 1`, versi tetap)**:
   - Digunakan untuk pembaruan dokumentasi, penambahan unit test, update dependencies, atau task pemeliharaan tanpa perubahan fungsional ke end-user.
   - Contoh:
     - `docs: perbarui panduan mobile integration`
     - `test: tambah e2e race condition calling test`
     - `chore: update gradle wrapper dependencies`

5. **Dilarang Format Sembarangan**:
   - Dilarang membuat commit dengan pesan generik seperti `update`, `fix`, `wip`, `commit changes`. Seluruh commit wajib menggunakan awalan tipe yang valid.

---

## ☁️ Mandatory Backend Change Notification & VPS Deployment Warning Rule (MANDATORY)

**Setiap kali ada perubahan, perbaikan bug, atau penambahan fitur di direktori `backend/`, AI WAJIB memberikan konfirmasi dan peringatan eksplisit kepada pengguna bahwa server backend di VPS perlu di-deploy ulang.**

### Aturan konkret:

1. **Peringatan Desinkronisasi Backend vs Live Production VPS**:
   - Frontend produksi (`https://chat.wuzzhub.id` dan `https://wuzz-chat.vercel.app`) serta mobile app terhubung ke live backend di VPS (`<VPS_IP>`).
   - Jika kode backend diubah namun server VPS belum di-deploy ulang, klien akan tetap berkomunikasi dengan binary backend lama, yang berpotensi menimbulkan *mismatch* protokol WebSocket, query error, atau timeout sinkronisasi.

2. **Kewajiban AI saat Menyelesaikan Tugas Backend**:
   - Di setiap akhir penjelasan/respons yang melibatkan perubahan kode backend Go:
     - AI **WAJIB** menyertakan kotak peringatan / instruksi deployment ke VPS:
       > ⚠️ **Pemberitahuan Deployment Backend (VPS)**: Terdapat perubahan pada kode backend (`backend/internal/...`). Agar perubahan ini aktif di server live production, silakan jalankan deployment ke VPS:
       > ```bash
       > ssh deploy@<VPS_IP> ./deploy-chat.sh
       > ```
     - AI **WAJIB** menanyakan konfirmasi kepada user apakah ingin langsung dideploy ke VPS.

3. **Prosedur Deploy Backend & Larangan Inisiatif Mandiri**:
   - Skrip deployment dapat dijalankan langsung dari laptop lokal menggunakan SSH: `ssh deploy@<VPS_IP> ./deploy-chat.sh`.
   - **DILARANG KERAS menjalankan perintah deployment secara inisiatif mandiri tanpa izin tertulis dari pengguna**.
   - AI **WAJIB SELALU meminta konfirmasi terlebih dahulu** di akhir respons dan HANYA boleh mengeksekusi script SSH ke VPS jika pengguna secara eksplisit memberikan izin (misal: *"ya deploy"*, *"jalankan deploy"*).

---

## 🐢 Mandatory Slow & Flaky Server Resilience Rule (MANDATORY)

**AI WAJIB SELALU BEKERJA DENGAN ASUMSI BAHWA SERVER DALAM KONDISI LAMBAT (MEDIUM-SLOW RESPONSE, LATENSI 200–800ms+), SERING MENGALAMI DISCONNECT / KONEKSI TERPUTUS, ATAU MENGALAMI TIMEOUT. DILARANG MENGANGGAP SERVER BEKERJA DALAM KONDISI IDEAL ATAU INSTAN.**

### Aturan konkret & SOP Antisipasi Kegagalan Jaringan/Server:

1. **Prinsip Anti-Race State Gatekeeping**:
   - Dilarang hanya mengandalkan urutan waktu (*timing*) penutupan soket TCP untuk mencegah konflik sesi.
   - Kebenaran data wajib dikunci di level handshake protokol backend (misal: validasi `device_id` vs `active_device_id` di database pada HTTP Upgrade Handshake). Jika perangkat usang mencoba konek kembali karena timeout soket lama, server wajib langsung menolak di gerbang HTTP (Status 403) sebelum upgrade soket diizinkan.

2. **Jeda Grace Period & Batas Waktu Transmisi Longgar**:
   - Dalam setiap operasi pemutusan atau penggantian sesi secara asinkron (misal: event `SESSION_REPLACED`), backend **WAJIB memberikan jeda flush minimal 500ms** dan batas waktu penulisan (*write deadline*) WebSocket Control Frame minimal 1000ms.
   - Hal ini memastikan frame notifikasi dan Close Code (misal Code `4001`) benar-benar terkirim tuntas melewati buffer jaringan seluler / jitter sebelum proses `conn.Close()` dieksekusi.

3. **Optimistic Local UI & Write-Through Offline Cache**:
   - Frontend **DILARANG membuat pengguna menunggu respons server** untuk tindakan interaktif seperti mengirim pesan, memperbarui linimasa chat, atau membaca riwayat yang sudah pernah diunduh.
   - Terapkan pola **Optimistic UI + Write-Through Cache** (IndexedDB): pesan baru langsung dirender ke layar dan disimpan ke penyimpanan lokal terlebih dahulu, lalu dikirim ke server di background.

4. **Batas Waktu Terkelola (*Explicit Abort Timeout*) pada Seluruh Request REST**:
   - Seluruh pemanggilan `fetch` atau REST API di frontend **WAJIB dibungkus dengan `AbortController`**:
     - Maksimal **15 detik** untuk request data / query umum.
     - Maksimal **60 detik** untuk upload file / media besar.
   - Jika waktu habis, aplikasi dilarang menggantung (*freeze*) dan harus menampilkan pesan penanganan timeout yang ramah kepada pengguna (`status 408` / pesan jaringan tidak stabil).

5. **Proteksi Reconnect Exponential Backoff & Terminal Code**:
   - Klien WebSocket wajib menerapkan exponential backoff bertingkat (1s, 2s, 4s, 8s, ... hingga 30s) dengan batas maksimal percobaan (misal 5 kali) untuk mencegah badai koneksi (*thundering herd*) saat server sedang kelebihan beban atau pulih dari gangguan.
   - Jika koneksi ditutup dengan Close Code terminal (seperti Code `4001: SESSION_REPLACED`), klien **WAJIB langsung menghentikan loop reconnect permanen** (`this.destroyed = true`).

6. **Proteksi Double-Action & Loading State Guard**:
   - Setiap tombol aksi kritis (Login, Register, Reset Kunci, Transfer Perangkat QR, Kirim Berkas) wajib langsung masuk ke state `disabled` / menampilkan spinner loading seketika saat diklik untuk mencegah duplikasi request (*double-click race condition*) ketika server lambat merespons.

---

## 🎨 Mandatory Frontend Design System & Token Compliance Rule (MANDATORY)

**Setiap perubahan atau pembuatan UI/UX di frontend (komponen React, styling CSS, modal, drawer, typography, warna, dan layout) WAJIB mengikuti Design System yang telah distandarisasi di [`frontend/DESIGN.md`](../frontend/DESIGN.md) dan token CSS di [`frontend/app/globals.css`](../frontend/app/globals.css). DILARANG KERAS menggunakan nilai sembarangan (magic numbers) atau raw values.**

### Aturan konkret & SOP Design System:

1. **Token-First Principle (Warna, Spacing, Radius, Shadow, Transition)**:
   - Seluruh warna, background, border, dan teks **WAJIB** menggunakan CSS variables (`var(--token)`) dari blok `:root` di `frontend/app/globals.css`.
   - **DILARANG raw hex code** di dalam file CSS maupun inline style (kecuali daftar pengecualian sah: `avatarColor.ts`, `MessageBubble.tsx:SENDER_COLORS`, SVG `stopColor`, QR code options, dan `app/layout.tsx:themeColor`).
   - Gunakan token tint resmi (misal: `var(--tint-accent-10)`, `var(--tint-error-10)`) dan **DILARANG** menuliskan literal `rgba(59,130,246,...)` atau `rgba(239,68,68,...)` di kode fitur.

2. **Skala Z-Index Terpadu (Anti Magic Number `99999`)**:
   - **DILARANG KERAS** menggunakan angka z-index sembarangan atau ekstrim seperti `99999`, `1100`, `1200`.
   - Wajib gunakan token z-index resmi atau utility class:
     - `var(--z-base)` (0), `var(--z-elevated)` (10), `var(--z-dropdown)` (100)
     - `var(--z-sticky)` (200), `var(--z-banner)` (300)
     - `var(--z-modal)` (1000) / `.z-modal`
     - `var(--z-modal-top)` (1100) / `.z-modal-top`
     - `var(--z-toast)` (2000) / `.z-toast`

3. **Unified Modal & Dialog Primitives**:
   - Setiap kali membuat modal, dialog, atau drawer baru, **WAJIB** menggunakan utility primitives terpadu:
     - Backdrop / Overlay: `.modal-overlay`
     - Container Card: `.modal-card-unified`
     - Header / Title: `.modal-header-unified` / `.modal-title-unified`
     - Body / Content: `.modal-body-unified`
     - Footer / Actions: `.modal-footer-unified`
   - **DILARANG** mendefinisikan class overlay/backdrop kustom baru atau menduplikasi styling modal.

4. **Utility CSS First & Dynamic-Only Inline Styles**:
   - Manfaatkan utility class yang sudah tersedia di `globals.css` (misal: `.u-flex`, `.u-flex-col`, `.u-gap-*`, `.u-text-*`, `.u-fw-*`, `.btn-ghost`).
   - `style={{ ... }}` pada JSX hanya diizinkan untuk nilai yang benar-benar **dihitung secara dinamis saat runtime** (misal: lebar persentase progress bar, koordinat drag/touch, warna avatar dinamis). Nilai statis wajib masuk ke class CSS.

5. **Kamus Single Source of Truth**:
   - Sebelum menambahkan styling atau token baru, AI **WAJIB membaca [`frontend/DESIGN.md`](../frontend/DESIGN.md)**.
   - Jika membutuhkan token baru, daftarkan token tersebut di `:root` `frontend/app/globals.css` dan perbarui dokumentasi `frontend/DESIGN.md`.

---

## ⚡ Token Efficiency & Context Window Optimization Rule (MANDATORY)

**AI WAJIB menerapkan prinsip efisiensi token dan optimalisasi context window pada setiap operasi baca-tulis file dan perintah terminal.**

### Aturan konkret:

1. **Grep-First & Line-Range File Reading**:
   - **DILARANG KERAS** membaca file besar (> 100 baris) secara utuh jika hanya mencari fungsi, variabel, atau section tertentu.
   - AI **WAJIB** menggunakan `grep_search` terlebih dahulu untuk menemukan lokasi baris yang dicari.
   - Gunakan `view_file` dengan parameter `StartLine` dan `EndLine` (target 50–150 baris di sekitar target kode).

2. **Diff-Chunk File Editing**:
   - Gunakan `replace_file_content` atau `multi_replace_file_content` dengan range baris yang presisi.
   - **DILARANG** menulis ulang atau meng-overwrite seluruh isi file (`write_to_file`) jika hanya mengubah beberapa baris.

3. **Terminal Output & Log Filtering**:
   - Batasi output terminal yang panjang (gunakan `git log -n 5`, `head -n 20`, atau grep filter).
   - Jangan melakukan dump log error yang masif ke context; ambil hanya stack trace yang relevan.







