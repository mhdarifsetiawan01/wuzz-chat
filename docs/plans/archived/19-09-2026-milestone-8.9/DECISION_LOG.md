# Active Decision Log — Milestone 8.9

## DEC-015: Mobile-Ready Reliability (Request ID + ACK Transport Protocol & Server-Side In-Memory Idempotency)

- **Konteks**:
  Evaluasi kesiapan WuzzChat untuk klien mobile (Android Native Kotlin & React Native) serta PWA pada jaringan seluler tidak stabil mengungkap dua celah keandalan kritis:
  1. *Transport Uncertainty*: Klien tidak memiliki konfirmasi deterministik tingkat transport apakah pesan telah diterima dan di-commit oleh server (`TypeReceipt` saat ini adalah status bisnis apakah lawan bicara online, bukan transport ACK).
  2. *Duplicate Broadcast Hazard*: Klien `outboundQueue` melakukan resend otomatis saat reconnect. Jika soket terputus tepat setelah server menerima pesan, pengiriman ulang memicu server membroadcast pesan yang sama dua kali ke anggota room sebelum gagal di SQL constraint.

- **Keputusan Teknis**:
  1. **Request ID + ACK Protocol**:
     - Tambahkan field opsional `request_id` pada struct pesan WebSocket (`ws.Message`).
     - Definisikan tipe event `ack`. Saat menerima pesan masuk dengan `request_id`, server langsung membalas ke soket pengirim paket `{ type: "ack", request_id: "...", status: "ok" }`.
     - Klien mempertahankan pesan di `outboundQueue` dan hanya menghapusnya jika paket ACK yang cocok telah diterima.
  2. **Server-Side In-Memory Idempotency (2-Minute Cache)**:
     - Tambahkan cache in-memory berbasis RWMutex di `Hub` (`dedupHistory map[string]int64`) dengan TTL 2 menit.
     - Jika `msg.ID` sudah pernah tercatat dalam 2 menit terakhir: server membatalkan broadcast ke room dan membatalkan publish ke Redis, namun langsung mengirimkan ACK kembali ke pengirim agar pengirim menghentikan pengiriman ulang.
     - Menjalankan goroutine periodic cleanup setiap 1 menit untuk menghapus entri yang expired.

- **Dampak & Trade-off**:
  - Positif: Reliabilitas transport sekelas WhatsApp/Telegram tanpa *phantom message*, bebas duplikasi pesan saat reconnect mobile, konsumsi RAM < 1 MB untuk 10.000 pesan, dan zero dependency eksternal.
  - Trade-off: Menambah overhead marginal map lookup per pesan masuk di Hub.
