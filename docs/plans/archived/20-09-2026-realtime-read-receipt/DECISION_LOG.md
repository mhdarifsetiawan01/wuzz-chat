# Decision Log

### DEC-028: Non-Blocking Batch Status Progression in IndexedDB
- **Konteks**: Saat lawan bicara membuka room, event receipt berupa bulk read (`id: ""`).
- **Keputusan**: Menggunakan index `by_room` pada IndexedDB dengan cursor update berbasis filter `STATUS_WEIGHT[newStatus] > STATUS_WEIGHT[existing.status]`.
- **Rasional**: Mencegah status regression dan menjaga proses I/O tetap non-blocking asynchronous agar UI tetap responsif 60fps.
