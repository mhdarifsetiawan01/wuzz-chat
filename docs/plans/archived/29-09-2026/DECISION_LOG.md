# Decision Log — WebRTC Call Background Push Notification

## Rationale & Technical Decisions

### DEC-CALL-01: High-Priority Data-Only FCM Push untuk Panggilan Masuk
- **Konteks**: Android OS membatasi background activity execution jika aplikasi dalam mode doze / killed.
- **Keputusan**: Gunakan payload FCM v1 dengan `android.priority = "HIGH"` dan letakkan payload di dalam map `data`, tanpa blok `notification` standar.
- **Rasional**: Memungkinkan `expo-task-manager` / native background task Android untuk langsung bangun seketika dan merender notifikasi panggilan lokal dengan tombol aksi khusus (Terima/Tolak) serta dering khusus tanpa tertunda oleh antrean OS.

### DEC-CALL-02: Isolated Goroutine Dispatch di WebSocket Handler
- **Konteks**: WebRTC signaling membutuhkan latensi sub-detik. WebSocket loop tidak boleh terhambat oleh request HTTP keluar ke FCM.
- **Keputusan**: Seluruh pengiriman push notification (`NotifyIncomingCall`, `NotifyCallCancelled`) dibungkus dalam goroutine terisolasi dengan timeout 10 detik dan defer recovery.
- **Rasional**: Mencegah degradasi performa atau deadlock pada koneksi WebSocket penelepon jika jaringan ke server Google FCM mengalami jitter/latensi tinggi.

### DEC-CALL-03: Zero Frontend Web Impact
- **Konteks**: Pengguna menegaskan bahwa antarmuka web (`frontend/`) tidak perlu diubah.
- **Keputusan**: Seluruh penyesuaian UI dan background task dilakukan murni di `mobile/`, sedangkan backend hanya memicu push ke subscription yang terdaftar (termasuk Android/iOS).
- **Rasional**: Memastikan stabilitas platform web tidak terpengaruh sedikit pun.
