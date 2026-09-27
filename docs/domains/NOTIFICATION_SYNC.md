# 🔔 Domain: Push Notification & Real-Time Sync (`NOTIFICATION_SYNC`)

Dokumen ini adalah spesifikasi definitif untuk domain **Notifikasi Latar Belakang (Push Notifications) dan Sinkronisasi Kluster Terdistribusi** pada Wuzz Chat.

---

## 📋 1. Aturan Bisnis & Invarian (*Business Invariants*)

1. **Zero-Knowledge Background Push Decryption**:
   - Server tidak pernah mengirimkan plaintext pesan E2EE ke Google FCM atau Apple APNs.
   - Payload dikirim murni dalam format *Silent Data-Only* (`priority: HIGH`).
   - Latar belakang perangkat (Service Worker `sw.js` di Web / Background Task di Android) menerima paket data terenkripsi, mendekripsi secara lokal menggunakan kunci privat Keystore/IndexedDB, lalu menampilkan notifikasi OS.
2. **Pluggable Push Provider Auto-Routing**:
   - Backend membedakan tipe token secara otomatis pada `POST /api/notifications/subscribe`:
     - Token perangkat native Android/iOS dialirkan ke `FCMv1PushProvider`.
     - URL endpoint browser dialirkan ke `VAPIDWebPushProvider` (RFC 8291/8292).
3. **Pencabutan Token Otomatis**:
   - Token push dicabut seketika saat user melakukan logout sukarela atau terkena pemutusan sesi (`SESSION_REPLACED`).
4. **Kluster Multi-Node Terdistribusi (Redis Pub/Sub)**:
   - Setiap instance Fly.io backend terhubung ke channel Redis `wuzz:cluster:events`.
   - Event pemutusan sesi (`session_kick`, `device_kick`) disebarkan ke seluruh node.
   - Guard **Anti-Echo Loop**: Node UUID mengabaikan event yang dipublikasikan oleh dirinya sendiri.

---

## 🏛️ 2. Arsitektur Notifikasi (`backend/internal/push/`)

- **Interface `PushProvider`**: Abstraksi pengiriman notifikasi (`SendNotification(ctx, token, payload)`).
- **FCM v1 Provider (`fcm.go`)**: Berkomunikasi langsung dengan endpoint Google OAuth2 ADC HTTP v1.
- **Web Push Provider (`webpush.go`)**: Menandatangani payload dengan kunci VAPID ECC NIST P-256.

---

## 🔌 3. Kontrak API & Event Kluster

### A. REST Endpoints
| Method | Endpoint | Akses | Keterangan |
|---|---|---|---|
| `POST` | `/api/notifications/subscribe` | Terproteksi | Mendaftarkan token push (FCM / WebPush) |
| `POST` | `/api/notifications/unsubscribe` | Terproteksi | Mencabut token push perangkat |
| `GET` | `/api/notifications/vapid-public-key` | Publik | Mengambil public key VAPID untuk browser |

### B. Event Redis Pub/Sub (`wuzz:cluster:events`)
```json
{
  "node_id": "<UUID>",
  "type": "session_kick",
  "target_user_id": "<UUID>",
  "target_device_id": "<DEVICE_ID>",
  "reason": "SESSION_REPLACED",
  "timestamp": 1727430000
}
```
