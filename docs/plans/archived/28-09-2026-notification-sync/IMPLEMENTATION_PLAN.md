# Implementation Plan — Mobile Notification Icon & Brand Color Sync

## 1. Objectives
- Mengganti small notification icon Android yang masih berlogo default Expo dengan logo resmi WuzzChat monokrom transparan.
- Memastikan notifikasi di status bar (Gambar 1) menampilkan siluet WuzzChat yang tajam dan proporsional.
- Menyelaraskan warna aksen notifikasi (`notification_icon_color` & channel lights) dari hijau `#10B981` menjadi warna brand resmi WuzzChat `#0462E8`.
- Memperbaiki bug pesan terenkripsi saat percakapan dibuka langsung dari ketukan notifikasi bar (DEC-017):
  - Memperbaiki ekstraksi `peerId` dari format room `dm_<tenant>_<userA>_<userB>` di `ChatScreen.tsx`, `MessageContext.tsx`, dan `ConversationContext.tsx`.
  - Memperkaya navigasi ketukan notifikasi di `App.tsx` dan `notificationService.ts` dengan mencari percakapan yang tersimpan atau menyertakan `peer_id` dan `peer_public_key` dari FCM push payload.

## 2. Technical Architecture & File Changes
- **`mobile/assets/notification-icon.png`**:
  - Dihasilkan dari siluet WuzzChat (`android-icon-monochrome.png`), diposisikan presisi dengan padding aman 20dp/24dp (kanvas 512x512, siluet putih murni dengan alpha channel transparan).
- **`mobile/app.json`**:
  - Ganti `"icon": "./assets/notification-icon.png"` dan `"color": "#0462E8"` pada plugin `expo-notifications`.
- **`mobile/android/app/src/main/res/drawable-*/notification_icon.png`**:
  - Perbarui 5 varian densitas native:
    - `drawable-mdpi/notification_icon.png` (24x24 px)
    - `drawable-hdpi/notification_icon.png` (36x36 px)
    - `drawable-xhdpi/notification_icon.png` (48x48 px)
    - `drawable-xxhdpi/notification_icon.png` (72x72 px)
    - `drawable-xxxhdpi/notification_icon.png` (96x96 px)
- **`mobile/android/app/src/main/res/values/colors.xml`**:
  - Ubah `<color name="notification_icon_color">#10B981</color>` menjadi `#0462E8`.
- **`mobile/src/services/notificationService.ts`**:
  - Ubah `lightColor` channel pesan default dari `#10B981` ke `#0462E8`.
  - Tambahkan properti `color: '#0462E8'` pada parameter `scheduleNotificationAsync`.
  - Sertakan `senderPublicKey` pada return value `extractTargetRoom`.
- **`mobile/src/services/notificationBackgroundTask.ts`**:
  - Tambahkan properti `color: '#0462E8'` pada parameter `scheduleNotificationAsync` di background task handler.
- **`mobile/App.tsx`**:
  - Pada `handleTargetNavigation`, cari room dari cache `conversations` atau gunakan `target.senderId` dan `target.senderPublicKey` sebagai `peer_id` dan `peer_public_key`.
- **`mobile/src/screens/ChatScreen.tsx`**:
  - Perbaiki fungsi parsing `peerId` dari format `dm_<tenant>_<userA>_<userB>` (abaikan tenant prefix dan ambil ID user yang bukan `currentUserId`).
  - Cache `peer_public_key` yang dibawa dari navigasi notifikasi.
- **`mobile/src/context/MessageContext.tsx` & `ConversationContext.tsx`**:
  - Perbaiki parsing `peerId` dari `dm_` dengan tenant prefix.

## 3. Verification Strategy
- Verifikasi visual piksel: uji bounds dan mode RGBA pada seluruh file icon.
- TypeScript check: `npx tsc --noEmit` di `mobile/`.
- Frontend build check: `npm run build` di `frontend/`.
- Backend tests check: `go test ./...` di `backend/`.

