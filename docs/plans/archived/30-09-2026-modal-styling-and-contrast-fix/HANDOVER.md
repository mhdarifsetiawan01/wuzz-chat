# Handover — Modal Styling & Color Contrast Bugfix

## Perubahan yang Telah Diimplementasikan:
1. `mobile/src/components/Button.tsx`:
   - Memperbaiki kontras teks tombol `variant="secondary"` menjadi `colors.textPrimary` (`#0f172a`), menyelesaikan masalah teks tidak terbaca pada modal `KeyConflictModal` (tombol Reset Kunci & Batal/Keluar), `EditProfileModal` (tombol Batal), `E2EEKeyModal`, dan `StorageSettingsModal`.
   - Mengatur warna spinner loading pada tombol sekunder ke `colors.accentPrimary`.
2. `mobile/src/components/EditProfileModal.tsx`:
   - Menambahkan `statusBarTranslucent` pada Modal agar layout edge-to-edge di Android aktif sempurna.
   - Menjadikan `KeyboardAvoidingView` sebagai overlay utama (`flex: 1, justifyContent: 'flex-end'`) dengan backdrop transparan `StyleSheet.absoluteFill`.
   - Mengunci `card` agar menempel rapat di tepi bawah layar (*flush bottom sheet*) dengan padding aman `Math.max(insets.bottom, spacing.lg)` dan `formScroll` dinamis (`flexShrink: 1`).

## Bukti Hasil Testing:
- `mobile/`: `npx tsc --noEmit` -> **0 error (PASS)**
- `backend/`: `go test ./...` -> **100% PASS**
- `frontend/`: `npm run build` -> **Compiled successfully (PASS)**
