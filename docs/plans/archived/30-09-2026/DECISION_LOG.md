# Decision Log — Milestone M-Mobile-9.1

## DEC-001: Developer-Extensible Metadata via JSONB vs Strict Fixed Columns
- **Context**: Kebutuhan fleksibilitas field profil publik ke depan (link medsos, lokasi, website, badge, statistik, dll) tanpa melakukan migrasi skema database berulang kali.
- **Decision**: Menggunakan kombinasi kolom inti SQL (`bio VARCHAR(255)` & `role VARCHAR(64)`) ditambah kolom `metadata JSONB` (PostgreSQL) / `TEXT` (SQLite) yang menyimpan dictionary terstruktur.
- **Rationale**: Menjaga integritas dan performa pencarian untuk field inti, sekaligus memberikan kebebasan 100% untuk mengekspansi atribut profil di masa depan.

## DEC-002: Multi-Tenant Profil Isolation
- **Context**: Arsitektur Wuzz Chat mendukung multi-tenancy dengan kolom `tenant_id` pada setiap entitas.
- **Decision**: Seluruh endpoint profil (`GET /api/users/{id}`, `PUT /api/users/profile`, `search`) wajib menyertakan filter `tenant_id` dari JWT context, mencegah data profil dilihat atau dimodifikasi lintas tenant.
- **Rationale**: Menjamin kepatuhan isolasi data multi-tenant secara ketat.

## DEC-003: Permission-Driven Action Buttons (Model A & B Foundation)
- **Context**: Kebutuhan pembatasan interaksi publik vs privat (fitur pertemanan / kebijakan siapa yang boleh chat & telepon).
- **Decision**: Menyiapkan field `metadata.privacy` (`allow_direct_messages`, `allow_calls`) dan merancang tombol aksi di `UserProfileScreen` secara modular berbasis state permission (`can_message`, `can_call`).
- **Rationale**: Arsitektur UI tidak perlu dirombak ketika sub-milestone Friend/Connection Request dua arah diimplementasikan penuh.
