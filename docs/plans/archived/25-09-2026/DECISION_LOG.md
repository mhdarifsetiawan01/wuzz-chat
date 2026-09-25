# Decision Log — Milestone 6: OpenAPI Contract & Headless Integration Guide

- **Milestone**: Milestone 6: OpenAPI Contract & Headless Integration Guide
- **Active Branch**: `dev`
- **Status**: Active / Ready for Execution

---

## Architecture Decisions

### DEC-01: OpenAPI 3.1.0 Specification Standard
- **Context**: Sistem WuzzChat kini beroperasi sebagai headless multi-tenant messaging engine. Diperlukan standar kontrak mesin yang modern untuk automated testing, SDK generation, dan integrasi B2B pihak ketiga.
- **Decision**: Mengadopsi standar **OpenAPI 3.1.0**.
- **Rationale**: OpenAPI 3.1.0 memiliki kompatibilitas 100% dengan JSON Schema 2020-12, mendukung representasi `null` yang akurat (`type: ["string", "null"]`), mempermudah pemetaan model Go/TypeScript, dan siap mendukung definisi webhooks untuk Milestone 7.

### DEC-02: Format Tunggal Kanonikal `docs/openapi.yaml`
- **Context**: Kontrak OpenAPI dapat dipecah menjadi banyak file kecil (modular multi-file) atau satu file monolitik YAML.
- **Decision**: Menggunakan **file tunggal kanonikal `docs/openapi.yaml`**.
- **Rationale**: File tunggal YAML memudahkan distribusi ke pihak ketiga, dapat langsung disajikan oleh Go HTTP handler (`GET /api/openapi.yaml`), dan tidak memerlukan build-step bundler eksternal saat runtime.

### DEC-03: Self-Hosted Offline-Resilient Documentation UI (Scalar / Swagger UI)
- **Context**: Endpoint `GET /api/docs` harus dapat dibuka dengan cepat tanpa rentan terhadap pemblokiran jaringan atau CDN pihak ketiga yang lambat.
- **Decision**: Menggunakan HTML mandiri yang memuat library UI dokumentasi interaktif modern (Scalar atau Swagger UI) yang ringan dan mengarah langsung ke `/api/openapi.yaml`.
- **Rationale**: Memberikan developer experience premium saat pengujian lokal maupun production tanpa membebani ukuran binary Go.

### DEC-04: Standarisasi Error Envelope RFC 7807 Problem Details
- **Context**: Konsistensi penanganan error sangat krusial bagi developer pihak ketiga yang mengintegrasikan SDK mereka.
- **Decision**: Menstandardisasi skema error response OpenAPI dengan format `{ "error": string, "code": string, "details": any }` yang selaras dengan RFC 7807 dan implementasi Go backend saat ini.
- **Rationale**: Mencegah fragmentasi penanganan error di klien eksternal.
