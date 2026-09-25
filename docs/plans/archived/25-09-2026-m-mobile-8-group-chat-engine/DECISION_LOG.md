# Decision Log — Milestone M-Mobile-8: Core Group Chat Engine & Member Management

## Architecture & Design Decisions

### DEC-028: Multi-Select Wizard & Selected Chips in NewGroupScreen
- **Context**: Pembuatan grup memerlukan input data profil grup (nama dan deskripsi) serta pemilihan satu atau lebih anggota dari daftar kontak.
- **Decision**: Menggunakan antarmuka wizard satu layar terpadu dengan sticky search bar, visual chips horizontal di atas daftar kontak untuk anggota yang sedang dipilih, dan tombol floating action "Buat Grup (N)".
- **Rationale**: Pengguna mendapatkan umpan balik langsung berapa banyak anggota yang dipilih tanpa perlu berpindah-pindah layar bolak-balik, mematuhi kaidah single-screen WhatsApp flow.

### DEC-029: TLS Server-Relayed Message Transport for Group Chats (E2EE Bypass)
- **Context**: Backend WuzzChat dan Web Client menggunakan pairwise ECDH + AES-GCM untuk 1-on-1 direct chats, sementara group chats didesain beroperasi secara aman melalui TLS server-relayed transport (sesuai spesifikasi di `docs/MOBILE_INTEGRATION_GUIDE.md` Bagian 7 dan Milestone 8.2A).
- **Decision**: Di `ChatScreen` dan `websocketClient`, room berawalan `grp_...` atau `sub_...` langsung mengirimkan payload plaintext via WebSocket yang terlindungi HTTPS/WSS TLS tanpa memicu derivation key pairwise ataupun melempar error fail-closed jika tidak ada public key peer.
- **Rationale**: Konsistensi lintas platform dengan Web frontend dan mencegah aplikasi mobile crash saat berinteraksi di ruang grup.

### DEC-030: Deterministic Sender Color Assignment via Avatar Palette
- **Context**: Dalam linimasa obrolan grup dengan banyak peserta, pengguna memerlukan pembeda visual instan untuk mengetahui siapa yang mengirim pesan tanpa harus selalu membaca nama secara detail.
- **Decision**: Menggunakan algoritma hash string deterministik pada display name / username pengirim yang dipetakan ke palet warna kontras tinggi (`AVATAR_PALETTE` bertema Aurora / Neon).
- **Rationale**: Menghasilkan warna yang konsisten di setiap perangkat untuk user yang sama, meningkatkan keterbacaan linimasa obrolan grup.

### DEC-031: Anti-Loop Callback Memoization & Background Refresh in GroupInfoScreen
- **Context**: Saat membuka `GroupInfoScreen`, layar mengalami flickering/kedip berulang dan terjebak di state loading tanpa henti pada perangkat Android.
- **Root Cause**: `onGroupUpdated` dimasukkan ke dependency array `loadGroupData` di `GroupInfoScreen.tsx`, sementara di `App.tsx` fungsi tersebut di-instansiasi ulang secara inline setiap render. Hal ini memicu loop tak berujung: fetch selesai ➔ `onGroupUpdated` ➔ `setActiveConversation` di parent ➔ parent re-render ➔ fungsi baru tercipta ➔ `loadGroupData` di-recreate ➔ `useEffect` trigger lagi ➔ `setIsLoading(true)` ➔ loop berulang terus-menerus.
- **Decision**:
  1. Menggunakan `useRef` untuk `onGroupUpdatedRef` dan `isLoadingRef` di `GroupInfoScreen.tsx`, mengeluarkan callback dari dependency array `useCallback([groupId])`.
  2. Menambahkan mode silent background refresh `loadGroupData(false)` untuk aksi mutasi (tambah anggota, ubah peran, kick).
  3. Membungkus seluruh handler di `App.tsx` (`handleGroupUpdated`, `handleOpenGroupInfo`, dll.) menggunakan `useCallback` dengan guard shallow equality check.
- **Rationale**: Menjamin stabilitas referensial 100%, mengeliminasi infinite render loop dan layar berkedip pada Android, serta memberikan pengalaman navigasi yang instan dan mulus.

