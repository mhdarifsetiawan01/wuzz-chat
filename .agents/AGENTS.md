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

## 📚 Continuous & Holistic Documentation Synchronization Rule (MANDATORY)

**Jika pengguna meminta "update dokumentasi" / "sinkronkan docs", atau setiap kali ada penambahan fitur/perubahan skema/refactoring sekecil apapun, AI WAJIB melakukan audit menyeluruh (360-Degree Check) dan memperbarui SELURUH dokumen proyek tanpa ada yang terlewat.**

### Aturan konkret & SOP Audit Dokumentasi:

1. **Prinsip Audit Menyeluruh (*All-Docs Checklist*)**:
   Ketika instruksi pembaruan dokumentasi diterima, AI **DILARANG HANYA MENGUBAH 1 ATAU 2 FILE**. AI wajib memeriksa dan menyinkronkan seluruh daftar dokumen berikut:
   - 📄 **[`README.md`](../README.md)**: Ringkasan proyek, daftar centang fitur selesai, struktur monorepo, tech stack, dan panduan menjalankan aplikasi.
   - 🗺️ **[`docs/ROADMAP.md`](../docs/ROADMAP.md)**: Status milestone jangka panjang dari Fase 1 s/d Fase 7 (Tandai yang selesai vs pending).
   - 📈 **[`docs/PROGRESS.md`](../docs/PROGRESS.md)**: Riwayat pengerjaan detail, catatan teknis implementasi, dan handover status per milestone.
   - 🏛️ **[`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md)**: Diagram ERD database, skema tabel relasional, kamus endpoint REST API, alur WebSocket, dan media lifecycle.
   - 🛡️ **[`docs/SECURITY_AND_PERFORMANCE.md`](../docs/SECURITY_AND_PERFORMANCE.md)**: Proteksi BOLA/IDOR, Anti-SSRF Socket IP Pinning, $O(1)$ batch CTE query, indeks database, mitigasi concurrency SQLite, dan matriks E2E.
   - 📱 **[`docs/MOBILE_INTEGRATION_GUIDE.md`](../docs/MOBILE_INTEGRATION_GUIDE.md)**: Kamus event WebSocket klien mobile, skema signaling WebRTC (`call_offer`, `call_answer`), STUN/TURN, standar E2EE, dan media Store-and-Forward ACK.
   - 🤖 **[`PROMPT.md`](../PROMPT.md)**: Context primer sesi AI, single source of truth links, tech stack notes, live endpoints, dan status fase terkini.

2. **Langkah Kerja Eksekusi SOP (*Step-by-Step Execution*)**:
   - **Langkah 1 (Analisis Diff & Fitur Baru)**: Identifikasi seluruh perubahan kode, endpoint baru, event WebSocket baru, atau perbaikan performa/keamanan dari commit/perubahan terkini.
   - **Langkah 2 (Multi-File Inspection)**: Buka setiap file dokumentasi di atas untuk memeriksa apakah ada deskripsi yang sudah usang (*outdated*) atau belum sinkron.
   - **Langkah 3 (Sinkronisasi Konten)**: Perbarui informasi di setiap file secara presisi dan konsisten.
   - **Langkah 4 (Laporan Matriks Sinkronisasi)**: Sajikan laporan ringkas berupa tabel status sinkronisasi seluruh dokumen kepada pengguna.

3. **Definition of Done (DoD) Gate**:
   - Tugas pengerjaan fitur maupun permintaan dokumentasi **TIDAK DIANGGAP SELESAI** jika salah satu dokumen di atas tertinggal atau berstatus usang.

---

## 🔒 Mandatory Git Commit Approval & Session Confirmation Rule (MANDATORY)

**AI DILARANG KERAS melakukan `git commit` tanpa persetujuan / konfirmasi eksplisit dari pengguna.**

### Aturan konkret:

1. **Konfirmasi Sebelum Commit**: Setiap kali sebuah task/tugas dalam 1 sesi selesai dikerjakan dan diverifikasi, AI **TIDAK BOLEH** langsung melakukan `git commit`. AI wajib mengonfirmasi ke user terlebih dahulu:
   - Menjelaskan apa yang telah diubah/diperbaiki.
   - Menanyakan apakah hasilnya sudah sesuai dengan harapan user.

2. **Kondisi Persetujuan ("Selesai")**:
   - AI **HANYA BOLEH** mengeksekusi `git commit` jika user telah secara eksplisit menyatakan selesai (misal: *"selesai"*, *"ya commit"*, *"oke commit"*).

3. **Kondisi Belum Selesai / Iterasi Lanjutan**:
   - Jika hasil belum sesuai atau user meminta revisi, lanjutkan perbaikan di branch `dev` tanpa melakukan commit sampai tugas diverifikasi tuntas.

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

4. **Definition of Done (DoD) untuk Setiap Perubahan Frontend**:
   Setiap perubahan frontend **TIDAK BOLEH** dinyatakan selesai sebelum lolos verifikasi mental/smoke test pada skenario berikut:
   1. ✅ **Desktop Flow**: Buka chat di laptop, kirim/terima pesan, pastikan 2 kolom tetap sinkron.
   2. ✅ **Mobile Flow 1 (Home Incoming)**: Terima pesan saat di Home HP ➔ Unread badge muncul di list dan bottom nav ➔ Klik chat ➔ Pesan terbaru langsung tampil di bawah ➔ Klik `← Back` ➔ Unread badge hilang sempurna dan centang biru tersinkronisasi.
   3. ✅ **Mobile Flow 2 (Active Room Incoming)**: Terima pesan saat berada di dalam room di HP ➔ Pesan muncul seketika di timeline.

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

## ☁️ Mandatory Backend Change Notification & Fly.io Deployment Warning Rule (MANDATORY)

**Setiap kali ada perubahan, perbaikan bug, atau penambahan fitur di direktori `backend/`, AI WAJIB memberikan konfirmasi dan peringatan eksplisit kepada pengguna bahwa server backend (Fly.io) perlu di-deploy ulang.**

### Aturan konkret:

1. **Peringatan Desinkronisasi Backend vs Live Production**:
   - Frontend produksi (`https://chat.wuzzhub.id` dan `https://wuzz-chat.vercel.app`) terhubung langsung ke live backend di Fly.io (`https://wuzz-chat-backend.fly.dev` dan `wss://wuzz-chat-backend.fly.dev/ws`).
   - Jika kode backend diubah namun Fly.io belum di-deploy ulang, frontend produksi akan tetap berkomunikasi dengan binary backend lama, yang berpotensi menimbulkan *mismatch* protokol WebSocket, query error, atau timeout sinkronisasi.

2. **Kewajiban AI saat Menyelesaikan Tugas Backend**:
   - Di setiap akhir penjelasan/respons yang melibatkan perubahan kode backend Go:
     - AI **WAJIB** menyertakan kotak peringatan / catatan:
       > ⚠️ **Pemberitahuan Deployment Backend**: Terdapat perubahan pada kode backend (`backend/internal/...`). Agar perubahan ini aktif di server live production (`chat.wuzzhub.id`), backend di Fly.io wajib di-deploy ulang menggunakan perintah `fly deploy --remote-only`.
     - AI **WAJIB** menanyakan konfirmasi kepada user apakah ingin langsung dideploy ke Fly.io.

3. **Prosedur Deploy Backend**:
   - AI hanya boleh menjalankan `fly deploy` jika user telah memberikan persetujuan/instruksi eksplisit (misal: *"ya deploy"*, *"deploy ke fly.io"*).
   - Selalu lakukan health check `curl -sI https://wuzz-chat-backend.fly.dev/health` setelah deploy untuk memastikan status HTTP 200 OK.




