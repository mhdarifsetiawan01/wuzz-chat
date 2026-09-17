# Decision Log

### DEC-001: Monorepo dengan Custom Proxy Server
- **Konteks:** Perlu menyembunyikan port/origin backend Go dari browser client demi keamanan & CORS.
- **Keputusan:** Menggunakan custom server Node.js (`server.js`) dengan `http-proxy` untuk menangkap upgrade WebSocket dan forward `/api/*` requests.
- **Status:** Diimplementasikan & Berfungsi.

### DEC-002: Multi-Driver Database Store dengan Supabase Pooler
- **Konteks:** Supabase direct host (`db.xxx.supabase.co`) memerlukan IPv6 yang sering gagal di jaringan IPv4 lokal.
- **Keputusan:** Menggunakan connection string Supabase **Session Pooler** (`aws-0-xxx.pooler.supabase.com:5432`) dengan auto-migration saat backend start.
- **Status:** Diimplementasikan & Berfungsi.

### DEC-003: JWT Authentication & WhatsApp-Grade 2-Column UI
- **Konteks:** Mengubah sistem dari obrolan anonim menjadi percakapan permanen antar user terdaftar.
- **Keputusan:** Menggunakan JWT token 7 hari, layout 2-kolom (Sidebar daftar chat + Chat window), dan Standby / Welcome Screen saat belum ada room yang dipilih.
- **Status:** Diimplementasikan & Berfungsi.

### DEC-004: Procedural Web Audio API Sound FX Synthesizer
- **Konteks:** Membutuhkan efek audio notifikasi pesan (kirim & terima) yang ringan, instan, dan bebas kegagalan jaringan atau file asset hilang.
- **Keputusan:** Menggunakan Web Audio API oscillator synthesis (`lib/sound.ts`) untuk menghasilkan suara nada *pop* (880Hz->320Hz) dan nada lonceng ganda *ding* (E5 + B5) tanpa memerlukan file MP3 eksternal.
- **Status:** Diimplementasikan & Berfungsi.

### DEC-005: Ephemeral Live Typing Protocol & Debounce Auto-Reset
- **Konteks:** Indikator mengetik (*"Alice sedang mengetik..."*) harus real-time tanpa membebani database ataupun bandwidth WebSocket.
- **Keputusan:** Event `TypeTyping` di-broadcast murni di memori Hub (tidak disimpan ke Database). Input client di-throttle 2 detik saat mengetik, dan recipient memiliki auto-reset timer 2.5 detik serta reset instan saat pesan baru diterima (`TypeMessage`).
- **Status:** Diimplementasikan & Berfungsi.

### DEC-006: Client-Side Live Snippet Dispatcher & Unread Count State
- **Konteks:** Sidebar percakapan harus mengupdate pesan terakhir, timestamp, dan badge belum dibaca secara live tanpa polling berulang ke database `/api/conversations`.
- **Keputusan:** State `lastIncomingMessage` di `page.tsx` diteruskan ke `Sidebar.tsx`. Setiap pesan masuk/terkirim seketika mengupdate state lokal daftar percakapan, menaikkan unread badge jika room tidak aktif dibuka, dan menggeser percakapan aktif ke urutan paling atas.
- **Status:** Diimplementasikan & Berfungsi.

### DEC-007: 4-Stage Weighted Message Receipt Transitions
- **Konteks:** Status tanda terima pesan (`pending` ➔ `sent` ➔ `delivered` ➔ `read`) memerlukan kepastian status tidak pernah menurun (*downgrade*) akibat latensi pengiriman atau keterlambatan ACK WebSocket.
- **Keputusan:** Menggunakan sistem bobot integer pada reducer frontend (`pending`: 0, `sent`: 1, `delivered`: 2, `read`: 3) sehingga update status hanya diaplikasikan jika nilai bobot lebih tinggi atau sama. Server Go melakukan auto-ACK `sent` ke pengirim, client penerima otomatis mengirim `delivered` receipt saat pesan sampai di socket, dan mengirim `read` receipt saat jendela obrolan aktif dibuka.
- **Status:** Diimplementasikan & Berfungsi.

### DEC-015: Zero-Knowledge Client-Side Decryption for Web Push
- **Konteks:** Notifikasi push pada payload Web Push RFC 8292 berisi ciphertext E2EE yang harus didekripsi di Service Worker tanpa membocorkan plaintext ke relay server.
- **Keputusan:** Service Worker membaca private key dari CacheStorage/IndexedDB dan mendekripsi payload AES-256-GCM secara lokal sebelum menampilkan notifikasi native ke OS.
- **Status:** Diimplementasikan & Berfungsi.

### DEC-016: E2EE Single Active Device & Key Conflict Guard (Opsi A)
- **Konteks:** Membuka aplikasi di perangkat ke-2 menimpa public key di server secara diam-diam sehingga fingerprint Safety Number berbeda antara desktop dan HP PWA.
- **Keputusan:** Menetapkan prinsip 1 device aktif dengan pelacakan `active_device_id` dan `key_version` di database. Backend menolak overwrite dari device berbeda dengan HTTP 409 Conflict (`KEY_ALREADY_REGISTERED`). Frontend menampilkan `DeviceConflictModal` yang memberi pilihan kepada user untuk membatalkan atau mereset sesi enkripsi ke perangkat baru secara sadar (`/api/users/public-key/reset`). Arsitektur ini forward-compatible dengan upgrade multi-device QR-link (Opsi B).
- **Status:** Diimplementasikan & Terverifikasi (100% Pass).

### DEC-017: QR Code E2EE Key Transfer (Opsi 2)
- **Konteks:** Menghindari kehilangan riwayat pesan atau perbedaan fingerprint saat berganti perangkat tanpa membocorkan private key ke server.
- **Keputusan:** Menggunakan mekanisme hybrid: Device aktif mengenkripsi keypair dengan AES-256-GCM (kunci PBKDF2 dari random 32-byte session token) dan mengunggah ciphertext ke tabel `device_transfer_sessions` (TTL 5 menit). Device baru memindai QR code, memanggil `/api/users/transfer/consume` yang secara atomik menandai `is_used = true` dan memindahkan `active_device_id` ke perangkat baru dalam 1 transaksi DB. Device baru mendekripsi ciphertext secara lokal dan menyimpan keypair ke IndexedDB tanpa merusak Zero-Knowledge.
- **Status:** Diimplementasikan & Berfungsi.

### DEC-018: Hard Conflict Blocker, In-App QR Scanner & Fail-Closed E2EE Guard
- **Konteks:** Ditemukan celah di mana penutupan modal konflik memungkinkan perangkat tanpa kunci mengakses chat dan mengirim pesan plaintext tanpa enkripsi. Selain itu, perangkat baru membingungkan user dengan tab "Buat QR" yang gagal serta ketiadaan pemindai kamera terintegrasi.
- **Keputusan:**
  1. Menjadikan modal konflik sebagai *hard blocker*: UI chat tidak dirender jika konflik belum diselesaikan, dan tombol keluar memaksa logout total.
  2. Menyembunyikan tab "Buat QR" pada perangkat baru (`hideGenerate=true`) dan menambahkan scanner kamera in-app (`html5-qrcode`) agar pemindaian QR dapat dilakukan langsung dari web app.
  3. Menerapkan *E2EE Fail-Closed Guard*: Pengiriman pesan pada direct room diblokir jika AES room key bernilai `null` (mencegah kebocoran plaintext).
  4. Backend WebSocket Hub memutuskan koneksi perangkat lama secara instan jika akun yang sama terhubung dari perangkat baru.
- **Status:** Disetujui & Siap Dieksekusi.

### DEC-019: Strict WebSocket E2EE Gatekeeper & Anti-Deadlock Conflict Mode
- **Konteks:** Ditemukan kondisi balapan (race condition) di mana browser HP yang baru login langsung membuka WebSocket dan menendang laptop keluar sebelum pemeriksaan kunci E2EE selesai. Selain itu, penolakan 409 pada perangkat baru salah diklasifikasikan sebagai `isRotated: true`, menyebabkan kedua perangkat terkunci dalam modal kuning buntu "Kunci Keamanan Telah Diperbarui".
- **Keputusan:**
  1. WebSocket di `page.tsx` wajib ditahan (`e2eeVerified === true`) sampai inisialisasi kunci lokal terkonfirmasi sah oleh server. Perangkat baru yang mengalami konflik tidak akan membuka socket, sehingga perangkat lama tidak pernah tertendang sia-sia.
  2. Saat inisialisasi awal di `keyStore.ts`, penolakan HTTP 409 Conflict diubah menjadi `isRotated: false` dan menghapus kunci lokal usang. Perangkat baru akan menampilkan modal konflik normal yang berisi opsi *"Reset & Masuk"* dan *"Pindah via QR Code"*, membebaskan pengguna dari deadlock loop.
- **Status:** Diimplementasikan & Terverifikasi (100% Pass).

### DEC-020: Mobile Nested Modal History Decoupling & Camera Gesture Safeguard
- **Konteks:** Di HP Android, mengklik tombol "Pindah Kunci via QR Code / Kode" tidak menampilkan aksi apapun. Analisis mengungkap bahwa hook `useModalBackHandler` di parent modal mengeksekusi `window.history.back()` saat state `!isTransferOpen` berubah, yang langsung ditangkap oleh modal transfer yang baru saja mount sehingga modal transfer tertutup seketika (< 10ms). Selain itu, nesting DOM di dalam parent backdrop ber-filter merusak stacking context di mobile browser, dan kamera scanner memerlukan direct user gesture.
- **Keputusan:**
  1. Menggunakan unified single-history controller pada `DeviceConflictModal` berbasis ref (`isTransferOpenRef`) dan menonaktifkan back handler internal pada `DeviceTransferModal` via `disableBackHandler={true}`.
  2. Memisahkan struktur DOM modal menggunakan React Fragment `<> ... </>` sehingga modal transfer memiliki stacking context `zIndex: 160` yang bersih dan independen.
  3. Menambahkan kontrol manual "📷 Buka Kamera Sekarang" dan "🔄 Coba Akses Kamera Lagi" untuk mematuhi Permissions Policy browser mobile (Android/Chrome).
- **Status:** Diimplementasikan & Terverifikasi (100% Pass).

### DEC-021: IndexedDB Persistent Decrypted Message Cache (Milestone 8.4)
- **Konteks:** Setelah lawan bicara (misal Alice) me-reset device E2EE dan mengunggah Public Key baru, seluruh pesan lama di layar penerima (Bob) yang dimuat ulang dari server berubah menjadi `🔒 [Pesan Terenkripsi - Tidak dapat didekripsi]` karena ciphertext lama tidak dapat didekripsi menggunakan keypair baru Alice. Selain itu, membuka ruang obrolan mengalami flash loading/blank sejenak sebelum query riwayat pesan selesai.
- **Keputusan:**
  1. Membuat database klien IndexedDB (`wuzzchat_msg_db`) dengan object store `messages` (keyPath: `id`) dan index `by_room` (`roomId, createdAt`) untuk persistensi pesan terdekripsi secara lokal di browser masing-masing pengguna.
  2. Menerapkan pola **Cache-First Load**: Saat ruang obrolan dibuka, pesan langsung dimuat instan (0ms) dari IndexedDB, kemudian sinkronisasi pesan baru dari server berjalan di latar belakang (write-through merge) tanpa menimpa pesan lama yang sudah terdekripsi.
  3. Menerapkan **Write-Through Cache** pada 6 titik mutasi data: penerimaan pesan baru (`ADD_MESSAGE`), pengiriman pesan sendiri (optimistic + confirmed sent), pembaruan tanda terima (`UPDATE_MESSAGE_STATUS`), penarikan pesan (`REVOKE_MESSAGE`), penghapusan pesan lokal (`DELETE_MESSAGE`), dan pembersihan percakapan (`CLEAR_MESSAGES` / `clearRoomCache`).
  4. **Anti-Regression Status Guard**: Status tanda terima pada cache dilindungi dengan bobot integer (`pending: 0, sent: 1, delivered: 2, read: 3, deleted: 99`) agar pesan yang sudah bertanda centang dua biru (`read`) tidak tertimpa kembali menjadi `delivered` atau `sent` oleh riwayat lama server.
  5. **Security Key Change Alert**: Menyimpan riwayat `lastKnownPeerKey` per kontak di `localStorage` dan ref memory. Jika public key lawan bicara berubah saat proses decrypt, sistem menyisipkan pesan sistem bertema amber (`security-notice`) ke timeline chat untuk memberi tahu pengguna secara transparan layaknya WhatsApp.
- **Status:** Diimplementasikan & Terverifikasi (100% Pass).
### DEC-022: Soft Tri-Color Glassmorphism Redesign & Modular Avatar Color Generator
- **Konteks:** Tampilan aplikasi sebelumnya didominasi warna gelap monokromatik dengan inisial avatar yang seragam biru, serta kontras rendah pada timestamp dan kotak balasan pesan di layar mobile. Pengguna menginginkan redesain berestetika *glassmorphism* lembut dengan kombinasi 3 warna harmonis (Soft Azure/Sky Blue sebagai warna utama, Soft Lavender/Iris Violet sebagai sekunder, dan Soft Coral/Rose Pink sebagai aksen tersier), dengan penekanan kuat pada arsitektur desain yang modular.
- **Keputusan:**
  1. **Modular Avatar Utility (`avatarColor.ts`)**: Membuat fungsi utilitas deterministik murni `getAvatarStyle(nameOrId)` dengan 8 variasi warna gradien pastel dan border specular, diaplikasikan secara terpusat ke seluruh komponen (Sidebar, StatusBar, ContactProfileModal, MemberListModal, Call Modals).
  2. **High-Contrast Readability Guard**: Menetapkan kontras tinggi pada bubble pesan masuk (`rgba(30, 41, 59, 0.88)` dengan border specular `0.14`), menajamkan timestamp sendiri ke `rgba(255, 255, 255, 0.88)`, read receipt ke Electric Cyan (`#67e8f9`), dan kotak balasan ke dark glass (`rgba(0, 0, 0, 0.38)`) dengan teks putih `95%`.
  3. **Ambient Frosted Glass Depth**: Menambahkan ambient radial gradient orbs di belakang linimasa `.chat-window` dan kontainer utama agar efek blur kaca buram tampak hidup dan dinamis di perangkat mobile maupun desktop.
- **Status:** Diimplementasikan, Terverifikasi (Build Pass), & Disetujui Pengguna.

### DEC-023: Payload Contract Normalization for Message Deletion (Delete for Everyone Bugfix)
- **Konteks:** Ditemukan bug di mana penarikan pesan untuk semua orang (*Delete for Everyone*) gagal berefek pada lawan bicara. Frontend mengirim `{ message_id, type: "for_everyone" }` sedangkan backend Go mencari `{ delete_for_everyone: true }`. Ketidakcocokan ini membuat backend menganggap seluruh permintaan sebagai "Hapus untuk Saya Sendiri" (Delete for Me), tidak menyiarkan WebSocket event `message_deleted`, dan membiarkan konten pesan asli tetap terbaca oleh lawan bicara di database.
- **Keputusan:**
  1. Melakukan normalisasi parser di backend `chat_handler.go` agar secara fleksibel menerima `type: "for_everyone"`, `delete_type: "for_everyone"`, `delete_for_everyone: true`, dan URL query parameters `?for_everyone=true` / `?delete_for_everyone=true`.
  2. Memperbarui fungsi klien frontend `deleteMessageApi` di `frontend/lib/api.ts` agar mengirimkan kedua format payload (`delete_for_everyone: boolean` dan `type: string`) demi redundansi serta kepatuhan ganda.
  3. Menambahkan unit test di backend Go untuk menjamin kedua bentuk payload teruji dan berfungsi sebagaimana mestinya.
- **Status:** Diimplementasikan & Terverifikasi (100% Pass).
