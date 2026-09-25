# Decision Log — Active Workspace

## Keputusan Teknis Terdaftar

### DEC-014: Expo Push Token & Native Endpoint Routing Architecture
- **Konteks**: Backend Go WuzzChat menerima field `platform` ('web' | 'android' | 'ios') dan `endpoint` (token string). Pada Android/iOS native via Expo, token yang didapat berupa Expo Push Token (misal `ExponentPushToken[...]`) atau native device token FCM/APNs.
- **Keputusan**: Pada mobile client, kita gunakan `Notifications.getExpoPushTokenAsync()` dengan fallback graceful `Notifications.getDevicePushTokenAsync()`. Endpoint backend Go `POST /api/notifications/subscribe` menerima string token ini di field `endpoint` dengan `platform: Platform.OS === 'ios' ? 'ios' : 'android'`.
- **Dampak**: Kompatibel 100% dengan endpoint backend yang sudah ada tanpa memerlukan perubahan skema database PostgreSQL.

### DEC-015: Foreground Banner Suppression via Dynamic Active Room Tracker
- **Konteks**: Saat pengguna sedang aktif membaca dan mengetik dalam percakapan tertentu (misal room `dm_user1_user2`), pesan masuk yang menghasilkan notifikasi tidak boleh memunculkan banner pop-up yang menutupi layar obrolan aktif tersebut.
- **Keputusan**: Implementasikan notification handler dinamis yang membaca state `activeRoomId`. Jika notifikasi masuk memiliki `room_id === activeRoomId`, maka banner pop-up dimatikan (`shouldShowAlert: false`). Jika notifikasi berasal dari room obrolan lain atau pengguna sedang berada di daftar chat (`RecentChatsScreen`), banner ditampilkan normal (`shouldShowAlert: true`).
- **Dampak**: Pengalaman pengguna (UX) setara dengan aplikasi pesan instan modern (seperti WhatsApp / Telegram), tidak ada banner mengganggu saat sedang aktif mengobrol.

### DEC-016: Expo Go (SDK 53+) Remote Notification Guard & Development Build Strategy
- **Konteks**: Mulai Expo SDK 53+, remote push notifications (FCM background registration) ditiadakan dari client aplikasi Expo Go standar dan dialihkan ke Development Builds (`expo-dev-client` / standalone production build).
- **Keputusan**: Tambahkan deteksi lingkungan `isExpoGo()` via `expo-constants`. Di lingkungan Expo Go, remote push token fetching di-bypass secara graceful (tanpa melempar unhandled crash error), sementara local notifications, badge counter, notification handler, dan foreground audio/alert tetap berfungsi 100%. Untuk production push notification langsung dari FCM/APNs, gunakan development build (`npx expo run:android` / EAS Build).
- **Dampak**: Aplikasi dapat dijalankan dengan mulus di Expo Go untuk pengembangan instan tanpa hambatan error, dan siap 100% saat di-build menjadi development client / production APK.

