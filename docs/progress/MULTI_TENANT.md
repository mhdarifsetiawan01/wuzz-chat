# 🏢 Multi-Tenant Progress Log — Wuzz Chat

Dokumen ini mencatat status kapabilitas **Multi-Tenancy Engine** (Tenant-Aware & Headless B2B Engine).

---

## 📊 Status Ringkasan
- **Spesifikasi Domain**: [`docs/domains/MULTI_TENANT.md`](../domains/MULTI_TENANT.md)
- **Milestone 0–6**: SELESAI ✅ (stabilisasi, skema aditif + registry, propagasi context, provisioning B2B, isolasi realtime, scoping AI memory, freeze engine).
- **Audit Isolasi Tenant (5 Okt 2026)**: T1–T6 dikerjakan dengan pola tes-dulu (lihat bawah).
- **Belum ada**: widget customer service embeddable, pengunjung anonim, model tiket/agen, webhook keluar, allowed-origin per tenant, endpoint admin tenant/API key.

---

## ✅ Milestone yang Telah Selesai
- **M0** Enkapsulasi query pengguna ke `AuthService`, fallback `default`, pemisahan `user_credentials`.
- **M1** Tabel `tenants`, kolom `tenant_id` aditif, `UNIQUE(tenant_id, username)`.
- **M2** `TenantMiddleware` + propagasi `context.Context` ke service/repository.
- **M3** Gateway B2B: `B2BAuthGuard` (`X-App-ID`/`X-App-Secret`), `POST /api/v1/auth/provision-token`, `POST /api/v1/auth/exchange` (token sekali pakai, TTL 60 dtk).
- **M4** Isolasi realtime: hub WS, presence, typing, panggilan, envelope cluster per tenant.
- **M5** AI memory ter-scope tenant.

## 🛡️ Audit Isolasi Tenant — Perbaikan (5 Okt 2026)
| ID | Celah | Perbaikan | Tes |
|---|---|---|---|
| T1 | `X-Tenant-ID` menimpa tenant JWT; register publik ke tenant mana pun | Token valid + header berbeda → 403. Register hanya untuk tenant `default` (403 selain itu). | `TestTenantMiddleware_RejectsHeaderTokenTenantMismatch`, `TestAuthHandler_RegisterClosedForNonDefaultTenant` |
| T2 | DM lintas tenant tanpa validasi target | Kedua user harus ada & satu tenant → selain itu `ErrUserNotFound` (HTTP 404). | `TestTenant_DirectChatRejectsCrossTenantTarget` |
| T3 | `member_ids` awal grup tidak divalidasi tenant | User beda tenant / tak dikenal dilewati. | `TestTenant_CreateGroupSkipsCrossTenantInitialMembers` |
| T4 | Upsert device mengambil alih device lintas tenant | `ErrDeviceTenantMismatch` jika pemilik lama beda tenant. Rebind sesama tenant (ganti akun di perangkat sama) tetap diizinkan. | `TestTenant_DeviceRebindRejectsCrossTenantTakeover` |
| T5 | `/uploads/` menampilkan listing direktori (enumerasi file semua tenant) | `api.NewUploadsFileSystem` tidak melayani direktori. | `TestUploadsFileSystem_NoDirectoryListing` |
| T6 | Guard tenant hilang bila `TenantService` nil; tidak ada deteksi data tercemar | `TenantMiddleware` selalu terpasang di router. `store.FindCrossTenantMemberships` untuk audit baca-saja. | `TestRouter_TenantGuardActiveWithoutTenantService`, `TestTenant_FindCrossTenantMemberships` |

### Risiko residual (sengaja belum dikerjakan)
- `tenantshared.MustFromContext` tetap **fallback ke `default`** bila context tanpa tenant (bukan fail-closed murni). Dipertahankan karena wrapper legacy non-context memang berarti `default`.
- Operasi per-ID (pesan, pin, reaksi, edit, hapus, `IsUserInConversation`) mengandalkan keanggotaan, tanpa filter `tenant_id`. Aman selama semua jalur pembuat keanggotaan tervalidasi tenant (T2/T3/AddGroupMembers/JoinPublicGroup).
- `/uploads/` masih tanpa autentikasi (URL = UUID acak). Untuk dokumen sensitif B2B perlu signed URL.
- Rebind device sesama tenant tidak mencabut sesi pemilik lama.
- Belum diaudit: jalur baca `memory_store`, `push` (hapus subscription per endpoint), `transfer_store`, `link_preview` (SSRF), endpoint media ack/signed URL, jalur Redis cluster.

### Tindakan operasional pasca-deploy
Jalankan sekali di DB produksi untuk mendeteksi sisa keanggotaan lintas tenant dari celah lama (baca-saja):
```sql
SELECT cm.conversation_id, c.type, COALESCE(c.tenant_id,'default') AS conv_tenant,
       cm.user_id, COALESCE(u.tenant_id,'default') AS user_tenant
FROM conversation_members cm
JOIN conversations c ON c.id = cm.conversation_id
JOIN users u ON u.id = cm.user_id
WHERE COALESCE(c.tenant_id,'default') <> COALESCE(u.tenant_id,'default');
```
Hasil kosong = bersih.

---

## 🎯 Berikutnya (B2B produk)
1. Endpoint admin tenant, API key, dan allowed-origin per tenant.
2. Grup via B2B API + webhook keluar.
3. Model support (tamu, tiket, agen, dashboard) + widget embed.
