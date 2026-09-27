# IMPLEMENTATION SUMMARY — M-Mobile-8.20

## Milestone
**M-Mobile-8.20: CallsHistoryScreen — Integrasi Riwayat Panggilan Real & Dialer**

## Status
`[/] IN PROGRESS`

## Objective
Mengubah tab panggilan `mobile/src/screens/CallsHistoryScreen.tsx` dari mock data statis (`MOCK_CALLS`) menjadi 100% fungsional dengan data riwayat panggilan riil yang persisten di SQLite lokal dan kemampuan memulai panggilan suara WebRTC baru ke kontak via Contact Picker / Dialer Modal.

## Arsitektur & Strategi
1. **Skema & Penyimpanan Riwayat Panggilan di SQLite (`sqliteStorage.ts`)**:
   - Menambahkan tabel `local_call_logs` dengan kolom: `id`, `user_id`, `peer_id`, `peer_username`, `peer_display_name`, `call_type`, `duration_seconds`, `created_at`, `status`.
   - Indexing `(user_id, created_at DESC)` untuk query kilat.
   - Helper methods: `saveCallRecord`, `getCallHistory`, `clearCallHistory`, `deleteCallRecord`, serta integrasi pada `clearUserCache`.
2. **Sinkronisasi Otomatis Lifecycle Panggilan (`CallContext.tsx`)**:
   - Deteksi otomatis akhir panggilan di `CallContext`:
     - Panggilan masuk terjawab (`incoming`): durasi dihitung dari `startTime` saat tersambung.
     - Panggilan tak terjawab / ditolak (`missed`): saat ditolak penerima atau dibatalkan pemanggil.
     - Panggilan keluar (`outgoing`): saat panggilan diakhiri atau ditolak/busy.
   - Guard ref anti-duplicate logging per sesi panggilan.
   - Dukungan fleksibel pada `startCall` untuk otomatis me-resolve `roomId` via `startDirectChat` jika `roomId` belum ada.
3. **Pembaruan UI/UX Tab Panggilan (`CallsHistoryScreen.tsx`)**:
   - Menghapus `MOCK_CALLS` dan mengonsumsi data SQLite lokal via `CallContext` / storage helper scoped per `user.id`.
   - Menambahkan state loading, pull-to-refresh (`RefreshControl`), empty state informatif.
   - Item tap callback confirmation & callback button.
   - Long-press item untuk konfirmasi hapus log panggilan.
4. **FAB Dialer & Contact Picker Modal**:
   - Tombol FAB bulat membuka BottomSheet / Modal pemilih kontak.
   - Debounced search contact via `/api/users/search` dan daftar kontak percakapan aktif.
   - Pemilihan kontak langsung memicu `startCall`.
