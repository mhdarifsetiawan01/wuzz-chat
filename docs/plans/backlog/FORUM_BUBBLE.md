# Bubble Forum di Beranda Mobile — Rencana

> Dirancang 13 Okt 2026. Tujuan: AI Memory relatif tersembunyi (hanya tombol "Memori" di Info Grup bila `memory_enabled`). Bubble Forum memudahkan user membuat dan menemukan forum, sumber dari AI Memory.

## 1. Keputusan produk

Bubble Forum ada di **beranda mobile saja** (tab Obrolan), di atas FAB obrolan. Isinya dua pilihan:

1. **Forum saya**
   - Hanya forum tempat user menjadi **anggota topik** (tidak ada fitur "mengikuti"; pembuat otomatis anggota).
   - Dikelompokkan **Aktif** dan **Tidak aktif** (sudah berakhir).
   - Baris: judul topik, nama grup induk, sisa waktu atau status berakhir, ikon peran kecil (creator = bintang terisi, admin = bintang outline, anggota = tanpa ikon).
   - Filter chip: **Semua / Admin / Anggota**. Creator digabung ke Admin. Filter dikerjakan di klien (respons memuat `my_role` per topik).
   - Topik berakhir dengan memori disetujui punya pintas ke arsip memori. Empty state memuat tombol buat forum.
2. **Buat forum baru**
   - Forum wajib berada di dalam grup (backend `CreateSubGroup` mewajibkan `ParentID`, hanya admin/creator grup induk).
   - Pemilih grup hanya berisi grup yang user kelola (admin/creator), tanpa ikon bohlam.
   - Anggota biasa: pesan khusus + jalur "Buat grup baru". Belum punya grup: buat grup baru lalu otomatis lanjut membuat forum.
   - Memakai `CreateSubGroupModal`. Teks pengenal AI Memory tampil bila grup `memory_enabled`.
   - Setelah terbuat, user langsung masuk ke chat topik.
   - Pemilih grup dibuat komponen terpisah agar kelak mudah menambah "forum tanpa grup" (belum didukung; perlu desain: siapa admin penyetuju memori, di mana arsipnya).

## 2. Tahapan

| Tahap | Isi | Backend |
|---|---|---|
| 1 | Bubble + "Buat forum baru" | tidak ada perubahan |
| 2 | "Forum saya" + endpoint agregat (mis. `GET /api/forums/mine`) | perubahan + deploy VPS (izin user) |
| 3 | Buka whitelist `MEMORY_ENABLED_GROUPS=*` | env VPS |

Prasyarat Tahap 3: periksa antrean `forum_memory_jobs` berstatus QUEUED dari grup non-whitelist; ubah `/privacy` (kini "uji terbatas"); tinjau Data Safety Play Console; perbarui naskah toko; pikirkan batas beban Groq; uji tombol Hapus Memori dari HP; batasi edit/hapus pesan di topik terkunci.

## 3. Aturan multi-tenant (wajib untuk semua tahap)

Isolasi: satu database dengan `tenant_id` (lihat `docs/context/MULTI_TENANT.md`). Klien resmi berjalan di tenant `default`.

- **Tahap 1:** daftar grup berasal dari daftar percakapan user sendiri (server sudah memfilter `tenant_id`). Pembuatan forum memakai endpoint yang sudah tenant-aware. Klien tidak mengirim atau meng-hardcode tenant.
- **Tahap 2 (endpoint "Forum saya"):**
  - Query wajib memuat `tenant_id` pada `conversations` (forum dan grup induk) dan keanggotaan, bukan hanya `user_id`; jangan hanya mengandalkan gerbang keanggotaan (pola `GetActiveSubGroupsWithContext` tidak memfilter `tenant_id`).
  - Tenant diambil dari `context` (`tenantshared.MustFromContext`), bukan parameter request; jangan fallback diam-diam ke `default` bila konteks kosong (fail-closed).
  - Forum dan grup induk harus satu tenant.
  - Tes Go wajib mencakup kasus lintas tenant (user tenant A tidak melihat forum tenant B, termasuk ID yang dicampur). Respons tidak membocorkan nama grup/tenant lain.
- **Tahap 3:** `MEMORY_ENABLED_GROUPS=*` bersifat global. Untuk B2B kelak sediakan saklar per tenant (daftar tenant yang diizinkan mengirim ke Groq, default hanya `default`). Sisa audit lama: jalur baca `memory_store` perlu diperiksa sebelum tahap ini.
- Fitur B2B (widget, API key, CORS per tenant, dll.) tetap dijeda.

## 4. Status

- Tahap 1: dikerjakan 13 Okt 2026 (lihat `docs/progress/MOBILE.md`).
- Tahap 2: dikerjakan 13 Okt 2026 (endpoint `GET /api/forums/mine` + `MyForumsView`; belum dideploy).
- Tahap 3: **ditunda atas keputusan user (13 Okt 2026)**. AI Memory kelak harus bisa diaktifkan per tenant (tidak semua tenant boleh memakai AI), jadi butuh desain khusus, bukan sekadar `*`. Tahap 1-2 tidak bergantung padanya karena teks pengenal bersyarat `memory_enabled`.
