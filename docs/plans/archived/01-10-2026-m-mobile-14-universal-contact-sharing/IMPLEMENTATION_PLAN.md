# Active Implementation Plan: Universal Contact Sharing & Deep Linking Engine

## 🎯 1. Deskripsi Fitur
Memungkinkan pengguna membagikan tautan profil/kontak mereka (`https://chat.wuzzhub.id/u/{username}` atau `wuzzchat://u/{username}`) ke aplikasi luar (WhatsApp, medsos, dll). Ketika penerima link mengklik tautan di perangkat mobile:
- Sistem operasi Android langsung membuka aplikasi native WuzzChat.
- Aplikasi melakukan *profile lookup* & verifikasi privasi.
- Jika profil publik atau sudah berteman: langsung membuka jendela chat obrolan langsung (Chat DM).
- Jika profil privat & belum berteman: membuka layar profil dan memunculkan notifikasi proteksi akun privat sehingga penerima mengirim permintaan pertemanan terlebih dahulu.

---

## 🏗️ 2. Arsitektur Teknis & File Target

### 2.1 Konfigurasi Platform & Manifest
- **`mobile/app.json`**:
  - Daftarkan `scheme: "wuzzchat"`.
  - Daftarkan intent filter untuk `scheme: "https"`, `host: "chat.wuzzhub.id"`, `pathPrefix: "/u"`.
- **`mobile/android/app/src/main/AndroidManifest.xml`**:
  - Tambahkan `<intent-filter>` di `.MainActivity` untuk menangani `android:scheme="wuzzchat"` dan `android:scheme="https"` dengan host `chat.wuzzhub.id` dan path prefix `/u`.

### 2.2 Deep Link Routing & Parser (`mobile/App.tsx`)
- Perluas parser `handleDeepLink(url)`:
  - Deteksi pola URL profil: `/u/([^/?#]+)`, `wuzzchat://u/([^/?#]+)`, `user=([^&#]+)`, `u=([^&#]+)`.
  - Ambil username target secara aman.
  - Jalankan orkestrasi:
    1. Ambil data pengguna via `getUserProfile(username)`.
    2. Cek apakah pengguna menargetkan akunnya sendiri (`currentUser.id === targetUser.id`): jika ya, arahkan ke UserProfile mode edit / profil diri.
    3. Cek status koneksi via `connectionsApi.getConnectionStatus(targetUser.id)`.
    4. Evaluasi izin chat:
       - Boleh chat langsung jika: `!targetUser.is_private_account` ATAU status pertemanan `connStatus.status === 'accepted'`.
       - Jika boleh chat: panggil `startDirectChat(targetUser.id)` ➔ navigasi ke `'Chat'` dengan `ConversationItem`.
       - Jika privat & belum berteman: navigasi ke `'UserProfile'` dengan parameter `{ userId: targetUser.id, username: targetUser.username, initialUser: targetUser }`.

### 2.3 Antarmuka Bagikan Profil Diri
- **`mobile/src/screens/SettingsScreen.tsx`**:
  - Tambahkan tombol / aksi "Bagikan Profil" pada Profile Card atau opsi di pengaturan profil.
- **`mobile/src/screens/UserProfileScreen.tsx`**:
  - Saat `isSelf === true`, sediakan tombol "Bagikan Profil Saya" di header atau kartu identitas.

### 2.4 Dokumentasi Rencana Web Masa Depan (Tiered Sync)
- **`ROADMAP.md` & `docs/domains/PROFILE_IDENTITY.md`**:
  - Catat arsitektur Web Landing Page `frontend/app/u/[username]/page.tsx` sebagai item rencana berikutnya.

---

## 🧪 3. Strategi Verifikasi
1. Validasi TypeScript: `npx tsc --noEmit` di folder `mobile/`.
2. Verifikasi Regex URL Parser terhadap berbagai format:
   - `https://chat.wuzzhub.id/u/john`
   - `http://chat.wuzzhub.id/u/john`
   - `wuzzchat://u/john`
   - `https://chat.wuzzhub.id/?user=john`
   - Existing room URL: `https://chat.wuzzhub.id/?room=grp_abc123`
3. Verifikasi alur proteksi privasi (mental audit & unit logic).
