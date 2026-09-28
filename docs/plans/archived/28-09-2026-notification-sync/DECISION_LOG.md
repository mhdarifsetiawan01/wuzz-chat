# Decision Log — Mobile Notification Icon & Brand Color Sync

## DEC-016: Dedicated White Silhouette Notification Icon with Brand Color Tint
- **Context**: Status bar icon Android (Small Icon) masih menampilkan logo default Expo karena file drawable native belum diperbarui saat transisi branding WuzzChat, dan `app.json` menggunakan full color RGB `icon.png`.
- **Decision**: Buat asset `mobile/assets/notification-icon.png` (monokrom putih murni dengan alpha channel transparan), arahkan plugin `expo-notifications` ke asset tersebut, perbarui seluruh varian `drawable-*/notification_icon.png`, dan set warna notifikasi ke `#0462E8` (biru WuzzChat).
- **Consequences**: Status bar menampilkan logo resmi WuzzChat yang tajam dan selaras dengan warna brand pada semua versi Android.

## DEC-017: Multi-Tenant Direct Room Peer ID Parsing & Enriched Notification Tap Navigation
- **Context**: Saat notifikasi bar diklik, pesan baru tertahan dalam status `Pesan terenkripsi (sedang menyinkronkan kunci...)` karena `targetConv` tidak memiliki `peer_id`, dan fallback parsing `roomId` salah memilih string `"default"` (nama tenant) alih-alih ID user lawan bicara.
- **Decision**:
  1. Perbaiki parsing `dm_` room ID: abaikan prefix tenant dan selalu ambil user ID lawan bicara yang bukan `currentUserId`.
  2. Perluas `extractTargetRoom` di `notificationService.ts` untuk mengekstrak `senderPublicKey`.
  3. Perkaya `handleTargetNavigation` di `App.tsx`: cari room di daftar `conversations` yang sudah ada, atau bawa `peer_id: target.senderId` dan `peer_public_key: target.senderPublicKey`.
  4. Cache `peer_public_key` seketika saat `ChatScreen` mount jika tersedia di `conversation`.
## DEC-018: Anti-Loop Notification Tap & Cold Start Navigation Guard
- **Context**: Saat pengguna kembali ke Home (`RecentChatsScreen`) dari chat yang dibuka via notifikasi bar, aplikasi auto-redirect kembali ke chat tadi karena `conversations` yang diperbarui saat focus memicu re-render effect di `App.tsx` dan memanggil ulang `checkColdStartNotification`. Selain itu, `getLastNotificationResponseAsync` Expo tetap menyimpan respons lama.
- **Decision**:
  1. Pasang `handledResponseIdentifiers` Set di `notificationService.ts` untuk menjamin setiap respons notifikasi hanya dieksekusi tepat satu kali.
  2. Gunakan `conversationsRef` dan `userRef` di `App.tsx` dan hapus `conversations` dari dependency array effect notifikasi agar listener tidak di-teardown dan di-retrigger setiap kali data percakapan berubah atau Home difokuskan.
- **Consequences**: Navigasi `← Back` ke Home berjalan lancar tanpa auto-redirect/looping kembali ke percakapan.


