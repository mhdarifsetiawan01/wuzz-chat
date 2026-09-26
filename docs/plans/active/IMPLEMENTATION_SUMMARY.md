# Implementation Summary: FCM Push Notification & Android Notification Bar Integration

- **Objective**: Mengaktifkan notifikasi di Notification Bar Android untuk APK WuzzChat saat aplikasi di latar depan (foreground), latar belakang (background), maupun saat aplikasi tertutup (offline/killed) menggunakan Firebase Cloud Messaging (FCM v1) dan Local Notification Trigger.
- **Status**: IN_PROGRESS
- **Key Modules**:
  1. `mobile/app.json`: Registrasi `google-services.json` dan izin `POST_NOTIFICATIONS`
  2. `mobile/src/services/notificationService.ts`: Native FCM token extraction & local banner presentation
  3. `mobile/src/screens/RecentChatsScreen.tsx`: Background/foreground local notification dispatch
  4. `backend/internal/push/`: Implementasi FCM HTTP v1 Dispatcher dengan Google Service Account OAuth2 JWT
