# Implementation Plan — Milestone M-Mobile-8.10

## 1. Objectives & Goals
Mengimplementasikan alur **QR Code E2EE Device Transfer & Multi-Device Companion Linking** pada aplikasi Mobile WuzzChat sesuai dengan panduan `docs/MOBILE_INTEGRATION_GUIDE.md` Section 3D & Section 7.

## 2. Target Modified & Created Files
- **Created**:
  - `mobile/src/api/transfer.ts`: REST client untuk endpoint transfer backend (`/api/users/transfer/create` dan `/api/users/transfer/consume`).
  - `mobile/src/services/keyTransfer.ts`: Crypto key wrapping service (PBKDF2-SHA256, AES-256-GCM, bundle packing/unpacking, konversi format JWK <-> Keystore).
  - `mobile/src/components/DeviceTransferModal.tsx`: Modal lengkap penautan & migrasi perangkat (Mode Bagi Kunci / QR Generator, Mode Pindai Kamera, Mode Input Manual).
  - `mobile/src/services/__tests__/keyTransfer.test.ts` (atau test simulasi transfer interoperabilitas Mobile <-> Web).
- **Modified**:
  - `mobile/src/api/index.ts`: Ekspor modul transfer API.
  - `mobile/src/services/index.ts`: Ekspor modul keyTransfer service.
  - `mobile/src/components/index.ts`: Ekspor `DeviceTransferModal`.
  - `mobile/src/context/AuthContext.tsx`: Tambahkan `importTransferredKeyPair` untuk menyimpan keypair hasil transfer dan memperbarui state E2EE menjadi `ready`.
  - `mobile/src/screens/RecentChatsScreen.tsx`: Tambahkan tombol/icon "Tautkan Perangkat" di header untuk membuka `DeviceTransferModal`.
  - `mobile/src/components/KeyConflictModal.tsx`: Sediakan tombol "Transfer dari Perangkat Lain" sebagai alternatif reset kunci dengan password.

## 3. Technical Architecture & Data Flow

```text
[Device A (Sumber/Pengirim)]               [Server Go]                 [Device B (Target/Penerima)]
         │                                      │                                    │
1. Generate session_token (64-hex)              │                                    │
2. Pack & Encrypt keypair via AES-GCM (PBKDF2)  │                                    │
3. POST /api/users/transfer/create ────────────►│ (Simpan di Redis/Memory, TTL 5m)  │
4. Render QR: https://.../transfer?token=...    │                                    │
         │                                      │                                    │
         │ ◄────────── Scan QR via CameraQRScannerModal ─────────────────────────────┤
         │                                      │                                    │
         │                                      │◄── POST /api/users/transfer/consume┤ (Kirim session_token & device_id)
         │                                      ├───────────────────────────────────►│ (Return encrypted_bundle)
         │                                      │                                    │
         │                                      │                       5. Dekripsi via PBKDF2
         │                                      │                       6. Simpan ke Keystore
         │                                      │                       7. Sesi aktif simultan!
```

## 4. Key Wrapping Specification
- **Algorithm**: AES-256-GCM
- **Key Derivation Function**: PBKDF2 with SHA-256, 100,000 iterations, 16-byte random salt.
- **Payload Schema**:
  ```json
  {
    "ciphertext": "<base64>",
    "iv": "<base64_12bytes>",
    "salt": "<base64_16bytes>",
    "v": 1
  }
  ```
- **Plaintext Data**:
  ```json
  {
    "privateKeyJWK": "{\"kty\":\"EC\",\"crv\":\"P-256\",\"d\":\"...\",\"x\":\"...\",\"y\":\"...\",\"ext\":true,\"key_ops\":[\"deriveKey\"]}",
    "publicKeyJWK": "{\"kty\":\"EC\",\"crv\":\"P-256\",\"x\":\"...\",\"y\":\"...\",\"ext\":true,\"key_ops\":[]}",
    "createdAt": 1720000000000
  }
  ```

## 5. Verification Strategy
1. **Automated Interoperability Unit Test**: Uji roundtrip enkripsi di mobile dan dekripsi di web/node, serta konversi JWK <-> Keystore Hex.
2. **TypeScript Compilation Check**: `npx tsc --noEmit` di folder `mobile/`.
3. **Backend Unit Tests**: `go test -v ./internal/api/...` di folder `backend/`.
4. **Frontend Build Check**: `npm run build` di folder `frontend/`.
