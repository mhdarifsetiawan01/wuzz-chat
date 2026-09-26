# AI Context — Milestone M-Mobile-8.6: In-App Live Camera QR Scanner & Instant Safety Number Verification

## 1. Project Boundaries & Environment
- **Workspace Root**: `/home/bms-del112/BMS/personal-project/wuzz-chat`
- **Target Subsystem**: `mobile/` (React Native Expo 57, TypeScript)
- **Active Branch**: `dev` (STRICT: main branch is protected)
- **Engine**: Node.js v20+, Expo SDK 57, React 19, React Native 0.86

## 2. Key References & Dependencies
- `docs/MOBILE_INTEGRATION_GUIDE.md`: Section 7 Checklist (In-App Live Camera QR Scanner), Section 2 Single Device Identity, Section 3 E2EE Cryptographic Standards.
- `mobile/src/components/SafetyNumberModal.tsx`: 30-digit fingerprint UI & modal.
- `mobile/src/components/QRCodeView.tsx` & `mobile/src/services/qrCodeService.ts`: Pure TypeScript QR generator.
- `mobile/src/services/e2eeService.ts`: `generateSafetyNumber`, `isContactSafetyVerified`, `setContactSafetyVerified`.
- `expo-camera`: CameraView with `barcodeScannerSettings={{ barcodeTypes: ['qr'] }}` and `onBarcodeScanned`.

## 3. Strict Operating Constraints
1. **Branch Protection**: Never work on or commit to `main`.
2. **Token Efficiency**: Line-range reading, diff-chunk editing, concise outputs.
3. **Server Lifecycle**: AI must kill any test servers before completing response (`fuser -k <port>/tcp`).
4. **Approval Gate**: Stop after presenting this plan and wait for explicit user approval before modifying code.
