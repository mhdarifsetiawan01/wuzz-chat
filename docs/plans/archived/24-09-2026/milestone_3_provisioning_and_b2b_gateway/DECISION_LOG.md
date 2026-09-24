# DECISION_LOG.md — Milestone 3 Architectural Decisions

### DEC-001: SQL Atomic Consume for Exchange Tokens
- **Context**: Exchange tokens hanya boleh digunakan 1 kali (single-use) dengan TTL singkat (60 detik) dan harus tahan terhadap race condition maupun multi-instance server.
- **Decision**: Menggunakan atomic conditional SQL UPDATE:
  `UPDATE exchange_tokens SET used_at = $1 WHERE token = $2 AND used_at IS NULL AND expires_at > $1`
  Jika `RowsAffected == 0`, token ditolak (expired, already used, atau not found).
- **Consequences**: Sangat aman dari race condition (double-spend), multi-node safe di Fly.io tanpa ketergantungan wajib pada Redis, dan kompatibel baik di PostgreSQL maupun SQLite.

### DEC-002: JIT User Identifier & Username Mapping
- **Context**: Di sistem WuzzChat, tabel `users` memiliki kolom `username VARCHAR(64) NOT NULL` dengan constraint `UNIQUE(tenant_id, username)`. Pengguna eksternal datang dengan `external_user_id` bebas dari third-party backend.
- **Decision**: Menambahkan kolom `external_user_id VARCHAR(128) DEFAULT ''` pada tabel `users` dengan index per tenant `(tenant_id, external_user_id)`. Untuk username internal WuzzChat, jika user belum terdaftar, username dibuat otomatis dengan pola `ext_<sanitized_external_id>` (fallback UUID jika bentrok), sehingga interoperabilitas internal (seperti percakapan, notifikasi, dan WebSocket routing) tetap 100% konsisten.
- **Consequences**: Tidak ada breaking changes pada skema atau kode yang sudah bergantung pada `User.Username`.

### DEC-003: Session JWT Claim `device_id` Extension
- **Context**: Spesifikasi mensyaratkan JWT hasil penukaran token memuat claim `user_id`, `tenant_id`, `device_id`, dan `jti`.
- **Decision**: Menambahkan field `DeviceID string json:"device_id,omitempty"` pada struct `UserClaims` di `internal/auth/jwt.go`.
- **Consequences**: 100% backward compatible dengan token lama yang tidak memiliki `device_id`.
