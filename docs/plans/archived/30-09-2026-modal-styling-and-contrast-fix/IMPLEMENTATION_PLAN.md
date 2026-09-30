# Implementation Plan — Modal Styling & Color Contrast Bugfix

## 1. Problem Statement
1. **Button Text Contrast Bug**: Pada modal/popup (seperti `KeyConflictModal` tombol "Reset Kunci Baru" & "Batal / Keluar", serta `EditProfileModal` tombol "Batal"), teks tombol tidak terbaca karena berwarna putih (`colors.textOnAccent`) di atas background tombol yang juga putih (`colors.bgSurface`).
2. **EditProfileModal Gap / Floating Bug**: Modal Edit Profil memiliki jarak tidak proporsional di bawahnya (mengambang di atas bottom tab bar) dan tidak menempel di bagian bawah layar (flush bottom sheet).

## 2. Solution Design
1. **`mobile/src/components/Button.tsx`**:
   - Sesuaikan `getTextColor()`: untuk `variant === 'secondary'` gunakan `colors.textPrimary` (`#0f172a`), bukan `colors.textOnAccent` (`#ffffff`).
   - Sediakan `getSpinnerColor()` yang kontras saat tombol secondary sedang `isLoading`.
   - Perbaiki background state saat `disabled` / `isLoading`.
2. **`mobile/src/components/EditProfileModal.tsx`**:
   - Tambahkan `statusBarTranslucent` pada `<Modal>`.
   - Susun ulang wrapper: `KeyboardAvoidingView` sebagai root container overlay dengan `flex: 1, justifyContent: 'flex-end'`.
   - Tambahkan `backdrop` dengan `StyleSheet.absoluteFillObject` dan `onPress={onClose}`.
   - Set `styles.card` agar menempel rapi di tepi bawah layar dengan `paddingBottom: Math.max(insets.bottom, spacing.lg)`.
   - Ubah `formScroll` menjadi `flexShrink: 1` agar tinggi form dinamis dan responsif terhadap keyboard.

## 3. Verification Strategy
- Jalankan `npx tsc --noEmit` di `mobile/` untuk memastikan type check TypeScript 0 error.
- Jalankan `npm run build` di `frontend/` dan `go test -v ./...` di `backend/` untuk menjaga integritas repository secara menyeluruh.
