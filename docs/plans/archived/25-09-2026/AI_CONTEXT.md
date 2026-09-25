# AI Context & Active Workspace — Milestone 6: OpenAPI Contract & Headless Integration Guide

## 1. Project Identity
- **Repository**: `wuzz-chat` (Monorepo Go Backend + Next.js Frontend)
- **Active Branch**: `dev`
- **Canonical Architecture Blueprint**: `docs/TENANT_ENGINE_MASTER_PLAN.md`
- **Current Milestone**: **Milestone 6: OpenAPI Contract & Headless Integration Guide**
- **Date**: 2026-09-24 / 2026-09-25

## 2. Milestone 6 Objective & Scope
Transformasi WuzzChat dari *Internal Headless Engine* menjadi *Fully Documented, Standard-Compliant B2B Engine* dengan:
1. Menyusun kontrak mesin kanonikal **OpenAPI 3.1.0** (`docs/openapi.yaml`) yang mencakup 100% endpoint REST API (Identity, B2B Gateway, Messaging, Groups, Ephemeral Fora, AI Memory, Push, Devices, dan Storage).
2. Menyusun **Headless Integration Guide** (`docs/HEADLESS_INTEGRATION_GUIDE.md`) sebagai panduan integrasi ramah developer pihak ketiga (B2B, Mobile Flutter/React Native, SaaS) dengan alur JIT Provisioning, Token Exchange, WebSocket Wire Format (RFC 6455), dan E2EE.
3. Menyediakan self-hosted HTTP documentation endpoint di backend Go (`GET /api/openapi.yaml` atau embedded Swagger UI `/api/docs`).
4. Mengembangkan test suite validasi sintaks & kelengkapan endpoint untuk memastikan kontrak API selalu sinkron dengan handler Go.

## 3. Mandatory Safety & Protocol Rules
- **Dev-Only Work**: Seluruh perubahan kode, pengujian, dan komitmen wajib berada di branch `dev`. Dilarang menyentuh atau commit ke `main` secara langsung.
- **Server Lifecycle**: Jika server dijalankan sementara untuk verifikasi, wajib dimatikan sebelum akhir respons (`fuser -k <port>/tcp`).
- **Pre-Commit Gate**: Tidak boleh menjalankan `git commit` sebelum ada konfirmasi eksplisit ("selesai") dari pengguna.
- **Automated Verification**: Wajib membuktikan kebenaran dengan `go test ./...` dan `npm run build` sebelum pelaporan.
