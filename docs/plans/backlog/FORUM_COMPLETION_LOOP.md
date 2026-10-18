# Forum Completion Loop — Rencana Implementasi dan Handoff

> **Status:** Paket A diimplementasikan, commit `3fa080a` sudah di main dan dipush; uji baca/read-only lulus pada APK pengguna 1.39.1 build 70. Uji notifikasi nyata ditunda atas keputusan pengguna. Paket B diimplementasikan lokal pada sesi lanjutan; Paket C belum dikerjakan.
> **Tanggal perancangan:** 18 Oktober 2026
> **Target awal:** Mobile, lalu penyelarasan Web
> **Batas penggunaan:** Dokumen ini menyimpan rencana dan hasil implementasi. Kerjakan hanya paket yang diminta pengguna; jangan menganggap seluruh backlog sebagai izin implementasi. Deploy dan build APK/AAB selalu dikerjakan pengguna.

## 1. Ringkasan Keputusan

Wuzz Chat tidak akan menambah Online Class atau forum mandiri pada tahap ini. Fokus berikutnya adalah menyelesaikan alur yang sudah menjadi kekuatan produk:

```text
Forum aktif
    ↓
Forum berakhir dan menjadi read-only
    ↓
AI menyusun draf Memori
    ↓
Admin/creator meninjau
    ↓
Memori diterbitkan
    ↓
Anggota membaca keputusan dan menelusuri bukti ke pesan asli
```

Forum tetap merupakan anak dari grup. Tombol Forum di beranda mobile tetap menjadi agregator lintas grup, bukan ruang forum yang terpisah dari grup.

Nilai produk yang ingin diperkuat:

> Diskusi boleh berakhir, tetapi keputusan yang telah diverifikasi tidak hilang.

## 2. Masalah yang Ditemukan dalam Audit

Bagian ini adalah temuan audit awal sebelum Paket A, bukan status kode terkini. Audit dilakukan terhadap implementasi backend, mobile, web, dokumentasi domain, serta tampilan APK pada perangkat Android. Tidak ada data forum atau Memori yang dibuat, diakhiri, disetujui, atau dihapus selama audit.

### 2.1 Navigasi notifikasi draf mobile terputus

Backend mengirim notifikasi `memory_draft_ready` dengan `group_id`, `forum_id`, `draft_id`, dan `deep_link`. Navigasi notifikasi mobile saat ini hanya mengekstrak `room_id`. Ketukan notifikasi draf karena itu berpotensi tidak membawa admin ke layar review.

Referensi awal:

- `backend/internal/ai/processor.go`
- `mobile/src/services/notificationService.ts`
- `mobile/App.tsx`

### 2.2 Forum berakhir tidak konsisten antar-pintu masuk

- Dari **Forum Saya**, forum berakhir dapat dibuka.
- Dari daftar forum di dalam grup, forum berakhir hanya menampilkan status terkunci tanpa aksi membuka riwayat.
- Invarian domain menyatakan forum berakhir harus tetap dapat dibaca dan hanya jalur penulisan yang dikunci.

Referensi awal:

- `mobile/src/components/forum/MyForumsView.tsx`
- `mobile/src/components/SubGroupListModal.tsx`
- `mobile/src/screens/ChatScreen.tsx`
- `docs/domains/GROUP_FORUM.md`

### 2.3 Teks pengakhiran forum menyesatkan

Konfirmasi saat ini menyatakan forum tidak bisa dibuka lagi, padahal riwayat seharusnya tetap dapat dibaca. Pesan ini harus membedakan dengan jelas antara **tidak bisa mengirim pesan baru** dan **tidak bisa membaca riwayat**.

### 2.4 Bukti belum dapat ditelusuri di mobile

Review dan detail Memori mobile telah menampilkan kutipan, nama pengirim, tanggal, dan `message_id`, tetapi kutipan belum memiliki aksi untuk membuka pesan sumber. Web telah memiliki sebagian jalur kembali ke forum, tetapi perilakunya perlu diselaraskan dan diverifikasi untuk lompatan ke pesan tertentu.

Referensi awal:

- `mobile/src/components/memory/MemoryReviewView.tsx`
- `mobile/src/components/memory/MemoryDetailView.tsx`
- `frontend/app/chat/memory/MemoryDraftReviewModal.tsx`
- `frontend/app/chat/memory/GroupMemoryDetailModal.tsx`

### 2.5 Pekerjaan review kurang terlihat

Draf pending baru terlihat setelah admin membuka Arsip Memori dan memilih tab **Perlu Ditinjau**. Tombol Forum di beranda belum menampilkan jumlah pekerjaan yang menunggu.

### 2.6 AI Memory belum tersedia untuk semua grup

Produksi masih memakai whitelist `MEMORY_ENABLED_GROUPS`. UI dan naskah produk tidak boleh menjanjikan AI Memory pada grup yang `memory_enabled` bukan `true`. Pembukaan ke semua grup berada di luar cakupan rencana ini.

### 2.7 Output belum mencakup action item terstruktur

Output yang benar-benar tersedia saat ini adalah:

- Ringkasan
- Keputusan
- Alur Diskusi atau `JOURNEY_LITE`

Penanggung jawab, tenggat, dan status tugas belum menjadi bagian output terstruktur. Jangan memasarkan Forum Completion Loop sebagai task manager.

## 3. Tujuan dan Non-Tujuan

### 3.1 Tujuan

1. Membuat forum berakhir tetap dapat dibaca dari semua pintu masuk.
2. Menjelaskan status forum dan Memori setelah diskusi berakhir.
3. Membawa admin dari notifikasi langsung ke draf yang benar.
4. Menunjukkan pekerjaan review tanpa membuat beranda berisik.
5. Membuat kutipan bukti dapat ditelusuri ke pesan sumber.
6. Menyamakan istilah dan perilaku utama mobile dan web.
7. Mempertahankan otorisasi fail-closed dan isolasi tenant.

### 3.2 Non-Tujuan

- Forum tanpa grup.
- Online Class atau video kelas.
- Action item, deadline, dan task management.
- Chatbot atau tanya-jawab atas arsip.
- Pencarian semantik.
- Pembukaan AI Memory ke seluruh grup.
- Perubahan monetisasi.
- Perombakan desain beranda atau navigasi utama.

## 4. Terminologi Produk

Gunakan istilah berikut secara konsisten di UI:

| Istilah | Arti |
|---|---|
| **Grup** | Komunitas atau ruang induk permanen |
| **Forum** | Diskusi berbatas waktu di dalam grup |
| **Draf Memori** | Hasil AI yang belum disetujui manusia |
| **Memori** | Ringkasan dan keputusan yang telah disetujui admin/creator |

`subgroup` tetap boleh digunakan sebagai istilah internal kode dan API. Hindari mencampur “subgrup”, “topik”, “forum”, dan “forum topik” pada teks yang dilihat pengguna. Bila penjelasan diperlukan, gunakan **“Forum adalah topik diskusi berbatas waktu di dalam grup.”**

## 5. Model Status Pengalaman Pengguna

Status UI sebaiknya diturunkan dari data forum, job, draf, dan Memori yang sudah ada. Jangan menambah kolom status baru sebelum membuktikan bahwa derivasi tidak memadai.

| Status UI | Kondisi konseptual | Tampilan anggota | Tampilan admin/creator |
|---|---|---|---|
| `active` | Forum aktif | Sisa waktu dan Buka | Sisa waktu, Buka, Akhiri |
| `ended` | Forum berakhir; AI nonaktif/tidak dibuat | Berakhir, Buka Riwayat | Berakhir, Buka Riwayat |
| `processing` | Job `QUEUED` atau `PROCESSING` | Memori sedang diproses | Memori sedang diproses |
| `under_review` | Draf siap tetapi viewer bukan admin | Sedang ditinjau admin | Tidak digunakan untuk admin |
| `review_required` | Draf `DRAFT` dan viewer admin/creator | Tidak boleh terlihat | Perlu ditinjau + Tinjau |
| `published` | Memori telah disetujui | Lihat Memori | Lihat Memori |
| `rejected` | Draf ditolak | Forum berakhir | Draf ditolak; boleh hapus/ulang sesuai aturan terpisah |
| `failed` | Job gagal | Ringkasan belum tersedia | Pemrosesan gagal; tampilkan jalur retry hanya bila backend mendukung |

Nama wire/status akhir boleh disesuaikan dengan enum yang sudah ada. Kontrak eksternal harus stabil dan tidak membocorkan detail internal worker.

## 6. Alur Pengguna Target

### 6.1 Admin mengakhiri forum

1. Admin memilih **Akhiri Forum**.
2. Dialog menjelaskan bahwa pesan baru akan dikunci tetapi riwayat tetap dapat dibaca.
3. Setelah berhasil, forum menampilkan banner read-only.
4. Jika AI Memory aktif, banner menunjukkan bahwa Memori sedang diproses.
5. Jika AI Memory tidak aktif, tidak ada janji pembuatan ringkasan.

Teks konfirmasi yang disarankan:

> Topik akan dikunci dan tidak dapat menerima pesan baru. Riwayat diskusi tetap dapat dibaca. Jika AI Memory aktif, ringkasan akan dibuat untuk ditinjau admin.

Teks keberhasilan jika AI aktif:

> Forum telah diakhiri. Ringkasan sedang diproses dan admin akan diberi tahu ketika siap.

Teks keberhasilan jika AI tidak aktif:

> Forum telah diakhiri. Riwayat diskusi tetap dapat dibaca.

### 6.2 Admin menerima draf

1. Worker menyelesaikan draf.
2. Push `memory_draft_ready` dikirim ke admin dan creator.
3. Ketukan notifikasi membuka Arsip Memori grup.
4. Tab **Perlu Ditinjau** aktif.
5. Draf yang dimaksud langsung terbuka.
6. Admin dapat menyunting, menyetujui, menolak, atau menghapus draf sesuai izin yang sudah ada.

### 6.3 Anggota membaca Memori

1. Forum Saya menampilkan **Memori tersedia**.
2. Anggota membuka detail Memori.
3. Anggota membaca Ringkasan, Keputusan, dan Alur Diskusi.
4. Anggota menekan **Lihat Pesan Asli** pada kutipan bukti.
5. Aplikasi membuka forum read-only, memuat konteks pesan, menggulir, lalu menyorot pesan sumber.

## 7. Rencana Tahapan Implementasi

### Tahap 1 — Forum berakhir tetap readable

Ruang lingkup:

- Ubah teks konfirmasi pengakhiran.
- Tambahkan aksi **Buka Riwayat** untuk forum berakhir di daftar grup.
- Pastikan forum berakhir dapat dibuka dari Info Grup dan Forum Saya.
- Pertahankan input pesan dalam keadaan disabled/read-only.
- Audit semua jalur tulis pada forum berakhir: kirim WS, forward, edit, hapus, reaksi, dan operasi lain yang relevan.
- Jangan memperluas penguncian secara diam-diam: putuskan perilaku edit, hapus, dan reaksi berdasarkan aturan bisnis sebelum mengubahnya.

Kriteria penerimaan:

- Riwayat forum berakhir dapat dibuka dari semua pintu masuk resmi.
- Pesan baru dan forward ke forum berakhir ditolak fail-closed.
- UI tidak lagi mengatakan forum tidak bisa dibuka.
- Status lokal dan status server tidak berbeda setelah admin mengakhiri forum.

### Tahap 2 — Metadata lifecycle Memori pada Forum Saya

Ruang lingkup backend:

- Perluas respons `GET /api/forums/mine` dengan status Memori yang aman untuk peran viewer.
- Hindari query N+1; gunakan join/CTE atau query agregat set-based.
- Pertahankan batas respons yang sudah ada.
- Jangan mengirim `draft_id` kepada anggota biasa.

Kontrak usulan:

```json
{
  "id": "sub_xxx",
  "parent_id": "grp_xxx",
  "is_active": false,
  "memory_enabled": true,
  "memory_state": "review_required",
  "memory_id": null,
  "draft_id": "draft_xxx"
}
```

Aturan respons:

- `draft_id`: hanya admin/creator yang berwenang.
- `memory_id`: hanya untuk Memori terpublikasi yang boleh dibaca viewer.
- Anggota biasa menerima `under_review`, bukan `review_required` dan bukan identitas draf.
- Grup dengan `memory_enabled != true` menerima `ended`/`disabled` tanpa teks AI.
- Semua query harus memfilter `tenant_id` dan keanggotaan.

Ruang lingkup mobile:

- Render status aktif, processing, review, published, failed, dan ended.
- Sediakan aksi yang tepat berdasarkan status dan peran.
- Pertahankan cache per akun dan ketahanan jaringan yang sudah ada.

Kriteria penerimaan:

- Pengguna mengetahui apa yang terjadi setelah forum berakhir.
- Anggota biasa tidak dapat menemukan ID atau isi draf.
- Grup non-whitelist tidak menjanjikan AI Memory.

### Tahap 3 — Navigasi notifikasi langsung ke review

Payload sumber tetap:

```json
{
  "type": "memory_draft_ready",
  "group_id": "grp_xxx",
  "forum_id": "sub_xxx",
  "draft_id": "draft_xxx"
}
```

Rencana mobile:

- Ubah hasil parser notifikasi menjadi union berdasarkan `type`, bukan satu bentuk target chat.
- Pertahankan parsing notifikasi pesan dan panggilan yang sudah ada.
- Tambahkan target khusus Memori dengan `groupId`, `forumId`, dan `draftId`.
- Tambahkan parameter navigasi `openMemoryDraftId` pada layar yang paling tepat.
- Pilihan awal: buka `GroupInfo` atau ruang grup, lalu otomatis membuka `MemoryArchiveModal` dengan `initialDraftId`.
- `MemoryArchiveModal` memuat daftar/draf, memvalidasi keberadaan draf, lalu membuka `MemoryReviewView`.
- Tetap tangani HTTP 403, 404, dan 409 secara eksplisit.
- Pertahankan deduplikasi ketukan notifikasi.

Wajib diuji:

- Foreground/warm start.
- Background resume.
- Cold start.
- Notifikasi yang diketuk dua kali.
- Draf sudah disetujui admin lain.
- User bukan admin lagi.
- Grup atau draf sudah dihapus.

Kriteria penerimaan:

- Satu ketukan membawa admin ke draf yang benar.
- Tidak ada regresi pada notifikasi pesan dan panggilan.
- Otorisasi tetap ditegakkan backend.

### Tahap 4 — Badge dan pintasan review

Ruang lingkup:

- Tambahkan badge pada tombol Forum hanya jika viewer memiliki draf `review_required`.
- Tambahkan bagian **Perlu Ditinjau** di sheet Forum ketika jumlahnya lebih dari nol.
- Jangan menampilkan bagian kosong kepada anggota biasa.
- Gunakan data respons Forum Saya atau agregasi yang sama; hindari polling/request terpisah tanpa kebutuhan.

Tampilan konseptual:

```text
Forum Saya
2 aktif · 3 berakhir

Perlu Ditinjau
1 draf menunggu Anda

Buat Forum Baru
```

Kriteria penerimaan:

- Badge sama dengan jumlah draf yang benar-benar dapat ditinjau user.
- Badge hilang setelah draf disetujui, ditolak, atau dihapus.
- Tidak ada kebocoran jumlah draf lintas grup/tenant.

### Tahap 5 — Lihat Pesan Asli

Tahap ini dimulai dengan audit kontrak history yang ada. Jangan langsung membuat endpoint baru sebelum memastikan tidak ada jalur targeted history yang dapat digunakan ulang.

Jika belum tersedia, kontrak usulan:

```http
GET /api/messages/context?room_id=sub_xxx&message_id=msg_xxx&before=20&after=20
```

Persyaratan backend:

- Verifikasi viewer berhak membaca forum.
- Verifikasi pesan merupakan bagian dari `room_id` tersebut.
- Terapkan isolasi tenant.
- Hormati penghapusan untuk semua, penghapusan untuk viewer, dan batas privasi lain.
- Jangan mengaktifkan penulisan pada forum berakhir.

Rencana mobile/web:

- Kutipan bukti menjadi tombol **Lihat Pesan Asli**.
- Navigasi membuka forum terkait dalam mode read-only bila sudah berakhir.
- Muat jendela pesan yang mencakup `message_id`.
- Scroll ke pesan dan tampilkan highlight sementara.
- Bila pesan tidak tersedia, tampilkan: **Pesan sumber sudah tidak tersedia. Kutipan tersimpan sebagai bagian audit Memori.**

Kriteria penerimaan:

- Bukti yang tersedia membuka pesan yang tepat.
- Pesan dari forum lain tidak dapat diminta dengan ID campuran.
- Keadaan pesan hilang tidak menyebabkan loop loading atau layar kosong.

### Tahap 6 — Penyelarasan web dan mobile

Ruang lingkup:

- Samakan terminologi pengguna.
- Samakan teks pengakhiran.
- Samakan status processing/review/published.
- Samakan akses read-only forum berakhir.
- Samakan perilaku bukti.
- Pertahankan deep link web `openDraft` yang sudah ada.

Pencarian arsip server-side tidak termasuk tahap ini. Catatan: pencarian web saat ini memfilter kumpulan terbatas yang sudah dimuat, sedangkan mobile belum memiliki pencarian arsip.

## 8. Area Kode yang Diperkirakan Terdampak

Daftar ini adalah peta awal, bukan izin untuk mengubah semua file.

### Backend

- `backend/internal/group/`
- `backend/internal/api/group_handler.go`
- `backend/internal/store/sql_group_store_forums.go`
- `backend/internal/memory/`
- `backend/internal/api/memory_handler.go`
- `backend/internal/ai/processor.go`
- `backend/internal/push/`
- Store/query riwayat pesan bila Tahap 5 membutuhkan endpoint konteks.

### Mobile

- `mobile/src/components/forum/ForumBubble.tsx`
- `mobile/src/components/forum/MyForumsView.tsx`
- `mobile/src/components/SubGroupListModal.tsx`
- `mobile/src/screens/ChatScreen.tsx`
- `mobile/src/screens/GroupInfoScreen.tsx`
- `mobile/src/components/memory/MemoryArchiveModal.tsx`
- `mobile/src/components/memory/MemoryReviewView.tsx`
- `mobile/src/components/memory/MemoryDetailView.tsx`
- `mobile/src/services/notificationService.ts`
- `mobile/src/api/subgroups.ts`
- `mobile/src/api/memory.ts`
- `mobile/src/api/types.ts`
- `mobile/src/navigation/`
- `mobile/App.tsx`

### Web

- `frontend/app/chat/SubGroupListDrawer.tsx`
- `frontend/app/chat/page.tsx`
- `frontend/app/chat/memory/MemoryDraftReviewModal.tsx`
- `frontend/app/chat/memory/GroupMemoryListModal.tsx`
- `frontend/app/chat/memory/GroupMemoryDetailModal.tsx`
- `frontend/lib/api.ts`
- `frontend/lib/types.ts`

### Dokumentasi

- `docs/domains/GROUP_FORUM.md`
- `docs/domains/AI_MEMORY.md`
- `docs/context/MOBILE.md`
- `docs/progress/MOBILE.md`
- `docs/progress/AI_MEMORY.md`
- `docs/PROGRESS.md` bila milestone selesai.

## 9. Keamanan dan Integritas

Setiap tahap harus mempertahankan aturan berikut:

1. **Anti-BOLA/IDOR:** membership dan role diperiksa di backend, bukan dipercaya dari klien.
2. **Tenant isolation:** seluruh query baru menyertakan `tenant_id` dan tidak menerima tenant dari body/query user.
3. **Draft privacy:** anggota biasa tidak menerima ID atau isi draf pending.
4. **Human-in-the-loop:** tidak ada publikasi otomatis setelah AI selesai.
5. **Evidence integrity:** kutipan tetap terkait `message_id` yang benar.
6. **Fail-closed writes:** forum berakhir tidak dapat menerima pesan baru walaupun state klien stale.
7. **Whitelist:** `memory_enabled` tetap ditentukan server dan tidak di-hardcode klien.
8. **Slow network:** gunakan cancellation, timeout, retry yang aman, dan perlindungan double action.

## 10. Strategi Pengujian

### 10.1 Backend otomatis

- Semua status lifecycle dikembalikan dengan benar.
- Admin/creator menerima `draft_id`; anggota biasa tidak.
- Non-anggota ditolak.
- Kasus lintas tenant ditolak tanpa membocorkan keberadaan entitas.
- Forum berakhir tetap readable dan tidak writable.
- ID pesan dan room yang dicampur ditolak.
- Draf yang sudah diputuskan menghasilkan konflik yang tertangani.
- Query daftar tidak mengalami N+1 yang tidak perlu.

Perintah wajib setelah perubahan backend:

```bash
cd backend && go test -v ./...
```

### 10.2 Mobile otomatis

- Parser notifikasi pesan, panggilan, dan Memori.
- Navigasi warm/background/cold start.
- Deduplikasi respons notifikasi.
- Mapping `memory_state` ke label dan aksi.
- Forum berakhir membuka riwayat.
- Badge pending berubah setelah review.
- Lompatan bukti menangani pesan ada dan tidak tersedia.

Perintah wajib setelah perubahan mobile:

```bash
cd mobile && npx tsc --noEmit
cd mobile && npm run test:unit
```

### 10.3 Web otomatis

```bash
cd frontend && npm run build
```

Tambahkan tes terarah bila komponen atau kontrak web berubah.

### 10.4 Verifikasi perangkat

Gunakan akun admin dan anggota pada grup whitelist:

1. Buat forum uji.
2. Kirim beberapa pesan yang menghasilkan keputusan jelas.
3. Akhiri forum dari mobile.
4. Pastikan riwayat tetap dapat dibuka dan input terkunci.
5. Tunggu worker menghasilkan draf.
6. Ketuk notifikasi pada warm start, background, dan cold start.
7. Sunting lalu setujui draf.
8. Buka Memori sebagai anggota.
9. Ketuk bukti dan pastikan pesan sumber disorot.
10. Uji forum non-whitelist untuk memastikan tidak ada janji AI.
11. Periksa log `ReactNativeJS:E`, `AndroidRuntime:E`, backend error, dan duplikasi push.

Jangan memakai forum/data produksi yang penting untuk pengujian destruktif. Buat entitas uji khusus setelah pengguna mengizinkan tahap implementasi dan pengujian.

## 11. Urutan Eksekusi yang Direkomendasikan

### Paket A — Tutup celah alur inti

1. Tahap 1: forum berakhir tetap readable.
2. Tahap 3: notifikasi langsung ke review.
3. Tes otomatis dan uji HP.

Paket ini sebaiknya selesai lebih dahulu karena memperbaiki kontradiksi dan jalur yang terputus tanpa memperluas produk.

### Paket B — Buat lifecycle terlihat

1. Tahap 2: `memory_state` di Forum Saya.
2. Tahap 4: badge dan pintasan review.
3. Tes otorisasi, tenant, dan UI.

### Paket C — Lengkapi verifikasi bukti

1. Audit targeted history.
2. Tahap 5: Lihat Pesan Asli.
3. Tahap 6: penyelarasan web.
4. Uji end-to-end pada grup whitelist.

## 12. Definition of Done

Forum Completion Loop dianggap selesai jika:

- [ ] Forum berakhir dapat dibaca dari semua pintu masuk resmi.
- [ ] Semua jalur tulis yang dilarang ditolak backend.
- [ ] Teks UI tidak menyatakan riwayat menjadi tidak dapat dibuka.
- [ ] Status Memori terlihat dan sesuai peran viewer.
- [ ] Ketukan push membawa admin langsung ke draf terkait.
- [ ] Badge hanya menghitung draf yang benar-benar dapat ditinjau user.
- [ ] Anggota biasa tidak menerima atau mengakses draf pending.
- [ ] Kutipan bukti dapat membuka pesan sumber atau menjelaskan bila sumber tidak tersedia.
- [ ] Perilaku utama web dan mobile konsisten.
- [ ] Grup non-whitelist tidak menjanjikan pemrosesan AI.
- [ ] Tes backend, mobile, dan build frontend lulus.
- [ ] Alur end-to-end lulus pada perangkat nyata.
- [ ] Dokumentasi domain dan progress diperbarui setelah implementasi, bukan sebelumnya.
- [ ] Deployment backend hanya dilakukan setelah izin eksplisit pengguna.

## 13. Panduan Memulai Sesi Implementasi Baru

Agent pada sesi baru harus:

1. Membaca `PROMPT.md`.
2. Membaca:
   - `docs/domains/GROUP_FORUM.md`
   - `docs/domains/AI_MEMORY.md`
   - `docs/context/BACKEND.md`
   - `docs/context/MOBILE.md`
   - dokumen rencana ini.
3. Memeriksa `git status` dan branch aktif. Jangan bekerja di `main`.
4. Memverifikasi ulang temuan pada kode terkini karena branch mungkin berubah setelah 18 Oktober 2026.
5. Membaca hasil Paket A dan handoff terbaru di bawah sebelum mengerjakan perubahan.
6. Task berikutnya adalah **Paket B — Buat lifecycle terlihat**, hanya jika diminta lewat prompt sesi baru: Tahap 2 (`memory_state` di Forum Saya) dan Tahap 4 (badge/pintasan review). Jangan mengerjakan Paket C sekaligus.
7. Pertahankan keputusan Paket A: edit/hapus/reaksi forum berakhir mengikuti perilaku yang ada; pesan baru dan forward tetap ditolak. Jangan memperluas penguncian tanpa keputusan bisnis baru.
8. Uji notifikasi nyata yang belum tersedia **ditunda atas keputusan eksplisit pengguna**, bukan blocker Paket B dan bukan dianggap lulus. Jangan membuat draf/forum produksi untuk mengejarnya tanpa instruksi.
9. Jangan menjalankan deploy atau build APK/AAB, menaikkan versi/build number, atau mengubah env produksi/signing. Pengguna mengurus deploy/build; AI cukup memberi tahu kebutuhannya. Validasi `npm run build` frontend tetap dijalankan.
10. Jangan commit/push tanpa instruksi baru. Periksa dan pertahankan perubahan dokumentasi handoff yang belum di-commit di working tree.

### Handoff sebelum implementasi Paket B (riwayat)

- `main` dan `dev` lokal telah diselaraskan di `eadd5d0` (1.39.1 build 70); checkout aktif `dev`. Verifikasi ulang saat memulai karena pengguna bisa menambah commit. Jangan mengasumsikan remote dev sudah sinkron; push sebelumnya hanya main.
- Paket A tidak perlu diimplementasikan ulang. Suite backend, frontend build, typecheck mobile, dan 41/41 berkas unit mobile sudah lulus pada implementasinya.
- APK 1.39.1 build 70 dipasang pengguna. Forum Saya dan Info Grup → Forum → Buka Riwayat lulus; riwayat terbaca, input/rekaman suara disabled, banner tampil. Daftar forum berakhir sudah terlihat lewat backend yang digunakan APK. Tidak memverifikasi hash deployment VPS secara langsung.
- Tidak ada draf pending atau notifikasi WuzzChat aktif. Uji ketukan notifikasi nyata warm/background/cold start, dedup ketukan, serta kasus draf dihapus/ditinjau atau hak dicabut tetap **belum terverifikasi dan ditunda pengguna**. Startup normal yang lolos tidak menggantikan uji ini.
- Paket B: turunkan lifecycle dari data forum/job/draf/memori yang tersedia, tanpa kolom baru kecuali kebutuhan terbukti. Terapkan tenant + membership + role + whitelist fail-closed. `draft_id` dan badge review hanya bagi admin/creator yang berwenang; jangan bocorkan ID/jumlah draf kepada anggota biasa.
- Jangan menambah pencarian arsip, Lihat Pesan Asli, task manager, forum mandiri, atau pembukaan AI Memory ke semua grup. Pertahankan payload dan dedup notifikasi Paket A.
- Sebelum edit kode, jelaskan hasil audit serta file/pendekatan. Tambahkan tes regresi yang relevan; jalankan suite backend, typecheck + unit mobile, dan frontend build. Catat hasil aktual serta kebutuhan deploy/build untuk dilakukan pengguna.


## Hasil sesi implementasi awal Paket A — 18 Oktober 2026

Catatan historis di bawah menggambarkan keadaan sebelum commit/push dan pemasangan APK oleh pengguna; status terkini mengikuti handoff aktif serta verifikasi perangkat.

- Selesai lokal: query daftar aktif/berakhir dengan filter tenant dan gate membership tetap berlaku; Buka Riwayat mobile/web bagi anggota; teks pengakhiran read-only; target notifikasi draf → Arsip Memori/review, readiness queue dan dedup listener/cold start; validasi target dan penanganan 403/404/409.
- Lulus: backend `go test -v ./...`, mobile `npx tsc --noEmit`, 41/41 berkas unit mobile, frontend `npm run build`. Tes live provider tanpa kredensial SKIP sesuai suite. Tes readiness/dedup menggunakan modul native tiruan.
- Belum terverifikasi: FCM dan ketukan nyata warm/background/cold start pada APK baru; build release berhenti karena env signing lokal `WUZZ_KEYSTORE_PATH` belum tersedia. ADB mendeteksi perangkat. Tidak ada data produksi dibuat, diakhiri, ditinjau, atau dihapus.
- Backend belum dideploy dan mobile belum dirilis. Tidak mengubah env produksi, commit, atau push.
- Keputusan lanjutan: edit/hapus/reaksi forum berakhir mempertahankan perilaku yang ada; jangan menyimpulkan seluruh mutasi pesan lama ikut dikunci. Pesan baru/forward tetap ditolak. Badge, `memory_state`, pencarian arsip, dan Lihat Pesan Asli tidak termasuk sesi ini.

### Tambahan verifikasi perangkat — 18 Oktober 2026

Pengguna memasang APK 1.39.1 build 70. Uji ADB pada HP berhasil membuka forum berakhir dari Forum Saya dan daftar forum di Info Grup, membaca riwayat, serta memeriksa banner read-only dan input/perekaman suara disabled. Arsip Memori terbit dapat dimuat. Background/resume normal dan cold start normal diikuti pembukaan ulang forum juga berhasil; log error ReactNativeJS/AndroidRuntime kosong. Rincian di `docs/progress/MOBILE.md`.

Tidak ada notifikasi WuzzChat aktif atau draf pending di akun ini. Karena itu, ketukan notifikasi Memori pada warm/background/cold start dan deduplikasi nyata masih **belum terverifikasi**, bukan dianggap lulus dari tes startup normal. Tidak membuat data uji baru, mengakhiri forum, mengubah review, atau mencoba kirim/forward pada produksi. Tidak menjalankan build APK/deploy/commit/push.

Keputusan pengguna setelah verifikasi: seluruh uji notifikasi nyata yang masih tertunda boleh dilanjutkan nanti. Penundaan ini tidak menghalangi Paket B. Build APK/AAB dan deployment sepenuhnya tugas pengguna; jangan dilakukan AI.

## Forum Completion Loop — Paket B (18 Oktober 2026)

- `GET /api/forums/mine` menambah `parent_role`, `memory_enabled`, `memory_state`, serta `memory_id`/`draft_id` opsional. Status diturunkan dari forum, job, draf, dan Memori; tidak ada migrasi/kolom baru. Satu query join dengan pasangan forum + grup + tenant, membership topik dan induk tetap wajib, batas 300 forum tetap berlaku.
- Lifecycle: aktif → `active`; non-whitelist → `ended`; job QUEUED/PROCESSING → `processing`; DRAFT → `under_review` bagi anggota atau `review_required` + ID draf bagi admin/creator **grup induk**; memori terbit → `published`; penolakan → `rejected` hanya bagi admin/creator; kegagalan → `failed`. Role topik tidak memberikan izin review. Data worker dan ID draf internal tidak diserialisasi.
- Mobile memakai satu snapshot Forum Saya dalam sesi untuk daftar, badge tombol Forum, dan pintasan Perlu Ditinjau. Hitungan hanya mencakup draf yang dapat ditinjau pada forum yang diikuti dalam respons terbatas tersebut, bukan seluruh antrean grup. Tidak ada angka/ID draf pending bagi anggota biasa.
- Pintasan review memakai validasi target Paket A; pintasan memori terbit memakai `memory_id` sehingga tidak bergantung pada halaman pertama arsip. Refresh terjadi saat fokus beranda, foreground, membuka sheet, selesai review/hapus, dan menutup arsip; tanpa polling tambahan. Respons yang dibatalkan/lebih lama serta snapshot sesi lain diabaikan; kegagalan refresh mengosongkan daftar/badge dengan opsi coba lagi agar pekerjaan lama tidak ditampilkan sebagai masih valid.
- Notifikasi/deduplikasi Paket A dan aturan pesan baru/forward/edit/hapus/reaksi tidak diubah. Paket C, pencarian arsip, Lihat Pesan Asli, dan pembukaan whitelist tidak dikerjakan.
- Batas verifikasi: belum diuji pada APK/perangkat nyata untuk Paket B, termasuk perpindahan role/grup lintas perangkat dan tema terang/gelap. Uji ketukan Memori nyata warm/background/cold start serta dedup Paket A tetap ditunda pengguna dan bukan blocker. Tidak membuat/mengubah data produksi, deploy, build APK/AAB, menaikkan versi/build, commit, merge, atau push.
- Penerapan memerlukan deploy backend dan APK baru oleh pengguna. Frontend hanya divalidasi build, tidak diubah.

- **Verifikasi otomatis Paket B:** backend `go test -v ./...` lulus; mobile `npx tsc --noEmit` lulus dan `npm run test:unit` 42/42 berkas lulus; frontend `npm run build` lulus. Tes baru mencakup matriks lifecycle/role/whitelist dan privasi JSON, join lintas tenant/grup, membership, perubahan setelah review, serta pembaruan badge dan pengabaian respons lama/dibatalkan. Endpoint diuji melalui HTTP recorder termasuk whitelist dan persetujuan menjadi `published` tanpa ID draf. Tes live provider tanpa kredensial tetap SKIP. Suite backend dan build frontend memakai izin di luar sandbox setelah pembatasan cache/proses pada percobaan awal. Tidak menguji PostgreSQL produksi atau APK baru.


### Verifikasi HP Paket B — 18 Oktober 2026, sekitar 23:14–23:17 WIB

- Pengguna menyatakan backend sudah dideploy dan APK dibuild/dipasang. ADB: RMX3506, `versionName=1.39.1`, `versionCode=70`, `lastUpdateTime=2026-10-18 23:13:56`. Nomor versi sama dengan pengujian Paket A, tetapi waktu pemasangan dan tampilan baru membuktikan APK diperbarui; hash deployment VPS tidak diperiksa.
- Forum Saya memuat satu forum berakhir, “Testing Memory AI” di “Tester WuzzChat”, dengan label **Memori tersedia** dan tombol **Lihat Memori**. Ketukan membuka **Detail Memori** forum yang tepat, menampilkan ringkasan, penyetuju, dan keputusan.
- Beranda/sheet Forum tidak menampilkan badge atau bagian pekerjaan review. Tab Perlu Ditinjau di Arsip Memori menampilkan **Tidak ada draf yang perlu ditinjau**. Background/resume normal diikuti pembukaan sheet Forum berhasil. Log `ReactNativeJS:E` / `AndroidRuntime:E` sejak 23:14 tidak memuat error yang teramati.
- **Belum terverifikasi di perangkat:** badge >0, pintasan draf dan perubahan badge setelah approve/reject/delete, status processing/failed/rejected/non-whitelist, akun anggota biasa/pergantian akun/role, tema gelap, serta iOS. Bukti otomatis sebelumnya tetap berlaku, tetapi tidak menggantikan uji perangkat tersebut. Ketukan notifikasi Memori nyata warm/background/cold start dan dedup Paket A tetap ditunda pengguna; resume normal bukan pengujian notifikasi.
- Tidak membuat forum/job/draf, mengakhiri forum, menyunting/menyetujui/menolak/menghapus review, mengirim pesan, atau mengubah konfigurasi produksi. Membuka detail memakai jalur baca aplikasi biasa (yang dapat mencatat view event). Tidak deploy/build ulang atau mengubah versi. Screenshot lokal: `/tmp/wuzz-b-forums.png`, `/tmp/wuzz-b-memory-detail.png`; dump UI sementara milik pengujian di HP sudah dihapus. Catatan verifikasi ini belum di-commit/push.
