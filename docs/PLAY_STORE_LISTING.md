# PLAY_STORE_LISTING.md — Draf Data Safety, Deklarasi, dan Naskah Toko

> **Status: DRAF (dibuat 5 Okt 2026, diperbarui 7 Okt 2026)**, disusun dari kode (izin manifest, tabel data, penyedia pihak ketiga). Belum dimasukkan ke Play Console
> (akun masih diverifikasi). Formulir Play berubah dari waktu ke waktu: **cocokkan setiap isian dengan pertanyaan yang tampil di Console**
> dan tandai bagian bertanda ⚠️ sebelum mengirim. Bila kode berubah (mis. menambah Crashlytics/Sentry, lokasi, kontak), perbarui dokumen ini.
> Sumber kebenaran isi privasi: `frontend/app/privacy/page.tsx`. Jawaban di formulir **tidak boleh bertentangan** dengan halaman itu.

---

## 1. Fakta dasar (dari kode)
- Paket `com.wuzzchat.mobile`; kategori **Komunikasi** (Communication).
- **Tidak ada** (diverifikasi di APK 1.32.0): iklan dan SDK iklan, izin `AD_ID`, Firebase Analytics/GA4 (komponen `measurement` tidak ada), izin lokasi, akses kontak/buku telepon, pembelian dalam aplikasi, pembayaran.
- **SDK Google yang ada di build**: Firebase Cloud Messaging, **Crashlytics** (beserta Firebase Installations dan Firebase Sessions), dan **ML Kit barcode** (`com.google.mlkit:barcode-scanning` 17.3.0, dibawa `expo-camera` untuk pemindai QR). **ML Kit (diperiksa 8 Okt 2026 di developers.google.com/ml-kit/android-data-disclosure):** mengumpulkan informasi perangkat (produsen, model, versi OS dan build), nama paket dan versi aplikasi, pengenal per-instalasi yang tidak dimaksudkan mengidentifikasi pengguna secara unik, metrik kinerja (mis. latensi), dan jenis peristiwa (inisialisasi fitur, unduh model, deteksi); untuk pemindai barcode ditambah ID sesi pemindaian. Tujuan: "diagnostics and usage analytics". Dokumen menyatakan data tidak dipindahkan ke pihak ketiga dan dienkripsi saat transit (HTTPS). Halaman itu **tidak** menyatakan gambar/barcode yang dipindai ikut dikirim, dan tidak membedakan artefak bundled dan unbundled. Model pemindai ada di dalam APK (`libbarhopper_v3.so` dan `mlkit_barcode_models/*.tflite`), jadi pemindaian berjalan di perangkat. **Pemetaan ke Data Safety:** "Diagnostics" (metrik kinerja, peristiwa, info perangkat) dan "Device or other IDs" (pengenal per-instalasi), tujuan "Analytics", **tidak dibagikan**. Kedua baris itu sudah ada di tabel 2.2 (lihat catatan di sana). Tanggung jawab jawaban akhir ada pada pengembang (dokumen Google menyatakannya) dan perlu dicocokkan dengan kuesioner terbaru.
- Izin di manifest hasil merge: `INTERNET`, `ACCESS_NETWORK_STATE`, `RECORD_AUDIO`, `CAMERA`, `POST_NOTIFICATIONS`, `MODIFY_AUDIO_SETTINGS`, `VIBRATE`, `WAKE_LOCK`,
  `RECEIVE_BOOT_COMPLETED`, `READ_APP_BADGE` (badge ikon, dari expo-notifications), `USE_BIOMETRIC`/`USE_FINGERPRINT` (dari expo-secure-store),
  `BLUETOOTH` (<= Android 11), `READ/WRITE_EXTERNAL_STORAGE` (<= Android 12L). Tidak ada Foreground Service, `SYSTEM_ALERT_WINDOW`, `READ_MEDIA_*`, SMS, log panggilan, atau lokasi.
  Foto dipilih lewat pemilih foto sistem (tanpa izin media).
- Pihak ketiga yang menerima data: **Google Firebase Cloud Messaging** (token perangkat dan isi notifikasi), **penyedia LLM untuk AI Memory, saat ini Groq** (teks pesan **hanya** dari topik forum terbuka; **uji terbatas sejak 13 Okt 2026**: hanya grup di `MEMORY_ENABLED_GROUPS` yang diproses, `/privacy` sudah diperbarui; membuka ke semua = `MEMORY_ENABLED_GROUPS=*` dan tinjau ulang Data Safety),
  penyedia infrastruktur sendiri (VPS, basis data, penyimpanan berkas Supabase, Redis, relay TURN milik sendiri).

## 2. Data Safety (jawaban yang disarankan)

### 2.1 Pertanyaan tingkat atas
| Pertanyaan | Jawaban | Catatan |
|---|---|---|
| Apakah aplikasi mengumpulkan atau membagikan tipe data pengguna yang wajib? | **Ya** | |
| Apakah semua data pengguna dienkripsi saat transit? | **Ya** | HTTPS dan WSS; media WebRTC memakai DTLS-SRTP |
| Bisakah pengguna meminta data dihapus? | **Ya** | Dalam aplikasi: Pengaturan -> Hapus Akun. URL penghapusan: `https://chat.wuzzhub.id/delete-account` |
| Dibuat mengikuti kebijakan Families? | **Tidak** | Aplikasi untuk 13+, bukan untuk anak |
| Tinjauan keamanan independen? | **Tidak** | Jangan klaim; belum ada audit pihak ketiga |

### 2.2 Tipe data (semua **dikumpulkan**, **terkait akun pengguna**, **wajib** kecuali dicatat; **tidak dijual**)
| Kategori Play | Tipe | Dikumpulkan | Dibagikan | Tujuan | Catatan |
|---|---|---|---|---|---|
| Info pribadi | **Nama** (nama tampilan) | Ya | Tidak | Fungsi aplikasi, Manajemen akun | |
| Info pribadi | **ID pengguna** (username, ID akun, ID akun Google bila memakai Masuk dengan Google) | Ya | Tidak | Fungsi aplikasi, Manajemen akun, Keamanan | Username juga tampil di papan publik Wuzz Grid **hanya bila pengguna opt-in** (lihat 2.5) |
| Info pribadi | **Alamat email** (email Google yang tertaut, hanya sebagai label akun saat memakai Masuk dengan Google) ⚠️ | Ya | Tidak | Manajemen akun, Keamanan | **Dikoreksi 6 Okt 2026:** sebelumnya tertulis "email tidak dikumpulkan", padahal login Google menyimpan email (`user_credentials.label`). Tidak dipakai untuk pemasaran dan tidak dikirim ke pihak lain. Wajib dideklarasikan sebelum rilis Play |
| Info pribadi | **Info pribadi lain** (bio, pesan status, tautan sosial opsional) | Ya | Tidak | Fungsi aplikasi | **Opsional** |
| Pesan | **Pesan lain dalam aplikasi** | Ya | Tidak ⚠️ | Fungsi aplikasi | Pesan grup/forum tersimpan terbaca di server; pesan langsung tersimpan sebagai teks sandi (E2EE) |
| Foto dan video | **Foto** (gambar kiriman, avatar) | Ya | Tidak | Fungsi aplikasi | Media dalam pesan dihapus otomatis paling lama 1 hari (`MEDIA_RETENTION_DAYS=1` di produksi); avatar opsional dan disimpan selama akun aktif |
| Audio | **Pesan suara / file audio** | Ya | Tidak | Fungsi aplikasi | Hanya pesan suara yang dikirim; **panggilan tidak direkam** |
| File dan dokumen | **File dan dokumen** | Ya | Tidak | Fungsi aplikasi | Lampiran yang dikirim pengguna |
| Aktivitas aplikasi | **Konten buatan pengguna lain** (postingan, komentar, suka, laporan, blokir) | Ya | Tidak | Fungsi aplikasi, Keamanan | |
| Aktivitas aplikasi | **Interaksi aplikasi** | Ya | Tidak | Fungsi aplikasi | Status sesi/perangkat **dan, sejak 25 Okt 2026, aktivitas game Wuzz Grid** (percobaan puzzle: tanggal, waktu mulai/selesai, durasi, jumlah salah; streak; pengaturan game). Tanpa analitik perilaku. Lihat 2.5 |
| App info dan kinerja | **Log kerusakan** dan **Diagnostik** (Firebase Crashlytics: jenis/model perangkat, versi OS/aplikasi, jejak kesalahan, ID akun acak) | Ya | Tidak ⚠️ | Analitik, Fungsi aplikasi (memperbaiki crash) | Crashlytics dipasang 5 Okt 2026 (membawa Firebase Installations dan Firebase Sessions, jadi ID instalasi dan data sesi ikut terkirim); lihat `docs/CRASH_REPORTING.md`. Pengumpulan hanya pada build rilis. Tidak ada Firebase Analytics. **Google ML Kit (pemindai QR) ikut mengirim informasi perangkat, versi aplikasi, dan metrik kinerja** untuk diagnostik; baris ini sudah mencakupnya (tipe "Diagnostics") |
| ID perangkat/lainnya | **ID perangkat atau ID lain** (ID perangkat dibuat aplikasi, token FCM, alamat IP pada sesi) ⚠️ | Ya | Tidak ⚠️ | Fungsi aplikasi (notifikasi), Keamanan (pembatasan 2 perangkat, pencabutan sesi), **Analitik** (ID instalasi Firebase dan pengenal per-instalasi ML Kit untuk diagnostik) | Tujuan "Analitik" ditambahkan 8 Okt 2026 karena Firebase Installations dan ML Kit memakai pengenal per-instalasi untuk diagnostik. Cek panduan Google terkini soal alamat IP |
| Kontak | (tidak dideklarasikan) ⚠️ | - | - | - | Daftar teman hanya di dalam aplikasi; tidak membaca buku telepon. Bila Console menanyakan, relasi teman dapat dianggap "Konten pengguna lain" |

**Tidak dikumpulkan:** lokasi, nomor telepon, info keuangan, kesehatan, riwayat penjelajahan, riwayat pencarian di server.
Masuk dengan Google **sudah aktif** (email Google dan ID akun Google tersimpan; baris Alamat email di atas) dan `/privacy` sudah memuatnya (6 Okt 2026).
Crashlytics **sudah dipasang** (baris Log kerusakan/Diagnostik di atas) dan `/privacy` sudah diperbarui. Bila menambah SDK atau data baru, perbarui tabel ini dan `/privacy`.

### 2.3 Soal "dibagikan" ⚠️
**Per 13 Okt 2026 AI Memory dalam uji terbatas (hanya grup whitelist, `MEMORY_ENABLED_GROUPS`); 8 Okt sebelumnya dijeda penuh.** Jawaban Data Safety "Dibagikan: Tidak" tetap berlaku karena penyedia LLM memproses atas nama kita (bukan "berbagi" menurut Play), tetapi `/privacy` wajib menjelaskannya (sudah). Bagian di bawah berlaku penuh bila fitur dibuka untuk semua.

Play tidak menghitung pengiriman data ke **penyedia layanan yang memprosesnya atas nama Anda** sebagai "berbagi". FCM (notifikasi), penyedia LLM (ringkasan AI Memory; saat ini Groq), dan penyedia infrastruktur
termasuk kategori itu, sehingga jawaban "Tidak dibagikan" dapat dipertanggungjawabkan, **asalkan** halaman `/privacy` menyebutkan mereka (sudah). Verifikasi definisi terkini di Console;
bila ragu, lebih aman mendeklarasikan "Dibagikan" untuk Pesan (penyedia LLM, hanya teks forum terbuka). **Ganti penyedia LLM (mis. ke Gemini/Claude) = perbarui `/privacy` bagian 3-4, `LEGAL_EFFECTIVE_DATE`, dan jawaban Data Safety.**

### 2.3b Bila kelak menambah iklan atau analitik (checklist wajib SEBELUM rilis versi itu)
"Tidak ada iklan" hanya kondisi saat ini, bukan pembatasan. Bila menambah AdMob/iklan lain: (1) Console: deklarasi Iklan menjadi "mengandung iklan" dan deklarasi penggunaan ID iklan; (2) manifest: izin `com.google.android.gms.permission.AD_ID`; (3) Data Safety: ID iklan/ID perangkat dan "Dibagikan: Ya" ke jaringan iklan; (4) `/privacy` (kalimat "Saat ini kami tidak menampilkan iklan" dan bagian 4), `LEGAL_EFFECTIVE_DATE`; (5) naskah toko ("Saat ini tanpa iklan"); (6) kuesioner rating konten; (7) target audiens mencakup 13-17: periksa kebijakan iklan Google untuk pengguna di bawah 18 (belum diperiksa); (8) persetujuan (mis. UMP) bila berlaku. Hal yang sama untuk analitik (mis. Firebase Analytics).

### 2.4 Praktik keamanan dan retensi (isi kolom tambahan bila ada)
- Data dienkripsi saat transit; kata sandi disimpan sebagai hash bcrypt.
- Penghapusan: akun, profil, kata sandi, sesi, perangkat, token push, kunci publik, relasi pertemanan, keanggotaan grup, pesan, postingan, komentar, suka, **dan data game (percobaan, streak, pengaturan, catatan moderasi papan publik)** dihapus segera;
  berkas media dibersihkan lewat antrean `media_purge_queue` (biasanya <1 hari setelah akun dihapus); teks privasi sengaja tidak menyebut angka rotasi cadangan maupun lokasi/paket penyedia karena infrastruktur dapat berganti (saat 7 Okt 2026: Supabase Free untuk DB+Storage, Upstash, VPS). **Perbarui `/privacy` bagian 4-5 dan `LEGAL_EFFECTIVE_DATE` setiap kali penyedia berganti atau cadangan mulai dipakai (mis. Supabase Pro, Postgres di VPS).**
- Laporan moderasi: teks bukti dan keterangan pelapor dihapus otomatis 90 hari setelah laporan ditutup (`REPORT_EVIDENCE_RETENTION_DAYS`), kecuali ditahan (bukti yang mungkin diteruskan ke pihak berwenang); catatan tindakan moderator dan metadata laporan dapat disimpan seperlunya untuk keamanan.
- Pemberitahuan moderasi lewat Telegram hanya memuat metadata laporan (jenis, alasan, tautan), tanpa isi pesan, bukti, atau identitas pengguna; bukan "berbagi data pengguna".

### 2.5 Game harian Wuzz Grid (ditambahkan 26 Okt 2026) ⚠️

> ### ⛔ GERBANG RILIS: jangan lewatkan
> **Jangan mempromosikan build yang memuat Wuzz Grid (semua AAB Play dengan versionCode ≥ 74, versi 1.42.0 ke atas) ke Closed testing maupun Produksi sebelum Data Safety di Play Console diperbarui sesuai bagian ini.**
> Alasan: Data Safety harus sesuai dengan yang benar-benar dikumpulkan build yang dirilis. Rilis Closed testing saat ini (build 72) belum memuat game, jadi jawabannya sekarang masih cocok. Build 74 dan seterusnya mengumpulkan data game (percobaan puzzle, streak, pengaturan, papan skor).
> Lakukan **tepat sebelum** menekan *Promote release* dari Internal ke Closed/Produksi, bukan sesudahnya:
> 1. `/privacy`, `/terms`, `/delete-account` terbaru sudah **tayang** (buka URL-nya dan pastikan teks Wuzz Grid ada).
> 2. Formulir **Data Safety** di Console diperbarui memakai pemetaan di bawah, lalu disimpan/dikirim; butir ⚠️ dicocokkan dengan pertanyaan terbaru di Console.
> 3. Kuesioner **IARC** dicek ulang (jawaban tidak berubah, tetapi konfirmasi).
> 4. Baru lakukan promosi.
> Internal testing (hanya akun Anda) boleh menerima build ini kapan saja tanpa menunggu langkah di atas.
Sumber kebenaran: `/privacy` (bagian 1, 3, 5, 8) yang diperbarui bersamaan dengan bagian ini. **Fitur sudah menyala di produksi sejak 25 Okt 2026 (`GAME_ENABLED`), jadi `/privacy` baru (frontend) wajib segera di-deploy.**

**Data yang diproses (semua terkait akun, hanya untuk fungsi aplikasi; tidak dijual; tidak ada SDK baru; tidak ada pihak ketiga baru):**
| Data | Tabel | Dipakai untuk | Terlihat oleh |
|---|---|---|---|
| Percobaan puzzle: tanggal, waktu mulai/selesai, durasi, jumlah salah, status | `game_attempts` | Hasil, papan skor, anti-curang | Hanya pemilik; **durasi** terlihat di papan skor (lihat bawah) |
| Streak: hari berturut-turut, rekor, pembeku | `game_streaks` | Streak | Hanya pemilik (angka streak tidak tampil di papan) |
| Pengaturan: zona waktu (nama IANA), opt-in papan publik, sembunyikan dari teman/grup, opsi pengingat | `game_settings` | Pergantian hari puzzle, privasi | Hanya pemilik |
| Moderasi papan publik: pengeluaran oleh staf, pelaku, catatan, waktu | `game_board_hides`, `game_board_audit` | Keamanan/moderasi | Staf |

**Papan skor dan "dibagikan":**
- Papan **Teman** dan **Grup**: waktu + nama tampilan + foto profil terlihat oleh teman dan anggota grup yang sama (blokir menyembunyikan dua arah). Pengguna dapat menyembunyikan hasilnya lewat pilihan "Sembunyikan hasil saya dari teman dan grup" (`game_settings.hide_from_social`, bawaan tampil; ditambahkan 26 Okt 2026); pemilik tetap melihat barisnya sendiri. Ini tampilan antar-pengguna di dalam aplikasi, bukan pengiriman ke pihak ketiga, jadi tidak dihitung "dibagikan" menurut Play; **cocokkan dengan definisi terkini di Console** ⚠️.
- Papan **Publik**: **opt-in, mati secara bawaan**; hanya `@username` dan waktu (server mengosongkan nama tampilan dan foto). Dapat dimatikan kapan saja; staf dapat mengeluarkan akun.
- **Zona waktu bukan lokasi:** nama zona (mis. `Asia/Jakarta`) tidak menunjuk lokasi. Jangan dideklarasikan sebagai Lokasi; **cocokkan dengan panduan Console** ⚠️.

**Pemetaan Data Safety (usulan):**
- Aktivitas aplikasi -> **Interaksi aplikasi** (baris di 2.2 sudah diperbarui): dikumpulkan, terkait akun, wajib, tujuan Fungsi aplikasi, tidak dibagikan. Alternatif bila Console lebih cocok: "Tindakan lain" ⚠️.
- Tidak ada tipe data baru di kategori lain. Tidak ada perubahan pada: iklan, pembelian, lokasi, kontak.

**Deklarasi lain:**
- **Target audiens 13+:** pemain 13-17 tahun boleh memakai game. Papan publik opt-in dan hanya `@username` (bukan nama/foto) untuk membatasi paparan. Tidak dibuat mengikuti Families.
- **IARC:** game puzzle tanpa taruhan, tanpa pembelian, tanpa konten dewasa; interaksi pengguna (papan skor, laporan) sudah dijawab "Ya" di baris Rating konten. Tidak perlu mengubah jawaban, tetapi **cek ulang kuesioner** ⚠️.
- **Pengingat harian (bila dirilis):** notifikasi lokal dijadwalkan di perangkat; server hanya menyimpan pilihan `reminder_enabled`. Tidak menambah data baru.
- Bila kelak ada hadiah/poin atau iklan di game: ikuti `docs/plans/backlog/ADS_AND_REWARDS_PLAN.md` dan checklist 2.3b.

## 3. Deklarasi lain di Play Console
| Bagian | Jawaban yang disarankan |
|---|---|
| **Akses aplikasi** | Aplikasi memerlukan login. Berikan **akun uji khusus peninjau** (akun demo `peninjau_play` sudah dibuat di produksi 7 Okt 2026; **sandi TIDAK disimpan di repo atau memori**, isi langsung ke Play Console; `reviewer_wuzz` ditolak karena kata `wuzz` terlarang sebagai akhiran username) beserta petunjuk: "Di layar awal ketuk tautan **Login menggunakan username** (di bawah tombol Google), masukkan username dan sandi, lalu buka tab Obrolan." Tautan itu terlihat semua pengguna (bukan fitur tersembunyi). **Tambahkan juga di kolom petunjuk:** "Jika muncul 'Batas Perangkat Tercapai', pilih sesi mana pun lalu ketuk 'Keluarkan & Masuk'. Jika muncul 'Kunci Keamanan Terdaftar', ketuk 'Reset Kunci Baru' dan masukkan password yang sama. Akun ini hanya berisi data uji." Alasan: kunci E2EE dibuat per perangkat; peninjau yang login dari perangkat kedua pasti melihat dialog kunci, dan batas 2 perangkat bisa terisi oleh sesi peninjau sebelumnya. **JANGAN login `peninjau_play` di perangkat sendiri sebelum review**: akun itu belum punya kunci E2EE (dibuat lewat API), dan login pertama di perangkat mana pun mengikatnya ke kunci perangkat itu. Uji jalur "Login menggunakan username" dengan akun sementara (buat lewat API, hapus setelahnya). Akun ini masuk **daftar putih pembekuan** (`GOOGLE_LINK_FREEZE_EXEMPT=peninjau_play` di `.env` VPS) sehingga tetap bisa dipakai setelah 30 Okt 2026. **Jangan** pakai akun nyata. |
| **Iklan** | Tidak ada iklan |
| **Target audiens** | **13+** (pilih 13-15, 16-17, 18+); bukan untuk anak di bawah 13 (selaras dengan Syarat Layanan) |
| **Rating konten (IARC)** | Kategori *Komunikasi/Jejaring sosial*. Jawab: pengguna berinteraksi **Ya**; berbagi konten buatan pengguna **Ya**; berbagi lokasi **Tidak**; pembelian digital **Tidak**; konten dewasa/kekerasan **Tidak ada dari aplikasi** (konten dari pengguna dimoderasi lewat laporan dan blokir). Perkiraan hasil: Remaja (Teen)/12+ |
| **Fitur keuangan, kesehatan, berita, pemerintah** | Tidak ada |
| **Izin sensitif** | Tidak ada yang memerlukan formulir deklarasi khusus (tidak ada SMS, log panggilan, lokasi, semua-berkas, Foreground Service, atau aksesibilitas) |
| **Standar keselamatan anak** ⚠️ | Halaman publik **`https://chat.wuzzhub.id/child-safety`** sudah dibuat (larangan CSAE, batas usia 13+, pelaporan dalam aplikasi dan email, tindakan, kontak). Bila Console menampilkan formulir ini, tempel URL itu dan kontak `support@semanticdigital.id`. **Pastikan Anda sanggup memenuhi janji di halaman itu** (laporan keselamatan anak ditinjau prioritas tertinggi, pelaporan ke pihak berwenang) |
| **Kebijakan privasi** | `https://chat.wuzzhub.id/privacy` |
| **Penghapusan akun** | `https://chat.wuzzhub.id/delete-account` |
| **Kontak developer** | Email `support@semanticdigital.id` (**pastikan aktif**), situs `https://chat.wuzzhub.id` |
| **Enkripsi/ekspor** | Aplikasi memakai E2EE (P-256/AES-GCM); standar, tidak ada pertanyaan ekspor khusus di Play |

## 4. Naskah halaman toko (Bahasa Indonesia, bahasa utama)

**Nama aplikasi** (8/30): `WuzzChat`

**Deskripsi singkat** (75/80):
```
Chat, grup, dan panggilan suara. Pesan langsung terenkripsi ujung-ke-ujung.
```

**Deskripsi lengkap** (1759/4000):
```
WuzzChat adalah aplikasi percakapan untuk individu, tim, dan komunitas: kirim pesan, buat grup, dan telepon langsung dari satu aplikasi.

FITUR UTAMA
• Pesan langsung terenkripsi ujung-ke-ujung (E2EE). Kunci enkripsi tersimpan di perangkat Anda, sehingga server tidak dapat membaca isi pesan langsung.
• Grup dan topik forum: ngobrol dengan banyak orang, balas pesan tertentu, sematkan pesan penting, dan atur peran admin.
• Masuk dengan Google. Akun lama tetap bisa masuk dengan username.
• Panggilan suara satu lawan satu.
• Pesan suara, foto, dan berkas.
• Linimasa komunitas: bagikan postingan, beri komentar, dan suka.
• Teman dan akun privat: kendalikan siapa yang boleh mengirim pesan atau menelepon Anda.
• Verifikasi Nomor Keamanan dan pemindahan kunci lewat kode QR antar perangkat Anda.

PRIVASI DAN KENDALI ANDA
• Saat ini tanpa iklan. Laporan kerusakan teknis dikirim ke Google Firebase Crashlytics untuk memperbaiki aplikasi.
• Blokir pengguna dan laporkan pesan, postingan, komentar, atau akun yang melanggar.
• Hapus akun dan data pribadi kapan saja dari Pengaturan, atau lewat halaman hapus akun kami.
• Media pesan dihapus otomatis dari server setelah masa simpan singkat.

PERHATIAN
• Pesan di grup, topik forum, dan Linimasa tidak dienkripsi ujung-ke-ujung agar dapat dicari dan dimoderasi. Jangan membagikan rahasia di sana.
• Jika kunci enkripsi hilang dan Anda tidak punya perangkat lain, pesan langsung lama tidak dapat dipulihkan. Pindahkan kunci ke perangkat lain sebelum mengganti atau menghapus aplikasi.
• Satu akun dapat dipakai di maksimal 2 perangkat.
• Untuk pengguna berusia 13 tahun ke atas.

Butuh bantuan atau ingin melaporkan masalah? Hubungi support@semanticdigital.id. Kebijakan Privasi: https://chat.wuzzhub.id/privacy
```

**Catatan rilis (Apa yang baru)** (249/500):
```
Versi 1.32.0: masuk sekarang lewat Google (akun lama tetap bisa memakai username). Ditambahkan pernyataan usia 13+ saat membuat akun, hapus akun, laporkan konten, dan blokir pengguna. Panggilan suara lebih andal. Terima kasih sudah membantu menguji!
```

### Panduan penulisan (jangan dilanggar; Play menolak klaim menyesatkan)
- Jangan membandingkan dengan WhatsApp/Telegram atau memakai nama merek lain. Jangan tulis "paling aman", "kelas industri", atau klaim yang tidak bisa dibuktikan.
- **E2EE hanya untuk pesan langsung.** Pesan grup/forum/Linimasa **tidak** E2EE; naskah di atas sengaja menyatakannya agar tidak menyesatkan.
- Jangan menjanjikan fitur yang belum ada (panggilan grup, video, panggilan saat layar mati yang andal). **AI Memory TIDAK boleh disebut di naskah toko dan catatan rilis Play**: fitur masih uji terbatas (tombol Memori hanya tampil untuk grup whitelist; reviewer dan penguji lain tidak melihatnya). Tambahkan hanya setelah `MEMORY_ENABLED_GROUPS=*`.
- Sebut batas 2 perangkat dan peringatan kunci hilang (sudah ada di bagian PERHATIAN).

### Aset grafis (yang perlu Anda siapkan)
| Aset | Spesifikasi | Status |
|---|---|---|
| Ikon aplikasi | 512x512 PNG 32-bit, maks 1 MB | **Sudah ada**: `mobile/assets/store/play-store-icon-512.png` (512x512, RGBA, 60 KB), sama dengan ikon peluncur aplikasi. (Catatan lama "placeholder" keliru: itu tentang set ikon antarmuka di `icons/registry.ts`, bukan ikon toko.) |
| Feature graphic | 1024x500 JPG/PNG 24-bit tanpa alfa | **Sudah ada**: `mobile/assets/store/feature-graphic-1024x500.png` (RGB, 112 KB; logo lengkap + "Chat, grup, dan panggilan suara. Pesan langsung terenkripsi ujung-ke-ujung."; dibuat 8 Okt 2026 dari `assets/logo-full.png`). Teks cocok dengan deskripsi singkat dan tidak menyebut AI Memory |
| Screenshot ponsel | minimal 2, disarankan 6-8, portrait 9:16 (disarankan 1080x1920) | **Sudah ada**: 12 PNG 720x1280 (rasio 9:16) di `~/wuzz-releases/screenshots-toko/` (di luar repo): login, daftar obrolan, DM E2EE, grup, info grup, forum, linimasa, pengaturan, legal, kunci E2EE, profil, Nomor Keamanan. Diambil di HP Realme dengan `wm size 720x1280` (kembalikan `wm size reset`). Resolusi 720 lolos batas minimum Play; bila Console menyarankan 1080x1920, ambil ulang di perangkat yang mendukung |
| (Opsional) Screenshot tablet | 7"/10" | tidak wajib |

Urutan screenshot yang disarankan: (1) daftar obrolan, (2) percakapan dengan lencana E2EE, (3) panggilan suara (timer berjalan), (4) grup/forum topik, (5) Linimasa komunitas,
(6) Nomor Keamanan / transfer kunci QR, (7) Pengaturan (menu Legal dan Hapus Akun terlihat), (8) profil dengan Blokir/Laporkan. Gunakan **akun demo** dan data fiktif; jangan tampilkan nama atau pesan orang sungguhan.
Rekam via adb: `adb exec-out screencap -p > shot.png` (lihat catatan alur build).

## 5. Terjemahan Inggris (opsional, bila ingin menambah bahasa)
**Short description** (71/80): `Chat, groups and voice calls. Direct messages are end-to-end encrypted.`

## 6. Daftar periksa sebelum mengirim ke Play
- [x] Alat moderasi **sudah live** (6 Okt 2026, `docs/plans/archived/28-10-2026-backlog-selesai/MODERATION_TOOL.md`). Tinggal pastikan SOP tinjauan harian disepakati dan janji `/child-safety` dapat dipenuhi.
- [ ] `support@semanticdigital.id` aktif (default kode sudah ini) dan `NEXT_PUBLIC_SUPPORT_EMAIL` di Vercel diisi bila ingin alamat lain (lalu rebuild frontend). Belum terverifikasi.
- [ ] Halaman `/privacy`, `/terms`, `/delete-account` terbuka dari jaringan luar (tanpa gate). Teks privasi sudah dicocokkan dengan produksi 7 Okt 2026 (retensi media 1 hari, pemroses netral-penyedia); **cocokkan sekali lagi dengan jawaban Data Safety saat mengisi Console**, dan perbarui keduanya bila penyedia infrastruktur berganti.
- [~] Akun demo peninjau `peninjau_play` dibuat 7 Okt 2026 (login password diuji lewat API, perangkat uji sudah dibersihkan). **Akun tanpa tautan Google DIBEKUKAN mulai 30 Okt 2026 23:59 WIB** (`GOOGLE_LINK_FREEZE=true`); pengecualiannya kini ada di kode (daftar putih `GOOGLE_LINK_FREEZE_EXEMPT`), tinggal diisi `peninjau_play` di `.env` VPS dan backend dideploy/di-restart. Belum dites login di build Play.
- [x] ~~Putuskan Crashlytics/Sentry~~ **Crashlytics dipilih, dipasang, diaktifkan di Firebase Console, dan terbukti menerima laporan (8 Okt 2026)**; jawaban 2.2 sudah memuatnya. Lihat `docs/CRASH_REPORTING.md` bagian 5.
- [x] Gerbang usia 13+ dipasang di aplikasi (7 Okt 2026; belum diuji visual di HP) sehingga klaim "13+" di Target audiens punya penegakan pernyataan diri.
- [ ] ⛔ **GERBANG: Data Safety diperbarui SEBELUM build Wuzz Grid (versionCode ≥ 74) dipromosikan ke Closed/Produksi** (rincian dan langkah di bagian 2.5). Closed testing sekarang masih build 72 (tanpa game).
- [ ] **Deploy frontend `/privacy`, `/terms`, `/delete-account` yang memuat Wuzz Grid** (diperbarui 26 Okt 2026; game sudah menyala di produksi). Lalu cocokkan jawaban Data Safety dengan 2.5.
- [ ] Cocokkan butir bertanda ⚠️ dengan teks pertanyaan terbaru di Console.
- [ ] Build rilis memakai `EXPO_PUBLIC_UPDATE_CHANNEL=play`; `PLAY_STORE_URL` backend sesuai paket; banner pembaruan APK dimatikan untuk channel Play (sudah di kode).
