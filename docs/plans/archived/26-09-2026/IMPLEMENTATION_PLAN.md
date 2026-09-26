# Implementation Plan: Client-Side Background Decryption Push Notification

**Tanggal**: 26 September 2026  
**Branch**: `dev`  
**Estimasi**: 2–3 sesi kerja

---

## 🎯 Objectives

Mengimplementasikan arsitektur notifikasi E2EE gaya WhatsApp/Signal:
1. Backend mengirim `data-only` FCM silent push (tanpa field `notification` agar OS tidak auto-display plaintext)
2. Mobile background task mendekripsi ciphertext secara lokal, lalu menampilkan local notification dengan teks asli
3. Perangkat baru yang baru login dapat menampilkan notifikasi (dengan fallback graceful jika kunci belum sync)

---

## 📐 Arsitektur Flow

```
[Backend: pesan E2EE masuk]
        ↓
[push.go: NotifyOfflineRecipients()]
        ↓
[fcm.go: Send() → FCM HTTP v1]
        ↓ ← DATA-ONLY (tanpa field "notification")
[Android OS: terima silent push → wakeup background task]
        ↓
[notificationBackgroundTask.ts: handleNotificationBackgroundTask()]
        ↓
[SecureStore.getE2EEKeyPair(userId)]  ← ambil private key lokal
        ↓
[crypto.decryptText(aesKey, encrypted_content)]  ← dekripsi lokal
        ↓
[Notifications.scheduleNotificationAsync()]  ← tampilkan local notif dengan teks asli
        ↓
[Status Bar Android: "Alice: Halo, apa kabar?"]  ✅
```

---

## 📁 File Target

### File DIMODIFIKASI
| File | Perubahan |
|------|-----------|
| `backend/internal/push/fcm.go` | Hapus field `Notification` dari FCM message; semua data via `data` map string saja |
| `backend/internal/push/push.go` | Tambahkan field `sender_user_id` eksplisit di data payload; hapus `bodyText` override untuk FCM |
| `mobile/src/services/notificationService.ts` | Registrasi `BACKGROUND_NOTIFICATION_TASK` via TaskManager saat init |
| `mobile/App.tsx` | Import & registrasi background task handler sebelum React render |

### File BARU DIBUAT
| File | Tujuan |
|------|--------|
| `mobile/src/services/notificationBackgroundTask.ts` | Core background task: ambil private key, dekripsi, tampilkan local notification |

---

## 🔧 Milestone Implementasi

### Milestone 1: Backend Data-Only FCM Payload
**Target file**: `backend/internal/push/fcm.go`

**Perubahan**:
- Hapus `Notification: &fcmNotification{...}` dari `fcmMessage` struct builder
- Pastikan semua field payload ada di `fcmData` map (termasuk `title`, `body`, `encrypted_content`, `sender_public_key`, `room_id`, `sender_id`, `sender_nickname`, `media_type`, `message_id`, `timestamp`)
- Set `Android.Priority = "HIGH"` tetap ada (diperlukan agar background task di-wake up)
- Hapus `Android.Notification` (channel_id, sound, color) dari fcmAndroidConfig karena notifikasi akan dibuat oleh mobile client

**Verifikasi**: `go test -v ./backend/internal/push/...`

---

### Milestone 2: Mobile Background Task Handler
**Target file**: `mobile/src/services/notificationBackgroundTask.ts` (BARU)

**Fungsi utama** `handleNotificationBackgroundTask`:
```typescript
// Pseudo-code flow:
const { data } = notification.request.content;
const userId = await secureStorage.getItem('wuzz_current_user_id');
const keyPair = await secureStorage.getE2EEKeyPair(userId);
const senderPubKey = data.sender_public_key;
const encryptedContent = data.encrypted_content;

if (keyPair && senderPubKey && isEncryptedMessage(encryptedContent)) {
  const aesKey = getOrDeriveRoomAESKey(keyPair.privateKeyHex, senderPubKey, data.room_id);
  const plaintext = decryptText(aesKey, encryptedContent);
  // tampilkan local notification dengan plaintext
} else {
  // fallback: tampilkan notifikasi "🔒 Pesan Baru"
}
```

**Pertimbangan teknis**:
- Background task handler harus di-define di level module (bukan di dalam component), dan di-import sebelum AppRegistry
- Gunakan `expo-task-manager` + `expo-notifications` `registerTaskAsync` — sudah ada dependensi
- Constraint: Background task tidak boleh throw unhandled error; semua operasi dibungkus try/catch

**Konstanta**:
```typescript
export const BACKGROUND_NOTIFICATION_TASK = 'WUZZ_BACKGROUND_NOTIFICATION_DECRYPT';
```

**Registrasi di App.tsx** (sebelum `export default App`):
```typescript
import './src/services/notificationBackgroundTask'; // side-effect: registers TaskManager task
```

---

### Milestone 3: Registrasi Background Task di NotificationService
**Target file**: `mobile/src/services/notificationService.ts`

**Perubahan**:
- Tambahkan method `registerBackgroundHandler()` yang memanggil:
  ```typescript
  Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK);
  ```
- Panggil `registerBackgroundHandler()` di dalam `registerForPushNotificationsAsync()` setelah permission granted

---

### Milestone 4: Simpan Current User ID di SecureStorage
**Target file**: `mobile/src/services/secureStorage.ts`, `mobile/src/context/AuthContext.tsx`

**Konteks**: Background task tidak punya akses ke React state/context. Satu-satunya cara background task tahu siapa user yang sedang login adalah melalui `SecureStore`.

**Perubahan di secureStorage.ts**:
```typescript
CURRENT_USER_ID: 'wuzz_current_user_id',
```

Tambahkan helper:
```typescript
async setCurrentUserId(userId: string): Promise<void>
async getCurrentUserId(): Promise<string | null>
```

**Perubahan di AuthContext.tsx**:
- Saat login berhasil, simpan `user.id` ke `secureStorage.setCurrentUserId(user.id)`
- Saat logout, hapus: `secureStorage.deleteItem('wuzz_current_user_id')`

---

### Milestone 5: Testing & Verifikasi End-to-End

**Backend Testing**:
```bash
cd backend && go test -v ./internal/push/...
```
Pastikan test `TestFCMv1Send_DataOnly` memverifikasi tidak ada field `notification` di payload.

**Mobile TypeScript Gate**:
```bash
cd mobile && npx tsc --noEmit
```

**Mobile Build Gate**:
```bash
cd frontend && npm run build
```

---

## ⚠️ Constraint & Risiko

| Risiko | Mitigasi |
|--------|----------|
| Background task tidak wake-up di beberapa vendor Android (Xiaomi, MIUI, Samsung) | Tetap kirim `priority: HIGH` di FCM Android config; dokumentasikan limitation |
| SecureStore tidak dapat diakses saat device dalam kondisi before-first-unlock | Gunakan `AFTER_FIRST_UNLOCK` policy (sudah ada) + fallback placeholder "🔒 Pesan Baru" |
| Background task timeout (30s batas Expo) | Dekripsi crypto lokal sangat cepat (< 1ms); aman |
| Group chat: peerPublicKey tidak tersedia di payload untuk grup multi-member | Untuk saat ini: fokus DM; grup tampilkan fallback "🔒 Pesan Grup Baru" |

---

## 📝 Catatan Out-of-Scope (Milestone Berikutnya)
- Key synchronization untuk perangkat baru (QR transfer sudah ada via `keyTransfer.ts`) → tetap gunakan mekanisme yang ada
- APNs (iOS) background handler → diprioritaskan di milestone terpisah
