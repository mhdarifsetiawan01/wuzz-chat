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

## 📚 Continuous Documentation Synchronization Rule (MANDATORY)

**Setiap ada perubahan kode, penambahan fitur, endpoint baru, atau perubahan skema sekecil apapun, AI WAJIB memperbarui dokumentasi terkait sebelum tugas dinyatakan selesai.**

### Aturan konkret:

1. **Mapping Perubahan ke Dokumen:**
   - **Fitur Baru / Milestone Selesai** ➔ Update [`docs/PROGRESS.md`](../docs/PROGRESS.md) & [`docs/ROADMAP.md`](../docs/ROADMAP.md).
   - **Perubahan Database, REST API, atau Format WebSocket** ➔ Update [`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md).
   - **Perubahan Konfigurasi, Environment, atau Cara Menjalankan Aplikasi** ➔ Update [`README.md`](../README.md) & [`PROMPT.md`](../PROMPT.md).

2. **Definition of Done (DoD) Gate:**
   - Tugas **TIDAK DIANGGAP SELESAI** jika kode sudah diubah namun dokumen terkait belum disinkronkan.
   - Setiap `git commit` di branch `dev` harus menyertakan pembaruan dokumentasi jika ada penambahan atau modifikasi fitur.

3. **Anti-Stale Documentation:**
   - Dilarang membiarkan file dokumentasi menjadi usang (*outdated*). Seluruh diagram ERD, daftar endpoint, dan daftar file harus selalu merefleksikan kondisi codebase terbaru.

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



