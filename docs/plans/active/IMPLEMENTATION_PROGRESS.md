# IMPLEMENTATION_PROGRESS.md — Checklist Pengerjaan

- [x] **Milestone 2.1: Hard Blocker & Fail-Closed Guard Frontend**
  - [x] `page.tsx`: Blokir tampilan chat ketika `deviceConflict.isOpen === true`
  - [x] `page.tsx`: Cegah pengiriman pesan langsung (direct chat) jika `!roomAESKey` (E2EE Fail-Closed)
  - [x] `DeviceConflictModal.tsx`: Hapus tombol close bebas dan ikat gestur back ke konfirmasi logout
- [x] **Milestone 2.2: Mode Perangkat Baru & In-App Camera QR Scanner**
  - [x] Pasang dependency `html5-qrcode` pada frontend
  - [x] `DeviceTransferModal.tsx`: Tambahkan mode scanner kamera langsung (`scan`)
  - [x] `DeviceTransferModal.tsx`: Sembunyikan tab "Buat QR" jika dibuka dari alur konflik perangkat (`hideGenerate={true}`)
  - [x] Cleanup resource kamera saat modal ditutup atau tab berpindah
- [x] **Milestone 2.3: Backend WebSocket Single-Session Kick**
  - [x] `hub.go`: Putus koneksi WebSocket lama ketika client baru terdaftar dengan UserID yang sama
  - [x] `hub_single_device_test.go`: Buat unit test verifikasi single session kick
- [x] **Milestone 2.4: Verifikasi & Audit Kualitas**
  - [x] Jalankan test backend Go (`go test ./...` - 100% PASS)
  - [x] Validasi build frontend Next.js (`npm run build` - 100% PASS)
  - [x] Sinkronisasi dokumentasi proyek
