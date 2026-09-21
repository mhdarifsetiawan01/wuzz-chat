# Decision Log — Identity & Auth Phase 0 (Quick Wins)

## DEC-01: Non-Breaking JTI Revocation Store
- **Context**: JWT saat ini berumur 7 hari dan stateless, tidak bisa dicabut saat logout atau password change.
- **Decision**: Menambahkan field JTI UUID ke `jwt.RegisteredClaims.ID` dan membuat tabel `revoked_tokens(jti, user_id, revoked_at, expires_at)`.
- **Rationale**: Menyimpan daftar token yang dicabut (blacklist) jauh lebih hemat ruang dibanding mencatat semua sesi di tabel sesi penuh (yang akan dilakukan di Phase 1). Token yang sudah kedaluwarsa secara alami dibersihkan lewat periodic worker sehingga tabel tetap ramping.

## DEC-02: Password Re-verification on E2EE Reset
- **Context**: `ForceResetPublicKey` memungkinkan pencurian akun atau pergantian kunci privat secara sepihak jika token JWT bocor.
- **Decision**: Mengharuskan `password` di payload `POST /api/users/public-key/reset` dan memvalidasinya sebelum mengizinkan pembaruan kunci, serta menyediakan endpoint `POST /api/auth/verify-password` sebagai pre-check standar.
- **Rationale**: Mencegah serangan pengambilalihan akun via stolen token, menjaga integritas E2EE.

## DEC-03: Global Token Revocation on Password Change
- **Context**: Ketika user mengganti password karena curiga akun dibajak, token aktif di perangkat penyerang harus langsung dibatalkan.
- **Decision**: `POST /api/auth/change-password` memanggil `RevokeAllUserTokens(userID)` yang memasukkan pencabutan global atau menandai token user sebagai revoked.
- **Rationale**: Menutup akses semua sesi aktif yang beredar secara instan setelah password diperbarui.
