# DECISION_LOG.md — Milestone 4 Architecture & Design Decisions

### DEC-020: Struct `Client` and `Message` Explicit `TenantID`
- **Context**: Pesan realtime dan koneksi WebSocket sebelumnya tidak memuat identitas tenant. Jika dua user dari tenant berbeda memiliki room ID yang sama atau berinteraksi di hub in-memory, pesan bisa bocor ke tenant lain.
- **Decision**: Menambahkan `TenantID` pada struct `Client` dan struct `Message`. Di `ReadPump`, server secara paksa menimpa `msg.TenantID = c.TenantID` dari sesi terautentikasi untuk mencegah spoofing oleh client melalui payload JSON.
- **Consequences**: Seluruh event WebSocket secara deterministik membawa konteks tenant pengirim tanpa bergantung pada query param tambahan.

---

### DEC-021: Fail-Closed In-Memory Broadcast Filter per Tenant
- **Context**: `Hub.broadcastLocal` mengirimkan pesan ke seluruh koneksi aktif di room map dan anggota percakapan.
- **Decision**: Menambahkan filtering ketat pada loop `targetMap`: sebuah client hanya boleh dimasukkan ke `targetMap` jika `client.TenantID == msg.TenantID`. Nilai kosong otomatis fallback ke `"default"` untuk backward compatibility.
- **Consequences**: Kebocoran in-memory 100% dicegah bahkan jika ada namespace collision pada room ID.

---

### DEC-022: Multi-Tenant Room Presence Isolation in `BroadcastRoomUsers`
- **Context**: Saat user join/leave room, event `TypeRoomUsers` mem-broadcast daftar user aktif di room tersebut. Jika ada user dari tenant berbeda di room yang sama, user list tidak boleh bocor.
- **Decision**: Mengelompokkan client aktif di room berdasarkan `TenantID`. Event `TypeRoomUsers` digenerate secara independen per tenant dan hanya dikirimkan ke client milik tenant terkait.
- **Consequences**: Tidak ada kebocoran metadata pengguna antar tenant.

---

### DEC-023: Tenant-Scoped ClusterEvent Envelope in Redis Pub/Sub
- **Context**: Redis channel `ClusterEventsChannel` (`wuzz:cluster:events`) menerima seluruh event antar node backend Go. Node penerima harus memfilter event sebelum mendistribusikan ke client lokal.
- **Decision**: Menambahkan `TenantID` ke amplop `ClusterEvent`. Seluruh penerbitan wajib menyertakan `TenantID`. Pada sisi penerima (subscriber), `event.TenantID` diperiksa dan disuntikkan ke pesan sebelum diteruskan ke handler lokal (`broadcastLocal`, `NotifyUser`, dll.).
- **Consequences**: Sinkronisasi multi-instance terisolasi penuh per tenant tanpa memerlukan partisi ratusan channel Redis individual.
