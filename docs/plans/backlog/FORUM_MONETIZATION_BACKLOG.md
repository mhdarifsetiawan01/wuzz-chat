# Backlog lanjutan: Monetisasi Forum (Freemium)

> Dibuat 21 Oktober 2026 (akhir sesi). **Untuk dilanjutkan 22 Oktober 2026.** Rencana, keputusan, dan hasil uji: [`FORUM_MONETIZATION_PLAN.md`](FORUM_MONETIZATION_PLAN.md). Ringkasan keadaan produksi ada di memori proyek (`forum-monetization-status-21okt`).
>
> Fakta bertanda **(terbukti)** sudah dilihat langsung atau diuji; **(tes saja)** hanya terbukti lewat tes otomatis, belum di produksi; **(belum)** belum diuji sama sekali.

## 0. Keadaan saat backlog ini ditulis

- Kode: `main` = `origin/main` = `dev` = `edd3e8d`. Produksi menjalankan backend dan APK 1.40.0 build 71 dari kode itu.
- Sakelar produksi: `FORUM_LIMITS_ENABLED=true` dan `MEMORY_QUOTA_ENABLED=true` keduanya **menyala**. Grandfather sudah diterapkan ke 6 akun (Pro sampai ±20 Des 2026 01.26 WIB).
- Terbukti di produksi: Free (batas 1 forum, 1 Bulan terkunci, kuota AI 2 habis di forum ke-3, label "Ringkasan tidak dibuat (kuota habis)"); Pro (jatah x dari 5, 1 Bulan terbuka, forum 1 Bulan terbentuk, baris "Ringkasan AI bulan ini: x dari 20" di jalur Info Grup dan bubble beranda); halaman `/admin/plans` (beri, cabut, pratinjau, terapkan).

## 1. Tenggat dan pengingat (ada tanggalnya)

| Kapan | Apa | Catatan |
|---|---|---|
| **1 November 2026 00.00 UTC (07.00 WIB)** | Kuota AI bulan berjalan dihitung ulang | Amati: akun uji Free `vanyzter` (sekarang 2 dari 2) harus kembali 0 dari 2. **(tes saja)** untuk pergantian bulan. |
| **±20 Desember 2026 01.26 WIB** | Pro 6 akun grandfather berakhir otomatis menjadi Gratis | Putuskan sebelum itu: perpanjang manual lewat "Ubah masa Pro" atau tunggu Fase 5. Forum yang ada tidak dihapus. |

## 2. Belum diuji atau belum terbukti

| # | Apa | Status | Cara memverifikasi | Siapa |
|---|---|---|---|---|
| U1 | Batas Pro: 5 forum aktif, forum ke-6 ditolak `forum_limit_reached` | **(tes saja)**; sisi Free terbukti di produksi | Dengan akun uji Pro, buat 5 forum 7 hari di grup uji non-AI, coba ke-6, lalu akhiri semuanya (di grup non-AI tidak memanggil model AI) | Pengguna di HP, atau saya lewat `adb` bila HP terhubung |
| U2 | Cabut atau downgrade Pro: forum yang ada tetap, pembuatan baru mengikuti Gratis | **(tes saja)** | Pada akun uji (bukan 6 akun grandfather), beri Pro, buat forum, cabut paket, cek modal Buat Topik berubah ke batas Gratis dan forum lama tidak hilang | Pengguna/saya |
| U3 | Pro kedaluwarsa otomatis (`valid_until` lewat menjadi Gratis tanpa worker) | **(tes saja)** | Beri Pro 1 hari ke akun uji, tunggu lewat, cek status di `/admin/plans` | Pengguna |
| U4 | Dialog batas perangkat di halaman login (`DeviceLimitModal`) setelah `.modal-card-unified` memakai `--bg-card` | **(belum)** dilihat | Login akun ke-3 di perangkat ke-3 (atau tiru lewat tes) dan lihat dialognya | Pengguna |
| U5 | Modal Buat Topik di web chat (batas, durasi terkunci, kuota AI) | **(belum)** di browser; hanya build dan tes logika | Menunggu gate jeda web dibuka, atau uji di lokal | Saya (lokal) |
| U6 | iOS | **(belum)** sama sekali | Menunggu build iOS | Pengguna |
| U7 | Paket C (dari backlog lama): bukti dari review draf, sumber hilang atau terhapus atau tidak berhak, pergantian akun/tenant/role, timeout/offline saat respons tertunda, tema gelap | **(belum)** | Lihat `FORUM_COMPLETION_LOOP.md` bagian "Verifikasi HP Paket C" | Pengguna |
| U8 | Notifikasi nyata Paket A (dari backlog lama) | **(belum)**, ditunda pengguna | Lihat `FORUM_COMPLETION_LOOP.md` | Pengguna |
| U9 | Badge di tombol Forum menghitung draf lebih dari 0 (Paket B) | **(terbukti 21 Okt)**: tombol menampilkan "2 draf perlu ditinjau" | Tidak perlu lagi; catatan lama "belum teruji" sudah usang | Selesai |
| U10 | Tenant non-default tidak dibatasi | **(tes saja)**, tidak ada tenant B2B di produksi | Tidak mendesak | Ditunda bersama B2B |
| U11 | Perilaku kuota di Postgres produksi pada beban nyata (pengecekan dan insert job tidak atomik) | **(tes saja)** | Pantau log `[MemoryQuota]` setelah rilis; lihat B3 | Saya |

## 3. Bug dan celah yang belum diperbaiki

| # | Temuan | Dampak | Opsi / usulan | Ukuran |
|---|---|---|---|---|
| B1 | **Banner di layar chat forum yang berakhir tidak menjelaskan status memori.** Mobile hanya teks; web menampilkan tombol "Lihat Memori" yang tetap muncul walau forum dilewati karena kuota (arsip kosong) | Rendah: pengguna sudah diberi tahu di alert, pesan sistem grup, dan Forum Saya | A. biarkan (saran). B. klien memanggil `GET /api/forums/mine` dan menampilkan label yang sama. C. backend menambah `memory_state` di `GET /api/groups/{sub_id}` | A nol; B sedang; C besar |
| B2 | **Baris `SKIPPED` permanen** (UNIQUE `forum_id`): ringkasan forum yang dilewati tidak dibuat ulang otomatis bulan berikutnya | Rendah | Tombol admin "buat ulang ringkasan" yang menghapus baris `SKIPPED` lalu membuat job; hanya bila kuota ada | Sedang |
| B3 | **Race kecil pada kuota:** dua forum milik pembuat yang sama berakhir bersamaan tepat di ambang bisa melampaui kuota satu job | Sangat rendah (biaya per job kecil) | Diterima; bila perlu, advisory lock per user di `CreateJob` (Postgres) | Kecil |
| B4 | **Forum yang berakhir sebelum fitur ada tidak punya label kuota** (tidak ada baris `SKIPPED`) | Kosmetik | Diterima | Nol |
| B5 | **Admin grup baru sesudah grandfather tidak otomatis Pro** | Disengaja; admin baru kena batas Gratis | Beri manual lewat `/admin/plans`; atau aturan "admin grup yang sudah punya N anggota" (keputusan produk) | Keputusan |
| B6 | **Sisa transparansi 5% pada kartu dialog** (`--bg-card` memang 0,95) | Kosmetik, ada bayangan teks sangat tipis | Tambah `backdrop-filter: blur(var(--glass-blur))` pada `.modal-card-unified` | Kecil |
| B7 | **`npm run dev` (server.js) pernah dua kali menjawab 500** (`ENOENT .next/dev/required-server-files.json`) | Hanya lokal; tidak dapat direproduksi dalam 5 skenario | Pantau; simpan log bila terulang. Jalan keluar yang pernah berhasil: `npx next dev -p 3047` | Pantau |
| B8 | **OpenAPI belum diaudit penuh:** satu skema (`CreateSubgroupRequest`) ternyata salah total dan sudah dikoreksi; skema lain belum dicocokkan dengan kode | Dokumentasi menyesatkan | Audit `openapi.yaml` terhadap handler, endpoint demi endpoint | Sedang |
| B9 | **Dokumen domain lain belum diverifikasi ulang terhadap kode:** `AI_MEMORY.md` bagian UI dan paket A/B/C, `GROUP_FORUM.md` bagian lain, dll. (kasus skema memori dan tenant sudah dikoreksi) | Dokumentasi menyesatkan | Audit dokumen domain, tabel demi tabel | Sedang |
| B10 | **Wrapper `ForumService.InstantExpireSubGroup`** tetap ada hanya untuk kompatibilitas tes; handler memakai `...WithOutcome` | Kebersihan kode | Hapus wrapper dan ubah tes | Kecil |

## 4. Fitur yang belum ada (opsional, dari rencana)

| # | Fitur | Mengapa berguna |
|---|---|---|
| F1 | **Daftar semua akun Pro beserta tanggal berakhir** di `/admin/plans` | Untuk 20 Desember: sekarang hanya bisa mencari satu username per kali |
| F2 | **Perpanjangan massal** (mis. "perpanjang semua grandfather 30 hari") | Memperpanjang 6 akun sekarang harus satu per satu |
| F3 | **Pemberitahuan di aplikasi sebelum Pro berakhir** (mis. 7 hari sebelumnya) | Pengguna tidak kaget turun ke Gratis |
| F4 | **Pencatatan token atau biaya LLM per job** (kolom di `forum_memory_jobs`) | Menilai biaya nyata sebelum menetapkan harga atau kuota |
| F5 | **Perpanjang atau aktifkan ulang forum** (sekarang tidak ada) | Nilai tambah Pro |
| F6 | **Kanal kontak "hubungi admin Wuzz untuk akses Pro"** | Teks UI menyebut ini, tetapi belum ada tombol atau alamat |
| F7 | **Paket Business dan batas di tenant B2B** | Ditunda bersama B2B |
| F8 | **Fase 5 (pembayaran)** | Ditunda sampai kebijakan Google Play diperiksa dari sumber resmi. Riset sekunder: layanan digital umumnya wajib Play Billing; pelonggaran Maret 2026 belum jelas untuk Indonesia |

## 5. Pembersihan data uji di produksi

- Forum uji yang sudah berakhir (riwayat tetap ada): "forum pto vibe coding 1", "Uji kuota 2", "Uji kuota 3" (grup "Grup Uji Pro"), "Uji Pro 30 hari" ("Test Share Group").
- **2 draf ringkasan menunggu ditinjau** di grup "Grup Uji Pro" (akun `vanyzter`): setujui, tolak, atau hapus (keputusan pemilik).
- Akun uji Free `vanyzter` berada di kuota 2 dari 2 sampai 1 November; tidak perlu diubah.
- Satu catatan kecil: pesan sistem "Memori AI tidak dibuat karena kuota bulan ini sudah habis" tersisa di riwayat "Grup Uji Pro".

## 6. Keputusan produk yang menunggu

1. Masa Pro 6 akun grandfather setelah 20 Desember (perpanjang atau biarkan turun).
2. Apakah kuota AI sebaiknya per pembuat forum (sekarang) atau per grup setelah ada data penggunaan.
3. Apakah admin grup baru otomatis mendapat Pro sementara (B5).
4. Kapan mengerjakan B1 (banner chat), dan opsi mana.
5. Kapan membuka whitelist AI Memory (`MEMORY_ENABLED_GROUPS=*`) ke semua grup: itu keputusan privasi dan biaya terpisah dari monetisasi.

## 7. Urutan yang disarankan untuk besok

1. Jalankan U1 dan U2 dengan akun uji (bukan akun grandfather), dengan `adb` bila HP terhubung.
2. Putuskan B1 (banner chat): saran tetap biarkan; nilai ulang setelah umpan balik penguji internal.
3. Kerjakan F1 dan F2 (daftar Pro + perpanjangan massal) bila ingin menutup risiko 20 Desember sejak dini.
4. Audit B8 dan B9 (OpenAPI dan dokumen domain) sebagai pekerjaan terpisah tanpa risiko rilis.
5. Amati 1 November untuk kuota dan 20 Desember untuk kedaluwarsa.
