# Implementation Plan — Milestone 6: OpenAPI Contract & Headless Integration Guide

## 1. Technical Context & Motivation
Sesuai cetak biru arsitektur pada `docs/TENANT_ENGINE_MASTER_PLAN.md`, WuzzChat telah menyelesaikan Milestone 0 hingga Milestone 5 (Prerequisite Stabilization, Schema Migration, Repository Isolation, External B2B Provisioning & Auth Gateway, Realtime Tenant Isolation, dan AI Memory Tenant Scoping).

Backend Go kini telah sepenuhnya multi-tenant dan headless. Namun, untuk dapat dikonsumsi oleh mitra B2B, developer eksternal, atau tim mobile independen (Flutter, React Native, Swift, Kotlin), sistem memerlukan:
1. **Machine-Readable Contract**: File spesifikasi formal standar OpenAPI 3.1.0 untuk code generation (SDK generator), automated API testing, dan integrasi OpenAPI tooling.
2. **Headless Integration Guide**: Dokumentasi arsitektur integrasi yang memandu developer pihak ketiga dari nol hingga berhasil membangun ruang obrolan real-time dengan enkripsi E2EE dan integrasi AI Memory.
3. **Self-Hosted Documentation UI**: Kemampuan backend Go menyajikan spesifikasi OpenAPI dan dokumentasi interaktif tanpa bergantung pada koneksi internet pihak ketiga.

---

## 2. Scope & Technical Architecture

### 2.1 Endpoint Inventory (Target OpenAPI Coverage: 100%)
Berikut adalah seluruh surface area REST API yang wajib terpetakan ke dalam kontrak OpenAPI:
1. **B2B Integration Gateway**:
   - `POST /api/v1/auth/provision-token` (Server-to-Server JIT User Provisioning via `X-App-ID` & `X-App-Secret`)
   - `POST /api/v1/auth/exchange` (Client Exchange Token to Session JWT)
2. **Identity & Authentication**:
   - `POST /api/auth/register` (Registrasi akun baru)
   - `POST /api/auth/login` (Login & penerbitan token sesi 7 hari)
   - `GET /api/auth/me` (Profil pengguna aktif)
   - `POST /api/auth/logout` (Pencabutan token via JTI blacklist)
   - `POST /api/auth/change-password` (Penggantian kata sandi)
   - `GET /api/auth/devices` (Daftar perangkat aktif & manajemen kuota sesi)
3. **Conversations & Messaging**:
   - `GET /api/conversations` (Daftar obrolan aktif)
   - `POST /api/conversations` (Inisiasi percakapan 1-on-1)
   - `GET /api/conversations/{id}` (Detail percakapan & metadata room)
   - `GET /api/messages` (Riwayat pesan dengan paginasi kursor)
   - `POST /api/messages/upload` (Unggah berkas media store-and-forward)
   - `GET /api/messages/pinned` & `POST /api/messages/pin` (Manajemen pesan tersemat)
4. **Groups & Ephemeral Fora**:
   - `POST /api/groups` (Pembuatan grup baru)
   - `GET /api/groups/{id}` (Detail grup & hak akses)
   - `POST /api/groups/{id}/members` & `DELETE /api/groups/{id}/members/{user_id}` (Kelola anggota)
   - `POST /api/groups/{id}/subgroups` (Pembuatan forum ephemeral bertenggat waktu/TTL)
   - `GET /api/groups/{id}/subgroups` (Daftar forum aktif & kedaluwarsa)
   - `POST /api/subgroups/{id}/join` & `POST /api/subgroups/requests/{id}/respond` (Alur persetujuan forum privat)
5. **AI Memory Engine**:
   - `GET /api/memory/drafts` (Antrean draf memori yang menunggu validasi admin)
   - `GET /api/memory/drafts/{id}` (Detail draf & seluruh artefak memori)
   - `PATCH /api/memory/drafts/{id}/artifacts/{art_id}` (Penyuntingan artefak Human-in-the-Loop)
   - `DELETE /api/memory/drafts/{id}/journey` (Penghapusan Journey Lite)
   - `POST /api/memory/drafts/{id}/approve` (Persetujuan & publikasi snapshot memori)
   - `POST /api/memory/drafts/{id}/reject` (Pembatalan draf memori)
   - `GET /api/groups/{id}/memories` (Koleksi arsip memori terpublikasi bagi anggota grup)
   - `GET /api/memories/{id}` (Detail memori terpublikasi & pelacakan view event)
6. **Push & Utility**:
   - `POST /api/push/subscribe` (Pendaftaran Web Push VAPID / FCM token)
   - `GET /api/link-preview` (Ekstraksi metadata OpenGraph)
   - `GET /health` (Probe kesiapan server & status database)

### 2.2 Headless Integration Guide Structure
Dokumen `docs/HEADLESS_INTEGRATION_GUIDE.md` akan disusun dengan struktur:
1. **Arsitektur Headless WuzzChat**: Konsep pemisahan UI klien dan Backend Engine.
2. **Alur Autentikasi B2B**:
   - Step 1: Backend Anda meminta exchange token via `POST /api/v1/auth/provision-token`.
   - Step 2: Klien aplikasi Anda menukar exchange token menjadi Session JWT via `POST /api/v1/auth/exchange`.
3. **Koneksi Real-time WebSocket (RFC 6455)**:
   - URL Handshake: `wss://<host>/ws?token=<jwt>&device_id=<dev_id>`.
   - Wire format JSON pesan dan event: `message`, `delivery_receipt`, `read_receipt`, `typing`, `reaction`, `room_users`, `session_replaced`, `memory_approved`.
   - Exponential reconnect backoff & heartbeat keep-alive (Ping/Pong 30s).
4. **Implementasi E2EE (End-to-End Encryption)**:
   - Alur enkripsi lokal Web Crypto / Libsodium / Signal Protocol standard.
   - Pertukaran kunci publik dan transfer kunci antar perangkat (QR Code / Transfer Key).
5. **Manajemen Grup & AI Memory Integration**:
   - Pembuatan forum ephemeral ber-TTL.
   - Review draf memori AI via REST API dan integrasi event `memory_approved`.
6. **Error Handling & Best Practices**:
   - Standar RFC 7807 Problem Details.
   - Rate limiting headers (`X-RateLimit-*`).

---

## 3. Step-by-Step Execution Plan

### Phase 1: Inventory & Schema Preparation
1. Audit seluruh router handler di `backend/internal/app/router.go` dan `backend/internal/api/` untuk mencatat seluruh path, query params, request body, dan error status.
2. Definisikan komponen skema bersama (Shared Schemas): `User`, `Tenant`, `Conversation`, `Message`, `MemoryDraft`, `MemoryArtifact`, `ApprovedMemory`, `ErrorResponse` (RFC 7807), `SecuritySchemes`.

### Phase 2: Authoring OpenAPI 3.1 Specification (`docs/openapi.yaml`)
1. Tulis file `docs/openapi.yaml` dengan kepatuhan penuh terhadap standar OpenAPI 3.1.0.
2. Definisikan Security Schemes:
   - `BearerAuth`: HTTP Bearer JWT token.
   - `B2BAppID`: Header `X-App-ID`.
   - `B2BAppSecret`: Header `X-App-Secret`.
3. Cantumkan contoh payload nyata (*concrete examples*) pada setiap request body dan 200/201 response.
4. Validasi sintaks OpenAPI menggunakan tools parser / linter untuk memastikan zero syntax errors.

### Phase 3: Authoring Headless Integration Guide (`docs/HEADLESS_INTEGRATION_GUIDE.md`)
1. Buat dokumen panduan integrasi lengkap dengan diagram ASCII/Mermaid alur data.
2. Sertakan cuplikan kode integrasi konkret:
   - cURL & Node.js/TypeScript untuk backend B2B (JIT provisioning).
   - TypeScript / React / Flutter untuk koneksi WebSocket & state event handler.
3. Dokumentasikan penanganan Close Code khusus WebSocket (`4001: SESSION_REPLACED`, `4003: TENANT_MISMATCH`, dll).

### Phase 4: Self-Hosted API Documentation Endpoint in Go Backend
1. Tambahkan route handler di `backend/internal/app/router.go`:
   - `GET /api/openapi.yaml`: Menyajikan file `openapi.yaml` mentah dengan header `Content-Type: application/yaml`.
   - `GET /api/docs`: Menyajikan halaman HTML mandiri yang merender Swagger UI atau Scalar UI secara offline/embedded.
2. Pastikan endpoint dokumentasi ini aman, memiliki kontrol CORS yang tepat, dan tidak membocorkan kredensial internal.

### Phase 5: Automated Verification & Testing Gate
1. Implementasikan automated unit test `backend/internal/api/openapi_test.go`:
   - Menguji bahwa file `docs/openapi.yaml` dapat dibaca dan valid.
   - Menguji bahwa endpoint `GET /api/openapi.yaml` dan `GET /api/docs` merespons dengan HTTP 200 OK.
   - Menguji integritas perutean handler.
2. Jalankan pengujian menyeluruh:
   - `go test -v ./...` di direktori `backend/` (100% lulus).
   - `npm run build` di direktori `frontend/` (100% lolos kompilasi Turbopack).
3. Sinkronkan Tier 1 documentation (`docs/TENANT_ENGINE_MASTER_PLAN.md` dan `docs/PROGRESS.md`).

---

## 4. Definition of Done (DoD)
- [ ] File `docs/openapi.yaml` tersusun lengkap mencakup 100% endpoint REST API aktif dan valid sesuai OpenAPI 3.1.
- [ ] File `docs/HEADLESS_INTEGRATION_GUIDE.md` tersedia dan mencakup panduan integrasi komprehensif bagi developer pihak ketiga.
- [ ] Endpoint `GET /api/openapi.yaml` dan `GET /api/docs` aktif di backend Go dan teruji.
- [ ] Test suite `openapi_test.go` lolos 100%.
- [ ] Seluruh automated test suite (`go test -v ./...` dan `npm run build`) lulus tanpa error.
- [ ] Dokumentasi diarsipkan dan branch `dev` bersih serta siap untuk di-commit setelah persetujuan pengguna.
