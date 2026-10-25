# Game Harian "Wuzz Grid" — Rancangan

> **Status (26 Okt 2026):** rancangan hasil diskusi 25 Okt. **Tahap 1** (penyelesai, pembuat puzzle; commit 4a34329), **tahap 2** (tabel, endpoint, sakelar `GAME_ENABLED`, hapus akun; 535ba39) dan **tahap 3** (mobile: kartu, layar permainan, hasil; 7e65571, perbaikan 1dd500f) selesai di `main` dan **teruji di HP Realme Android 11**. **Tahap 4** (papan skor teman/grup, indikator pembeku) selesai dan teruji di HP (9259e54, d83b028). **Tahap 5** (papan publik opt-in, moderasi staf, laporan) selesai dan teruji di HP dengan dua akun (c06f251). **Tahap 6 sedang berjalan**: teks privasi/syarat/hapus-akun dan draf Data Safety selesai di `dev` (belum di-commit, belum di-deploy); pengingat harian belum. Dikerjakan di branch `dev`, di balik sakelar mati.
> **Aturan kerja:** deploy backend/frontend dan build APK dilakukan pengguna. Jangan menaikkan versi/build number. Tidak ada `git commit` sebelum pengguna menyatakan "selesai", dan tidak ada `git push` tanpa persetujuan tertulis terpisah.
> **Tujuan:** membuat pengguna betah lewat fitur di luar chat: satu puzzle logika per hari, dengan streak dan papan skor sosial. Sasaran: milenial dan Gen Z.

---

## 1. Keputusan yang sudah disepakati

| Topik | Keputusan |
|---|---|
| Bentuk | Game puzzle harian dulu; kuis pengetahuan belakangan |
| Puzzle | Grid logika (aturan seperti Queens): satu bintang per baris, kolom, dan wilayah; bintang tidak boleh bersentuhan termasuk diagonal |
| Ukuran | 6×6 sampai 9×9, mengikuti hari dalam minggu. Tata letak harus fleksibel (lihat bagian 6) |
| Platform | Mobile dulu |
| Pintu masuk | Kartu "Puzzle hari ini" di atas Feed, lalu layar penuh. Naik jadi tab sendiri bila terbukti dipakai |
| Percobaan | Ulang bebas; waktu tetap berjalan dari percobaan pertama |
| Arsip puzzle lama | Bukan tahap pertama; kandidat fitur Pro |
| Papan skor | Teman dan grup selalu ada; publik **opt-in** (default mati), reset harian/mingguan |
| Tampilan skor teman | Menampilkan waktu |
| Hadiah | Kosmetik saja (lencana, bingkai). Tidak bisa ditukar menjadi kuota Free/Pro |
| Iklan | Layar game bebas iklan. Rewarded ad opsional hanya mungkin belakangan, lewat sakelar server |
| Nama fitur | **Wuzz Grid** (boleh disesuaikan selama informatif) |

### Streak
- Yang dihitung: **menyelesaikan puzzle**.
- **1 pembeku gratis per minggu**, terpakai otomatis bila terlewat sehari.
- Hari baru mengikuti **jam lokal pengguna**.
- Pengingat **opsional**, bernada netral, tidak menakut-nakuti.

## 2. Kecocokan dengan rencana lain

Diperiksa terhadap [`ADS_AND_REWARDS_PLAN.md`](ADS_AND_REWARDS_PLAN.md) (bagian 13):
- Tidak ada batas Free/Pro baru, tidak ada kuota, tidak menyentuh langit-langit hadiah (bagian 4).
- Tidak ada poin yang bisa ditukar menjadi manfaat berbayar; ledger poin (bagian 11) tidak dipakai.
- Tidak ada iklan di game. Kartu masuk di Feed tidak boleh berdampingan dengan iklan native sehingga tampak seperti iklan.
- Biaya server kecil (puzzle dibuat kode, tanpa LLM, tanpa media).
- Bila nanti ada hadiah yang berbentuk manfaat (bukan kosmetik) atau opsi "pulihkan streak lewat iklan/poin", **berhenti dan putuskan bersama pengguna**, lalu perbarui kedua dokumen.

## 3. Backend: domain `internal/game`

Mengikuti pola `feed` dan `connection`: `entity.go`, `repository.go`, `service.go`, `service_test.go`, `infra/sql_repository.go`. Tambahan murni tanpa DB: `generator.go`, `solver.go`. Tabel dibuat lewat `CREATE TABLE IF NOT EXISTS` di `store/sql.go`. Semua endpoint memakai `auth.RequireJWT()` dan `tenantID`.

### 3.1 Tabel

| Tabel | Kolom penting | Fungsi |
|---|---|---|
| `game_puzzles` | `puzzle_date` (PK, **tanggal kalender lokal pengguna** `YYYY-MM-DD`), `size`, `regions` (JSON), `solution` (JSON), `seed`, `difficulty` | Satu puzzle per tanggal, dibuat di muka |
| `game_attempts` | `tenant_id`, `user_id`, `puzzle_date`, `started_at`, `solved_at`, `duration_ms`, `mistakes`, `status` (`playing`/`solved`/`suspicious`) | Satu baris per pengguna per puzzle; `UNIQUE(tenant_id, user_id, puzzle_date)` |
| `game_streaks` | `tenant_id`, `user_id`, `current`, `best`, `last_solved_local_date`, `freezes_available`, `freeze_week` | Status streak |
| `game_settings` | `tenant_id`, `user_id`, `leaderboard_public` (default `false`), `reminder_enabled` (default `false`), `tz`, `tz_changed_at` | Preferensi pengguna |

`solution` **tidak pernah dikirim ke klien**. `regions` dikirim untuk menggambar grid. Indeks papan skor: `(tenant_id, puzzle_date, duration_ms)`.

> **Keputusan implementasi (tahap 2):** karena hari baru mengikuti jam lokal, puzzle dikunci pada tanggal lokal pengguna, bukan tanggal UTC. Pemain di WIB mendapat puzzle baru pukul 00.00 WIB, pemain di Los Angeles pukul 00.00 PST; ukuran grid mengikuti hari dalam minggu pada tanggal itu. Zona waktu default `Asia/Jakarta` sampai klien menyimpan zona perangkat lewat `PUT /api/game/settings`. Kolom di DB: `current_streak`, `best_streak`, `tz`, `tz_changed_at` (bukan `current`/`best`/`tz` polos).

### 3.2 Pembuat dan penyelesai puzzle
- Input: seed dari tanggal; ukuran dari hari dalam minggu (6×6 awal minggu sampai 9×9 akhir minggu).
- Langkah: taruh bintang sah, bentuk wilayah di sekitarnya, jalankan penyelesai untuk memastikan **solusi unik**; bila tidak unik, ganti seed dan ulangi.
- Tahap 2: puzzle dibuat saat diminta pertama kali (rata-rata 9×9 sekitar 31 ms, terburuk sekitar 210 ms; hasil disimpan sehingga pemanggil berikutnya membaca dari DB). **Worker pembuatan di muka belum dibuat**; tambahkan bila kelak terasa perlu (pola `subgroup_ttl_worker`).
- **Keunikan solusi adalah bagian paling berisiko**; dikerjakan dan diuji lebih dulu (tahap 1).

### 3.3 Endpoint (`/api/game/`, didaftarkan di `app/router.go` seperti `/api/feed`)

| Method | Path | Fungsi |
|---|---|---|
| GET | `/api/game/today` | Puzzle hari ini (tanpa solusi), status percobaan, streak, `enabled` |
| POST | `/api/game/today/start` | Mulai percobaan; `started_at` dicatat server (idempoten) |
| POST | `/api/game/today/submit` | Kirim penempatan bintang; server memeriksa dan mengisi `solved_at` |
| GET | `/api/game/leaderboard?scope=friends\|group\|public&group_id=&period=day\|week` | Papan skor (**tahap 4**, belum ada) |
| GET/PUT | `/api/game/settings` | Papan publik, pengingat, zona waktu |

### 3.4 Penilaian dan anti-curang
- `duration_ms = solved_at - started_at`, dihitung server; waktu tidak dikirim klien.
- Waktu mustahil (di bawah ambang penyelesai manusia untuk ukuran itu) → `suspicious`, tidak masuk papan.
- Batas laju pada `submit` untuk mencegah tebak-tebakan brute force.

### 3.5 Streak
- Saat `solved`: hitung tanggal lokal dari `tz`. Kemarin → `current++`; hari ini → tetap; lebih lama dan ada pembeku → pakai pembeku; selain itu `current = 1`.
- Pembeku di-reset per minggu lokal.
- `tz` divalidasi sebagai nama IANA; perubahan dibatasi (sekali sehari) agar tidak dipakai memperpanjang streak.

### 3.6 Papan skor dan privasi
- `friends`: koneksi `accepted`, **mengecualikan `blocked` dua arah** (kueri mengikuti `user_connections`).
- `group`: hanya anggota grup yang sama.
- `public`: hanya `leaderboard_public = true`; blokir tetap berlaku; maksimum 50 teratas per hari/minggu.
- Nama yang tampil = nama profil yang sudah ada (tidak ada nama baru yang perlu dimoderasi).

### 3.7 Sakelar
- `GAME_ENABLED` (default **mati**). Mati → endpoint mengembalikan "fitur nonaktif", klien menyembunyikan kartu. `today` membawa `enabled` sehingga klien tidak menanam aturan.
- Tenant non-default mengikuti pola monetisasi forum (tidak ikut dibatasi, kecuali diputuskan lain).

### 3.8 Penghapusan akun dan moderasi
- `store/account_eraser.go` wajib menghapus baris `game_*` milik pengguna (syarat Play untuk hapus akun).
- `/admin`: kemampuan menyembunyikan entri papan atau mengeluarkan pengguna dari papan publik (boleh belakangan, tahap 5).
- Entri papan publik bisa dilaporkan lewat alur laporan yang ada.

## 4. Mobile

**API:** `src/api/game.ts` (pola `feedApi.ts`), tipe di `types.ts`.

**Komponen**
- `GameEntryCard` di atas `FeedScreen`: tiga keadaan (belum dimainkan / sedang berjalan / selesai + waktu + streak). Hilang bila `enabled = false`.
- `GameScreen` (layar penuh dalam stack, bukan tab): grid, penghitung waktu, hapus/ulang, periksa.
- `GameResultSheet` memakai `BottomSheetModal`: waktu, streak, papan teman, bagikan.
- `GameLeaderboard`: tab Teman · Grup · Publik.
- Bagian pengaturan Game: papan publik, pengingat, zona waktu.

**Interaksi grid:** ketuk sekali = "X", dua kali = bintang, tiga kali = kosong. Konflik (sebaris dua bintang, bersentuhan) disorot lokal untuk umpan balik cepat; validasi final di server.

**Ketahanan jaringan:** `AbortController`; keadaan permainan disimpan lokal (write-through) agar bertahan setelah aplikasi ditutup; `submit` yang gagal disimpan lalu dikirim ulang. Waktu dihitung server dari `started_at`, jadi koneksi buruk tidak merugikan pemain.

**Berbagi:** teks "Wuzz Grid #N · 1:42 · 🔥4" lewat `Share`; gambar grid kecil menyusul.

**Pengingat:** notifikasi lokal opsional, satu per hari, teks netral. Jadwal dikelola klien (tanpa infrastruktur server baru).

## 5. Hal yang tidak dilakukan di tahap awal
Petunjuk berbayar, arsip puzzle lama, tantangan 1 lawan 1, kuis dari obrolan grup (privasi + biaya LLM), poin atau hadiah berbentuk manfaat.

## 6. Kompatibilitas perangkat (Android 11 sampai terbaru)

Syarat desain, bukan sekadar harapan:
- **Ukuran sel dihitung dari lebar layar dan ukuran grid**, bukan angka tetap; 9×9 harus tetap bisa diketuk (target sentuh ≥ ~40dp bila memungkinkan) di layar kecil. Bila layar terlalu sempit, kurangi padding sebelum mengecilkan sel.
- Hormati **skala font sistem** (font scale besar) pada teks di luar grid; angka/ikon di dalam grid tidak boleh terpotong.
- Hindari API yang hanya ada di Android baru; animasi ringan dan bisa dimatikan (hormati pengaturan "kurangi gerak").
- Kontras warna wilayah harus cukup, dan **tidak bergantung pada warna saja** (tambahkan pola/nomor pada wilayah) demi pengguna buta warna.
- Perhatikan **tambalan teks terpotong Android 16** (`androidTextFix`, lihat catatan 1.30.0) dan tepi layar/notch pada perangkat baru.
- Uji di minimal: perangkat Android 11 (kelas bawah), Infinix Android 16 yang sudah dipakai, dan satu layar kecil. Rencana uji ada di tahap 3.

## 7. Tahap kerja

| Tahap | Isi | Keluaran |
|---|---|---|
| 1 | Penyelesai, pembuat puzzle, dan uji (unik, ukuran 6–9, deterministik) | Logika inti terbukti |
| 2 | Tabel, repository, service, endpoint, sakelar, uji Postgres | Backend siap di balik sakelar mati |
| 3 | Mobile: kartu, layar permainan, hasil; uji di Android 11 dan terbaru | Bisa dimainkan sendiri |
| 4 | Papan teman dan grup, streak, pembeku | Aspek sosial |
| 5 | Papan publik opt-in, laporan, moderasi, penghapusan akun, berbagi | Siap rilis |
| 6 | Pengingat, dokumen, privasi (Data safety Play) | Rilis |

Pengujian wajib tiap tahap: `go test -v ./...` (backend), `npx tsc --noEmit` (mobile), `npm run build` (frontend bila tersentuh). Mengingat catatan lama: uji yang butuh Postgres punya jebakan tersendiri.

## 8. Risiko dan hal terbuka
- **Keunikan solusi:** penyelesai salah → puzzle ambigu. Karena itu tahap 1 berdiri sendiri.
- **Data safety Play:** skor, waktu, dan papan publik harus masuk deklarasi data dan kebijakan privasi (tahap 6).
- **Usia pengguna:** papan publik berkaitan dengan rencana gerbang usia yang masih terbuka; putuskan bersama sebelum tahap 5.
- **Streak terlalu menekan:** pantau umpan balik; pembeku dan pengingat opsional adalah penahannya.
- **Bentrok dengan rencana iklan:** lihat bagian 2.
- **Terbuka:** bentuk hadiah kosmetik, gambar bagikan, kapan naik menjadi tab sendiri (usulan pemicu: sebagian besar pemain aktif membuka game hampir tiap hari selama beberapa minggu).

## 9. Catatan implementasi tahap 3 (mobile)

- Berkas: `src/api/gameApi.ts`, `src/utils/gameBoard.ts` (logika murni, dites di `scripts/test/game-board.test.js`), `src/services/gameStorage.ts`, `src/hooks/useGameToday.ts`, `src/components/game/{GameGrid,GameEntryCard,GameResultSheet}.tsx`, `src/screens/GameScreen.tsx`; rute `Game` di `navigation/`; kartu dipasang sebagai `ListHeaderComponent` `FeedScreen`.
- Tanpa dependensi native baru: build APK biasa sudah cukup.
- Zona waktu perangkat disinkronkan ke server sekali tiap berubah (`PUT /api/game/settings`) sebelum puzzle ditampilkan; bila server menjawab 409 (terkunci 24 jam) tidak diulang sampai zona perangkat berubah lagi.
- Papan disimpan lokal satu kunci per pengguna (ditimpa tiap hari). Jawaban dikirim otomatis sekali per papan sah; gagal kirim memunculkan tombol "Kirim ulang".
- Bintang dan X berupa ikon vektor (bukan emoji) agar aman dari masalah teks terpotong Android 16; nomor wilayah ditulis di sel pertama tiap wilayah (tidak bergantung warna); tidak ada animasi.
- Ukuran sel = lebar layar / ukuran grid (maks 52dp). Pada lebar 320dp, 9×9 menghasilkan sel 32dp (lebih kecil dari target 40dp); perlu dinilai di perangkat kecil.
- **Belum teruji di perangkat:** tampilan tema terang/gelap, ketepatan sentuh 9×9 di layar kecil, Android 11, Infinix Android 16, skala font besar, dan alur jaringan putus.

## 10. Catatan implementasi tahap 4 (papan skor)

- Endpoint: `GET /api/game/leaderboard?scope=friends|group&group_id=grp_...&period=day|week` (periode bawaan `day`). Papan publik (opt-in) belum ada (tahap 5).
- **Hanya penyelesaian `solved` yang dihitung**; `suspicious` dan percobaan yang belum selesai tidak tampil.
- **Teman** = pemanggil + koneksi `accepted` (arah relasi tidak berpengaruh). **Grup** = anggota grup induk `grp_` tersebut; pemanggil wajib anggota (403 bila bukan); forum `sub_` dan obrolan langsung ditolak (400).
- **Blokir dua arah:** pengguna yang berhubungan `blocked` dengan pemanggil (siapa pun yang memblokir) tidak tampil di papan pemanggil.
- **Periode:** hari = tanggal lokal pemanggil; minggu = Senin sampai hari ini (lokal pemanggil). Urutan hari = waktu tercepat; urutan minggu = jumlah hari selesai terbanyak, lalu total waktu tersingkat. Hasil persis sama berperingkat sama. Maksimum 50 baris; baris pemanggil bisa terpotong bila di luar 50 teratas (belum ditangani).
- Mobile: `GameLeaderboard` (tab Teman/Grup, Hari ini/Minggu ini, pilihan grup dari daftar obrolan `grp_`) di bawah grid pada `GameScreen`; lencana pembeku di samping streak.
- Teruji di SQLite dan Postgres 16 (7 tes papan + tes HTTP). Belum diuji di HP: tampilan papan, urutan grup, tampilan dengan banyak teman, dan font besar.

## 11. Catatan implementasi tahap 5 (papan publik dan moderasi)

**Keputusan (26 Okt 2026):** papan publik **opt-in (default mati)** dan hanya menampilkan **@username + hasil**; nama tampilan dan foto profil tidak ditampilkan (gerbang usia hanya pernyataan 13+). Berbagi hasil tetap **teks saja**: gambar grid membocorkan letak bintang, dan gambar kartu butuh modul native baru.

- `GET /api/game/leaderboard?scope=public&period=day|week`: hanya pengguna dengan `leaderboard_public = true` dan belum dikeluarkan staf. Siapa pun boleh melihat papan; pemanggil yang belum opt-in tidak ikut tampil. **Privasi ditegakkan di server**: `display_name` dan `avatar_url` dikosongkan pada scope publik (ada tesnya). Blokir dua arah tetap berlaku; terbatas per tenant.
- **Moderasi:** tabel `game_board_hides` (pengguna dikeluarkan dari papan publik; akun tidak disentuh) dan `game_board_audit` (append-only: hide/show, pelaku, catatan). Endpoint staf `GET|POST /api/admin/users/{id}/game-board` (`{hidden, note}`; catatan wajib saat mengeluarkan; berlaku walau game sedang dimatikan). Tombol "Keluarkan dari / Kembalikan ke papan publik" di `/admin/users/[id]` (perlu deploy frontend). Dikeluarkan dari papan publik tidak memengaruhi papan teman/grup.
- **Laporan:** baris papan publik (bukan baris sendiri) punya ikon peringatan yang membuka `ReportModal` dengan target `user` (alur laporan yang sudah ada, tanpa jenis target baru). Dari laporan itu staf bisa menangguhkan akun atau mengeluarkan dari papan publik.
- **Hapus akun** kini juga menghapus `game_board_hides` dan `game_board_audit`.
- Mobile: tab Publik di `GameLeaderboard` dengan sakelar "Tampilkan saya di papan publik" (penjelasan: hanya @username dan waktu yang terlihat, bisa dimatikan kapan saja).
- Teruji di SQLite dan Postgres 16 (3 tes papan publik, 2 tes rute moderasi, tes hapus akun diperluas). `npm run build` frontend lulus.
- **Belum teruji di HP / admin:** tab Publik, sakelar opt-in, laporan baris, dan tombol di halaman admin (baru terlihat setelah deploy frontend).
- **Untuk tahap 6:** deklarasi Data safety Play dan kebijakan privasi perlu menyebut skor, waktu, @username pada papan publik opt-in, dan jejak audit moderasi.

## 12. Catatan tahap 6 (privasi dan deklarasi)

- **Temuan 26 Okt 2026:** game sudah menyala di produksi (`GAME_ENABLED`) sebelum `/privacy` menyebut data game. Teks sudah diperbarui di repo; **perlu deploy frontend segera**.
- `frontend/app/privacy/page.tsx`: bagian 1 (data game, papan skor), 3 (penggunaan), 5 (penghapusan), 8 (anak-anak). `frontend/app/terms/page.tsx`: larangan memanipulasi game/papan skor dan hak mengeluarkan dari papan publik. `frontend/app/delete-account/page.tsx`: daftar data game yang dihapus. `LEGAL_EFFECTIVE_DATE` = 26 Oktober 2026.
- `docs/PLAY_STORE_LISTING.md` bagian 2.5 (baru), baris 2.2/2.4, dan butir checklist: draf jawaban Data Safety. Butir bertanda ⚠️ harus dicocokkan dengan pertanyaan terbaru di Console sebelum dikirim.
- **Diputuskan 26 Okt 2026 (opsi B):** pengguna dapat menyembunyikan hasilnya dari papan Teman dan Grup (`game_settings.hide_from_social`, bawaan tampil). Pemilik tetap melihat barisnya sendiri; papan Publik tidak terpengaruh (opt-in sendiri); streak tidak terpengaruh. Kolom ditambahkan lewat `ALTER ... ADD COLUMN IF NOT EXISTS` pada tabel yang sudah ada di produksi (ada tes migrasi, termasuk di Postgres). Mobile: sakelar di bawah papan skor (tab Teman/Grup). Teks `/privacy` dan draf Data Safety sudah disesuaikan.
- **Belum dikerjakan:** pengingat harian opsional (notifikasi lokal; tanpa data baru di server selain `reminder_enabled` yang sudah ada), dan dokumentasi API (`docs/BACKEND_API.md`, `docs/openapi.yaml`).
