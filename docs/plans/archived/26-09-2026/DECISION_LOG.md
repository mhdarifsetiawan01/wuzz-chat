# Decision Log — Milestone M-Mobile-8.6

## DEC-001: Selection of `expo-camera` (`CameraView`) for In-App Live QR Scanning
- **Context**: In React Native / Expo 57, the legacy `BarCodeScanner` component is deprecated in favor of `CameraView` from `expo-camera` which natively bundles high-performance Barcode/QR scanning (`barcodeScannerSettings={{ barcodeTypes: ['qr'] }}`).
- **Decision**: Use `expo-camera`'s `CameraView` with back-facing camera and `enableTorch` support.
- **Consequences**: Zero native bridging overhead, zero extra native libraries, complete compatibility with Expo Go and development builds.

## DEC-002: Multi-Format QR Decoding & Normalization
- **Context**: QR codes generated across different platforms (Web, Mobile, External QR generators) might supply URLs (`wuzz-safety://...`, `https://chat.wuzzhub.id/safety/...`), JSON objects, or plain 30-digit numbers with or without spaces.
- **Decision**: Implement a robust normalizer that strips protocol prefixes and whitespace, extracting only the continuous 30-digit fingerprint string for exact comparison.
- **Consequences**: Fault-tolerant scanning experience across all clients and custom pairing URLs.

## DEC-003: Double-Scan Lock Guard in Scanner Component
- **Context**: Live camera frames fire `onBarcodeScanned` multiple times per second while focused on a QR code.
- **Decision**: Introduce a `scannedLock` ref state in `CameraQRScannerModal` that immediately freezes further scan events until dismissed or reset.
- **Consequences**: Prevents duplicate state dispatches, multiple alert popups, or jarring UI loops.
