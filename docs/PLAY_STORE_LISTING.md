# PLAY_STORE_LISTING.md — Draf Data Safety, Deklarasi, dan Naskah Toko

> **Status: DRAF per 5 Okt 2026**, disusun dari kode (izin manifest, tabel data, penyedia pihak ketiga). Belum dimasukkan ke Play Console
> (akun masih diverifikasi). Formulir Play berubah dari waktu ke waktu: **cocokkan setiap isian dengan pertanyaan yang tampil di Console**
> dan tandai bagian bertanda ⚠️ sebelum mengirim. Bila kode berubah (mis. menambah Crashlytics/Sentry, lokasi, kontak), perbarui dokumen ini.
> Sumber kebenaran isi privasi: `frontend/app/privacy/page.tsx`. Jawaban di formulir **tidak boleh bertentangan** dengan halaman itu.

---

## 1. Fakta dasar (dari kode)
- Paket `com.wuzzchat.mobile`; kategori **Komunikasi** (Communication).
- **Tidak ada**: iklan, SDK analitik/pelacak, izin lokasi, akses kontak/buku telepon, pembelian dalam aplikasi, pembayaran.
- Izin di manifest hasil merge: `INTERNET`, `ACCESS_NETWORK_STATE`, `RECORD_AUDIO`, `CAMERA`, `POST_NOTIFICATIONS`, `MODIFY_AUDIO_SETTINGS`, `VIBRATE`, `WAKE_LOCK`,
  `RECEIVE_BOOT_COMPLETED`, `READ_APP_BADGE` (badge ikon, dari expo-notifications), `USE_BIOMETRIC`/`USE_FINGERPRINT` (dari expo-secure-store),
  `BLUETOOTH` (<= Android 11), `READ/WRITE_EXTERNAL_STORAGE` (<= Android 12L). Tidak ada Foreground Service, `SYSTEM_ALERT_WINDOW`, `READ_MEDIA_*`, SMS, log panggilan, atau lokasi.
  Foto dipilih lewat pemilih foto sistem (tanpa izin media).
- Pihak ketiga yang menerima data: **Google Firebase Cloud Messaging** (token perangkat dan isi notifikasi), **Groq** (teks pesan **hanya** dari topik forum terbuka untuk AI Memory),
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
| Info pribadi | **ID pengguna** (username, ID akun) | Ya | Tidak | Fungsi aplikasi, Manajemen akun, Keamanan | |
| Info pribadi | **Info pribadi lain** (bio, pesan status, tautan sosial opsional) | Ya | Tidak | Fungsi aplikasi | **Opsional** |
| Pesan | **Pesan lain dalam aplikasi** | Ya | Tidak ⚠️ | Fungsi aplikasi | Pesan grup/forum tersimpan terbaca di server; pesan langsung tersimpan sebagai teks sandi (E2EE) |
| Foto dan video | **Foto** (gambar kiriman, avatar) | Ya | Tidak | Fungsi aplikasi | Media dihapus otomatis 24 jam (DM) / 7 hari (grup); avatar opsional |
| Audio | **Pesan suara / file audio** | Ya | Tidak | Fungsi aplikasi | Hanya pesan suara yang dikirim; **panggilan tidak direkam** |
| File dan dokumen | **File dan dokumen** | Ya | Tidak | Fungsi aplikasi | Lampiran yang dikirim pengguna |
| Aktivitas aplikasi | **Konten buatan pengguna lain** (postingan, komentar, suka, laporan, blokir) | Ya | Tidak | Fungsi aplikasi, Keamanan | |
| Aktivitas aplikasi | **Interaksi aplikasi** | Ya | Tidak | Fungsi aplikasi | Hanya status sesi/perangkat; tanpa analitik |
| App info dan kinerja | **Log kerusakan** dan **Diagnostik** (Firebase Crashlytics: jenis/model perangkat, versi OS/aplikasi, jejak kesalahan, ID akun acak) | Ya | Tidak ⚠️ | Analitik, Fungsi aplikasi (memperbaiki crash) | Crashlytics dipasang 5 Okt 2026; lihat `docs/CRASH_REPORTING.md`. Pengumpulan hanya pada build rilis |
| ID perangkat/lainnya | **ID perangkat atau ID lain** (ID perangkat dibuat aplikasi, token FCM, alamat IP pada sesi) ⚠️ | Ya | Tidak ⚠️ | Fungsi aplikasi (notifikasi), Keamanan (pembatasan 2 perangkat, pencabutan sesi) | Cek panduan Google terkini soal alamat IP |
| Kontak | (tidak dideklarasikan) ⚠️ | - | - | - | Daftar teman hanya di dalam aplikasi; tidak membaca buku telepon. Bila Console menanyakan, relasi teman dapat dianggap "Konten pengguna lain" |

**Tidak dikumpulkan:** lokasi, email ⚠️ (aplikasi tidak meminta email), nomor telepon, info keuangan, kesehatan, riwayat penjelajahan, riwayat pencarian di server.
Crashlytics **sudah dipasang** (baris Log kerusakan/Diagnostik di atas) dan `/privacy` sudah diperbarui. Bila menambah SDK atau data baru, perbarui tabel ini dan `/privacy`.

### 2.3 Soal "dibagikan" ⚠️
Play tidak menghitung pengiriman data ke **penyedia layanan yang memprosesnya atas nama Anda** sebagai "berbagi". FCM (notifikasi), Groq (ringkasan AI Memory), dan penyedia infrastruktur
termasuk kategori itu, sehingga jawaban "Tidak dibagikan" dapat dipertanggungjawabkan, **asalkan** halaman `/privacy` menyebutkan mereka (sudah). Verifikasi definisi terkini di Console;
bila ragu, lebih aman mendeklarasikan "Dibagikan" untuk Pesan (Groq, hanya teks forum terbuka).

### 2.4 Praktik keamanan dan retensi (isi kolom tambahan bila ada)
- Data dienkripsi saat transit; kata sandi disimpan sebagai hash bcrypt.
- Penghapusan: akun, profil, kata sandi, sesi, perangkat, token push, kunci publik, relasi pertemanan, keanggotaan grup, pesan, postingan, komentar, suka dihapus segera;
  media menunggu pembersihan otomatis (maks 24 jam/7 hari); salinan cadangan sampai rotasi berikutnya ⚠️ (cocokkan dengan fakta cadangan produksi).
- Laporan moderasi dapat disimpan seperlunya untuk keamanan.

## 3. Deklarasi lain di Play Console
| Bagian | Jawaban yang disarankan |
|---|---|
| **Akses aplikasi** | Aplikasi memerlukan login. Berikan **akun uji khusus peninjau** (buat akun demo, mis. `reviewer_wuzz`, dengan sandi kuat) beserta petunjuk: "Login lalu buka tab Obrolan". **Jangan** pakai akun nyata. |
| **Iklan** | Tidak ada iklan |
| **Target audiens** | **13+** (pilih 13-15, 16-17, 18+); bukan untuk anak di bawah 13 (selaras dengan Syarat Layanan) |
| **Rating konten (IARC)** | Kategori *Komunikasi/Jejaring sosial*. Jawab: pengguna berinteraksi **Ya**; berbagi konten buatan pengguna **Ya**; berbagi lokasi **Tidak**; pembelian digital **Tidak**; konten dewasa/kekerasan **Tidak ada dari aplikasi** (konten dari pengguna dimoderasi lewat laporan dan blokir). Perkiraan hasil: Remaja (Teen)/12+ |
| **Fitur keuangan, kesehatan, berita, pemerintah** | Tidak ada |
| **Izin sensitif** | Tidak ada yang memerlukan formulir deklarasi khusus (tidak ada SMS, log panggilan, lokasi, semua-berkas, Foreground Service, atau aksesibilitas) |
| **Standar keselamatan anak** ⚠️ | Halaman publik **`https://chat.wuzzhub.id/child-safety`** sudah dibuat (larangan CSAE, batas usia 13+, pelaporan dalam aplikasi dan email, tindakan, kontak). Bila Console menampilkan formulir ini, tempel URL itu dan kontak `support@wuzzhub.id`. **Pastikan Anda sanggup memenuhi janji di halaman itu** (laporan keselamatan anak ditinjau prioritas tertinggi, pelaporan ke pihak berwenang) |
| **Kebijakan privasi** | `https://chat.wuzzhub.id/privacy` |
| **Penghapusan akun** | `https://chat.wuzzhub.id/delete-account` |
| **Kontak developer** | Email `support@wuzzhub.id` (**pastikan aktif**), situs `https://chat.wuzzhub.id` |
| **Enkripsi/ekspor** | Aplikasi memakai E2EE (P-256/AES-GCM); standar, tidak ada pertanyaan ekspor khusus di Play |

## 4. Naskah halaman toko (Bahasa Indonesia, bahasa utama)

**Nama aplikasi** (8/30): `WuzzChat`

**Deskripsi singkat** (75/80):
```
Chat, grup, dan panggilan suara. Pesan langsung terenkripsi ujung-ke-ujung.
```

**Deskripsi lengkap** (1726/4000):
```
WuzzChat adalah aplikasi percakapan untuk individu, tim, dan komunitas: kirim pesan, buat grup, dan telepon langsung dari satu aplikasi.

FITUR UTAMA
• Pesan langsung terenkripsi ujung-ke-ujung (E2EE). Kunci enkripsi tersimpan di perangkat Anda, sehingga server tidak dapat membaca isi pesan langsung.
• Grup dan topik forum: ngobrol dengan banyak orang, balas pesan tertentu, sematkan pesan penting, dan atur peran admin.
• Panggilan suara satu lawan satu.
• Pesan suara, foto, dan berkas.
• Linimasa komunitas: bagikan postingan, beri komentar, dan suka.
• Teman dan akun privat: kendalikan siapa yang boleh mengirim pesan atau menelepon Anda.
• Verifikasi Nomor Keamanan dan pemindahan kunci lewat kode QR antar perangkat Anda.
• Ringkasan pengetahuan (AI Memory) untuk topik forum terbuka. Ringkasan hanya terbit setelah disetujui admin, dan pesan langsung tidak pernah dibaca AI.

PRIVASI DAN KENDALI ANDA
• Tanpa iklan dan tanpa pelacak pihak ketiga.
• Blokir pengguna dan laporkan pesan, postingan, komentar, atau akun yang melanggar.
• Hapus akun dan data pribadi kapan saja dari Pengaturan, atau lewat halaman hapus akun kami.
• Media pesan dihapus otomatis dari server setelah masa simpan singkat.

PERHATIAN
• Pesan di grup, topik forum, dan Linimasa tidak dienkripsi ujung-ke-ujung agar dapat dicari dan dimoderasi. Jangan membagikan rahasia di sana.
• Jika kunci enkripsi hilang dan Anda tidak punya perangkat lain, pesan langsung lama tidak dapat dipulihkan. Pindahkan kunci ke perangkat lain sebelum mengganti atau menghapus aplikasi.
• Satu akun dapat dipakai di maksimal 2 perangkat.

Butuh bantuan atau ingin melaporkan masalah? Hubungi support@wuzzhub.id. Kebijakan Privasi: https://chat.wuzzhub.id/privacy
```

**Catatan rilis (Apa yang baru)** (221/500):
```
Versi ini memperbaiki panggilan suara: koneksi lebih andal dan status "Menyambungkan audio" ditampilkan dengan jujur. Ditambahkan juga hapus akun, laporkan konten, dan blokir pengguna. Terima kasih sudah membantu menguji!
```

### Panduan penulisan (jangan dilanggar; Play menolak klaim menyesatkan)
- Jangan membandingkan dengan WhatsApp/Telegram atau memakai nama merek lain. Jangan tulis "paling aman", "kelas industri", atau klaim yang tidak bisa dibuktikan.
- **E2EE hanya untuk pesan langsung.** Pesan grup/forum/Linimasa **tidak** E2EE; naskah di atas sengaja menyatakannya agar tidak menyesatkan.
- Jangan menjanjikan fitur yang belum ada (panggilan grup, video, panggilan saat layar mati yang andal).
- Sebut batas 2 perangkat dan peringatan kunci hilang (sudah ada di bagian PERHATIAN).

### Aset grafis (yang perlu Anda siapkan)
| Aset | Spesifikasi | Status |
|---|---|---|
| Ikon aplikasi | 512x512 PNG, maks 1 MB | ⚠️ ikon mobile masih placeholder (menunggu SVG buatan Anda) |
| Feature graphic | 1024x500 JPG/PNG | belum |
| Screenshot ponsel | minimal 2, disarankan 6-8, portrait 1080x1920 (rasio 9:16) | belum |
| (Opsional) Screenshot tablet | 7"/10" | tidak wajib |

Urutan screenshot yang disarankan: (1) daftar obrolan, (2) percakapan dengan lencana E2EE, (3) panggilan suara (timer berjalan), (4) grup/forum topik, (5) Linimasa komunitas,
(6) Nomor Keamanan / transfer kunci QR, (7) Pengaturan (menu Legal dan Hapus Akun terlihat), (8) profil dengan Blokir/Laporkan. Gunakan **akun demo** dan data fiktif; jangan tampilkan nama atau pesan orang sungguhan.
Rekam via adb: `adb exec-out screencap -p > shot.png` (lihat catatan alur build).

## 5. Terjemahan Inggris (opsional, bila ingin menambah bahasa)
**Short description** (71/80): `Chat, groups and voice calls. Direct messages are end-to-end encrypted.`

## 6. Daftar periksa sebelum mengirim ke Play
- [ ] Proses moderasi nyata tersedia (alat moderasi: `docs/plans/backlog/MODERATION_TOOL.md`) dan SOP disepakati; janji `/child-safety` dapat dipenuhi.
- [ ] `support@wuzzhub.id` aktif dan `NEXT_PUBLIC_SUPPORT_EMAIL` di Vercel diisi (lalu rebuild frontend).
- [ ] Halaman `/privacy`, `/terms`, `/delete-account` terbuka dari jaringan luar (tanpa gate), dan teks privasi cocok dengan jawaban Data Safety.
- [ ] Akun demo peninjau dibuat dan dites login di build Play.
- [ ] ~~Putuskan Crashlytics/Sentry~~ **Crashlytics dipilih dan dipasang** (jawaban 2.2 sudah memuatnya); aktifkan Crashlytics di Firebase Console (lihat `docs/CRASH_REPORTING.md` bagian 4).
- [ ] Cocokkan butir bertanda ⚠️ dengan teks pertanyaan terbaru di Console.
- [ ] Build rilis memakai `EXPO_PUBLIC_UPDATE_CHANNEL=play`; `PLAY_STORE_URL` backend sesuai paket; banner pembaruan APK dimatikan untuk channel Play (sudah di kode).
