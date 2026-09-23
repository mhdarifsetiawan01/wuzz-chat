# Active Implementation Plan: Modular Monolith & Pragmatic DDD

> Blueprint arsitektur referensi: [`MODULAR_MONOLITH_DDD.md`](../../MODULAR_MONOLITH_DDD.md)

## Status Saat Ini
- **Fase 1 (Pemisahan GroupStore dari SQLUserStore)**: **SELESAI & DEPLOYED** ✅
- **Fase 2 (Extract Application Service Auth & Identity)**: **STANDBY / SIAP DIKERJAKAN** 🎯

## Langkah Kerja Fase 2 Berikutnya
1. Membuat interface & implementasi `AuthService` (Application Service) untuk use case login, register, device management, dan session revocation.
2. Memisahkan `IdentityService` untuk profil, E2EE key, dan user discovery.
3. Merampingkan `api/AuthHandler` menjadi thin HTTP transport.
4. Menjalankan verifikasi automated test suite 100% tanpa mengubah schema database.
