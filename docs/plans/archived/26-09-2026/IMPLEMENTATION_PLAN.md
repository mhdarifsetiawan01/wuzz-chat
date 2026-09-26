# Implementation Plan — Milestone M-Mobile-8.6: In-App Live Camera QR Scanner & Instant Safety Number Verification

## 1. Overview & Goals
Provide Signal & WhatsApp grade in-person key verification by combining camera-based QR code scanning with ECDH P-256 fingerprint matching in WuzzChat Mobile.

## 2. Technical Architecture & Component Flow

```text
[SafetyNumberModal]
   │
   ├── User clicks "📷 Pindai Kode QR"
   ▼
[CameraQRScannerModal]
   ├── Checks & requests camera permission (useCameraPermissions)
   ├── Renders CameraView (facing="back", barcodeScannerSettings={barcodeTypes: ['qr']})
   ├── Aurora Glassmorphism Viewfinder:
   │   ├── Reticle: 260x260 dp, 4 corner brackets (#00f2fe electric cyan)
   │   ├── Animated Scanning Beam (up & down translation via Animated API)
   │   ├── Top Bar: Close (✕) & Torch toggle (🔦)
   │   └── Bottom Caption: "Arahkan kamera ke Kode QR Nomor Keamanan lawan bicara"
   ▼
[Barcode Detected (onBarcodeScanned)]
   ├── Debounce lock (prevents double triggers)
   ├── Extracted Payload:
   │   ├── Format A: `wuzz-safety://${currentUserId}/${peerId}/${fingerprint}` or `wuzz://safety/...`
   │   ├── Format B: `{"type":"wuzz:v1:safety", "safetyNumber":"..."}` or `wuzz:v1:safety:<fingerprint>`
   │   └── Format C: Raw 30-digit numeric string (with/without whitespace)
   ▼
[Verification Logic in SafetyNumberModal]
   ├── Normalize scanned fingerprint (strip spaces)
   ├── Compare with current computed safety number (`cleanScanned === cleanCurrent`)
   ├── MATCH:
   │   ├── Persist verification via `e2eeService.setContactSafetyVerified(peerId, safetyNumber, true)`
   │   ├── Update local state `isVerified = true`
   │   ├── Trigger `onVerificationChanged?.(true)`
   │   ├── Show Green Success Badge & Toast: "Telah Diverifikasi Melalui Pemindaian Kamera"
   │   └── Close Camera Modal
   └── MISMATCH:
       ├── Show Danger Alert: "Nomor Keamanan Tidak Cocok! Kemungkinan serangan Man-in-the-Middle atau kunci kontak telah diperbarui."
       └── Reset scan lock for re-attempt or dismiss
```

## 3. Impacted & Created Files
1. `mobile/package.json`: Install `expo-camera` (`~16.x` / compatible with Expo 57).
2. `mobile/src/components/CameraQRScannerModal.tsx`: New component implementing camera feed, permission prompt, Aurora overlay, animated laser, torch toggle, and QR handler.
3. `mobile/src/components/SafetyNumberModal.tsx`:
   - Add scanner trigger button ("📷 Pindai Kode QR") on QR tab and action bar.
   - Embed `CameraQRScannerModal`.
   - Add parsing & validation routine for QR payloads.
   - Display verified badge ("Telah Diverifikasi Melalui Pemindaian Kamera") when verified via camera.
   - Alert handling for mismatch vs success.
4. `docs/MOBILE_INTEGRATION_GUIDE.md`: Update Section 7 checklist item to mark In-App Live Camera QR Scanner as completed.

## 4. Verification & Testing Strategy
1. **Typecheck Gate**: `npx tsc --noEmit` in `mobile/` (0 errors).
2. **Backend Regression Test**: `go test -v ./...` in `backend/` (100% pass).
3. **Static Analysis & Token Optimization**: Ensure no magic numbers, proper theme tokens, safe area insets handled, and resource cleanup on unmount.
