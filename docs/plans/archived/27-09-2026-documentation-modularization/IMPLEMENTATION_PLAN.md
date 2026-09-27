# Implementation Plan: Inisialisasi Spesifikasi Domain Bisnis (docs/domains/)

## 1. Objective
Membangun layer dokumentasi spesifikasi domain bisnis vertikal (DDD Bounded Contexts) di bawah direktori `docs/domains/`. Menetapkan 7 Core Business Domains + 2 Platform Domains sebagai Single Source of Truth untuk setiap fitur dan aturan bisnis Wuzz Chat, serta menyelaraskan Master Router `PROMPT.md`.

## 2. Target Files
- [NEW] `docs/domains/README.md`: Peta & tata cara penulisan/pemekaran domain bisnis
- [NEW] `docs/domains/AUTH_SESSION.md`: Spesifikasi Autentikasi, JWT, Session & Device Quota
- [NEW] `docs/domains/PROFILE_IDENTITY.md`: Spesifikasi Profil Pengguna, Avatar Studio & Verified Badge
- [NEW] `docs/domains/MESSAGING_CHAT.md`: Spesifikasi Direct Message 1-on-1, Receipts, E2EE, Edit/Delete
- [NEW] `docs/domains/GROUP_FORUM.md`: Spesifikasi Grup `grp_`, Forum Topik `sub_`, RBAC, TTL & Mentions
- [NEW] `docs/domains/MEDIA_LIFECYCLE.md`: Spesifikasi Store-and-Forward, Shared Media Hub, Voice Notes
- [NEW] `docs/domains/WEBRTC_CALLING.md`: Spesifikasi Panggilan Suara P2P, Signaling WS & Audio Routing
- [NEW] `docs/domains/AI_MEMORY.md`: Spesifikasi Group Memory AI, Pipeline M1-M7 & Human Review
- [NEW] `docs/domains/MULTI_TENANT.md`: Spesifikasi B2B Multi-Tenancy, Data Scoping & Header Routing
- [NEW] `docs/domains/NOTIFICATION_SYNC.md`: Spesifikasi Push Notifications (FCM/VAPID) & Redis Pub/Sub
- [MODIFY] `PROMPT.md`: Sinkronisasi Router 3-Tingkat (Konteks, Domain Spek, Log Progres)
- [MODIFY] `docs/plans/active/`: Pelacakan implementasi

## 3. Verification Strategy
- Validasi keberadaan dan isi 10 file dokumen domain di `docs/domains/`
- Validasi automated tests:
  - `go test ./...` di `backend/`
  - `npm run build` di `frontend/`
  - `npx tsc --noEmit` di `mobile/`
- Proteksi git: tetap di branch `dev`, 0 commit sebelum konfirmasi pengguna
