# Walkthrough: Multi-Node Session Kick via Redis Pub/Sub

Implementasi sinkronisasi pemutusan sesi (session kick & device kick) antar-instance backend yang terhubung via Redis Pub/Sub telah selesai dikerjakan dan diverifikasi.

## Rincian Perubahan

### 1. Ekstensi Envelope `ClusterEvent` ([`backend/internal/ws/hub.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/ws/hub.go))
Menambahkan 3 field baru dengan tag `omitempty` untuk membawa metadata kick:
- `EventType string`: jenis event (`"session_kick"` atau `"device_kick"`).
- `ExceptDeviceID string`: ID perangkat yang dikecualikan dari kick (misal perangkat yang baru saja login/reset kunci).
- `KickReason string`: alasan penendangan sesi.

### 2. Publikasi Cluster Event pada Kick Methods ([`backend/internal/ws/hub.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/ws/hub.go))
- `KickClientByUserID`: mengeksekusi kick klien lokal via helper `kickClientByUserIDLocal`, lalu jika broker Redis aktif (`h.broker != nil`), mem-publish `ClusterEvent` bertipe `"session_kick"`.
- `KickClientByDeviceID`: mengeksekusi kick klien lokal via helper `kickClientByDeviceIDLocal`, lalu jika broker Redis aktif, mem-publish `ClusterEvent` bertipe `"device_kick"` (menggunakan `SenderID` untuk membawa target `deviceID`).
- Pemisahan method lokal mencegah terjadinya *echo loop* atau *re-publish storm* antar instance.

### 3. Dispatching Event pada Cluster Subscriber `SetBroker` ([`backend/internal/ws/hub.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/ws/hub.go))
Mengganti blok handler event dengan `switch event.EventType`:
- `"session_kick"`: memanggil `h.kickClientByUserIDLocal(event.TargetUserID, event.ExceptDeviceID, event.KickReason)`.
- `"device_kick"`: memanggil `h.kickClientByDeviceIDLocal(event.TargetUserID, event.SenderID, event.KickReason)`.
- `default`: memproses broadcast room atau direct chat message seperti sebelumnya.

### 4. Unit Testing Komprehensif ([`backend/internal/ws/hub_cross_instance_kick_test.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/ws/hub_cross_instance_kick_test.go))
Menambahkan 3 pengujian unit baru menggunakan cluster in-memory broker:
- `TestHub_CrossInstanceSessionKick`: memastikan kick user di Node A berhasil menendang perangkat laptop user di Node B dan mengecualikan mobile di Node A.
- `TestHub_CrossInstanceDeviceKick`: memastikan kick spesifik device tablet di Node B berhasil dieksekusi meskipun di-trigger dari Node A yang memiliki 0 klien lokal untuk user tersebut.
- `TestHub_AntiEchoLoop_SessionKick`: memastikan node pengirim tidak menerima duplikasi kick akibat echo loop dari broker.

---

## Bukti Hasil Verifikasi

### 1. Cross-Instance Unit Tests
```text
=== RUN   TestHub_CrossInstanceSessionKick
2026/09/23 22:09:52 [Hub 207d81f8] berhasil terhubung ke Cluster Pub/Sub channel 'wuzz:cluster:events'
2026/09/23 22:09:52 [Hub ef322fa3] berhasil terhubung ke Cluster Pub/Sub channel 'wuzz:cluster:events'
2026/09/23 22:09:52 [Hub 207d81f8] client terdaftar: id=user-alice device=device-mobile session=user-alice:device-mobile nickname=Alice Mobile | total_koneksi=1
2026/09/23 22:09:52 [Hub ef322fa3] client terdaftar: id=user-alice device=device-laptop session=user-alice:device-laptop nickname=Alice Laptop | total_koneksi=1
2026/09/23 22:09:52 [Hub ef322fa3] menerima cluster session_kick dari node 207d81f8 target=user-alice except=device-mobile
2026/09/23 22:09:52 [Hub ef322fa3] kick client user-alice (deviceID=device-laptop | exceptDevice=device-mobile | reason=SESSION_REPLACED: Kunci keamanan telah di-reset dari perangkat lain.)
--- PASS: TestHub_CrossInstanceSessionKick (0.20s)
=== RUN   TestHub_CrossInstanceDeviceKick
2026/09/23 22:09:52 [Hub 6c30764e] berhasil terhubung ke Cluster Pub/Sub channel 'wuzz:cluster:events'
2026/09/23 22:09:52 [Hub 414c4eb0] berhasil terhubung ke Cluster Pub/Sub channel 'wuzz:cluster:events'
2026/09/23 22:09:52 [Hub 414c4eb0] client terdaftar: id=user-bob device=device-tablet session=user-bob:device-tablet nickname=Bob Tablet | total_koneksi=1
2026/09/23 22:09:52 [Hub 414c4eb0] client terdaftar: id=user-bob device=device-phone session=user-bob:device-phone nickname=Bob Phone | total_koneksi=2
2026/09/23 22:09:52 [Hub 414c4eb0] menerima cluster device_kick dari node 6c30764e target=user-bob device=device-tablet
2026/09/23 22:09:52 [Hub 414c4eb0] kick by device: user=user-bob device=device-tablet reason=DEVICE_KICKED: Perangkat tablet dikeluarkan dari jarak jauh.
--- PASS: TestHub_CrossInstanceDeviceKick (0.20s)
=== RUN   TestHub_AntiEchoLoop_SessionKick
2026/09/23 22:09:52 [Hub d305a3c1] berhasil terhubung ke Cluster Pub/Sub channel 'wuzz:cluster:events'
2026/09/23 22:09:52 [Hub d305a3c1] client terdaftar: id=user-charlie device=device-a session=user-charlie:device-a nickname=Charlie | total_koneksi=1
2026/09/23 22:09:52 [Hub d305a3c1] kick client user-charlie (deviceID=device-a | exceptDevice= | reason=SESSION_REPLACED: Logout)
--- PASS: TestHub_AntiEchoLoop_SessionKick (0.30s)
PASS
ok  	github.com/bms-del112/wuzz-chat/internal/ws	0.711s
```

### 2. Full Backend Test Suite
```text
ok  	github.com/bms-del112/wuzz-chat/internal/ai	(cached)
ok  	github.com/bms-del112/wuzz-chat/internal/api	11.775s
ok  	github.com/bms-del112/wuzz-chat/internal/auth	(cached)
ok  	github.com/bms-del112/wuzz-chat/internal/broker	(cached)
ok  	github.com/bms-del112/wuzz-chat/internal/push	(cached)
ok  	github.com/bms-del112/wuzz-chat/internal/storage	(cached)
ok  	github.com/bms-del112/wuzz-chat/internal/store	(cached)
ok  	github.com/bms-del112/wuzz-chat/internal/worker	(cached)
ok  	github.com/bms-del112/wuzz-chat/internal/ws	5.040s
```

### 3. Frontend Next.js Build
```text
▲ Next.js 16.3.5 (Turbopack)
✓ Compiled successfully in 300ms
✓ Finished TypeScript in 2.1s
✓ Generating static pages using 7 workers (8/8) in 502ms
Route (app)
┌ ○ /
├ ○ /_not-found
├ ○ /chat
├ ○ /login
├ ○ /register
└ ○ /transfer
```
