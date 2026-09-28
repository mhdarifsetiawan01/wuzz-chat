# AI Context — Mobile Device Limit Override Selection

## Boundaries & Scope
- **Target Subsystem**: Mobile React Native (`mobile/`)
- **Impacted Files**:
  - `mobile/src/api/types.ts`: Menambahkan tipe data `ActiveDeviceItem` dan memperluas `ApiError`.
  - `mobile/src/api/client.ts`: Memastikan `active_devices` dari payload error diteruskan ke `ApiError`.
  - `mobile/src/components/DeviceLimitModal.tsx`: Komponen modal React Native baru untuk pemilihan perangkat yang ingin di-kick.
  - `mobile/src/screens/LoginScreen.tsx`: Integrasi `DeviceLimitModal` menggantikan `Alert.alert` sederhana.
- **Constraints**:
  - Wajib mematuhi Mobile Theme (`colors`, `spacing`, `radius`, `typography`) dari `frontend/DESIGN.md`.
  - Anti-magic numbers: Gunakan token terdaftar di `mobile/src/theme/`.
  - TypeScript strict: 0 lint / typecheck error (`npx tsc --noEmit`).
