# Decision Log — Milestone M-Mobile-8.10

## DEC-001: 100% Interoperable PBKDF2 & AES-256-GCM Key Wrapping
- **Context**: Mobile app WuzzChat menggunakan `@noble/curves`, `@noble/hashes`, dan `@noble/ciphers` sedangkan web client menggunakan standar Web Crypto API (`window.crypto.subtle`). Keduanya harus menghasilkan enkripsi/dekripsi bit-exact pada bundle transfer kunci.
- **Decision**: Menggunakan `@noble/hashes/pbkdf2` dengan parameter SHA-256, 100.000 iterasi, 32-byte derived key, dan `@noble/ciphers/aes` GCM dengan 12-byte IV serta authentication tag 16-byte di akhir ciphertext. Telah diverifikasi kompatibel 100% dengan Web Crypto API.
- **Alternatives Considered**: Menggunakan library pihak ketiga lain (seperti react-native-crypto-js), ditolak karena `@noble/*` sudah ada di dependencies dan merupakan implementasi modern audited pure TypeScript.

## DEC-002: Format QR Code & Parsing Fleksibel
- **Context**: Perangkat pengirim merender QR code. Klien penerima bisa berupa HP WuzzChat, kamera HP umum, atau web browser.
- **Decision**: QR Code memuat URL standar `https://chat.wuzzhub.id/transfer?token=<session_token>`. Pemindai QR mobile akan mengekstrak nilai token baik jika formatnya URL, JSON object (`{"token":"..."}`), ataupun raw hex token string 64-karakter secara cerdas.
- **Alternatives Considered**: Hanya memuat raw hex string, ditolak karena menyulitkan pengguna jika discan dengan aplikasi kamera bawaan yang mengharapkan tautan web.

## DEC-003: Hubungan KeyConflictModal dengan DeviceTransferModal
- **Context**: Ketika pengguna baru login di HP kedua dan kunci E2EE sudah terdaftar di server, server merespons HTTP 409 (`KEY_ALREADY_REGISTERED`). Sebelumnya pengguna hanya disuguhkan opsi Reset Kunci (yang memutus riwayat E2EE lama).
- **Decision**: Menambahkan tombol sekunder *"Transfer dari Perangkat Lain"* di `KeyConflictModal` yang langsung membuka `DeviceTransferModal` dalam mode Pindai QR. Dengan demikian pengguna dapat mengimpor kunci secara instan tanpa perlu mereset akun.

## DEC-004: Optimasi HKDF-SHA256 (RFC 5869) untuk Generasi Kunci Instan (<1ms)
- **Context**: PBKDF2 100.000 iterasi di lingkungan JavaScript interpreted pada mobile ARM CPU (Hermès) membutuhkan waktu ~1.5–3.5 detik untuk menghitung hash, menyebabkan loading spinner pada saat generate QR terasa lambat. Padahal token sesi yang digunakan adalah token acak CSPRNG 256-bit entropy tinggi (bukan password lemah manusia).
- **Decision**: Meng-upgrade KDF default menjadi **HKDF-SHA256 (RFC 5869)** dengan schema version `v: 2` (dengan fallback backward-compatibility `v: 1` PBKDF2) pada klien Mobile dan Web. Hasil kalkulasi turun dari ~3000ms menjadi **<1ms (instan)**, sehingga kode QR muncul seketika saat modal dibuka.

