# Decision Log — Modular Monolith Hardening

## DEC-016: Strategi Pembersihan Handlers (Eliminasi Dual-Path Debt Tanpa Mengubah Kontrak REST)
- **Konteks:** Handler HTTP di `internal/api/` memiliki percabangan ganda: jika service != nil maka panggil service, jika nil maka jalankan implementasi legacy store langsung (mencapai ribuan baris).
- **Keputusan:** Menghapus seluruh cabang fallback legacy di Milestone 1, karena seluruh dependency injection di `internal/app/wire.go` sudah 100% menggunakan Application Services. Kontrak HTTP REST (endpoint URL, parameter JSON request/response, HTTP status code) tetap 100% identik dan tidak berubah sedikit pun.
- **Dampak:** Kode handler menyusut drastis, lebih mudah dibaca dan diuji oleh programmer level apapun, serta mencegah bug tidak terduga akibat eksekusi cabang kode lama.

## DEC-017: Pemisahan Milestone Bertahap (Pragmatic Step-by-Step)
- **Konteks:** Pengguna meminta pengerjaan dilakukan per milestone secara bertahap dan tidak sekaligus.
- **Keputusan:** Pekerjaan dipecah menjadi 3 Milestone atomik:
  1. Milestone 1: Pembersihan Handlers (HTTP Layer)
  2. Milestone 2: Decoupling Realtime Message Ingestion (WebSocket Layer)
  3. Milestone 3: Mobile Gateway Readiness (Platform & Push Layer)
  Setiap milestone harus lulus tes mandiri dan mendapat persetujuan sebelum lanjut ke milestone berikutnya.
