# Executive Summary — Milestone 8.5: Group & Subgroup Multi-User Mention Engine (@username)

## 📌 Status Snapshot
- **Milestone:** Milestone 8.5 — Group & Subgroup Multi-User Mention Engine (`@username`)
- **Fase:** Fase 8 (Core Parity & Advanced Messaging)
- **Status:** 🟡 In Planning (Awaiting User Approval)
- **Branch Aktif:** `dev`

## 🎯 Target Utama
1. **Strict Membership Scoping**: Autocomplete mention `@` hanya menampilkan anggota terdaftar dari ruang aktif (hanya anggota grup jika di dalam grup; hanya anggota subgrup jika di dalam subgrup).
2. **Multi-Mention Support**: Mendukung pemanggilan multi-pengguna dalam 1 pesan (misal `@alice @bob tolong review`).
3. **Aurora Glassmorphism Autocomplete Popover**: Dropdown suggest anggota yang responsif di atas keyboard mobile maupun desktop, lengkap dengan avatar, verified badge, role, dan keyboard navigation (Arrow Up/Down + Enter/Tab).
4. **Interactive Mention Styling**: Teks `@username` dirender dengan tag aksen Soft Azure di timeline linimasa chat, dengan highlight ekstra untuk diri sendiri (`@me`).
5. **Fail-Closed Backend & Prioritized Web Push**: Backend memvalidasi relasi keanggotaan, menyimpan array UUID mentions di database, dan memicu Web Push Notification khusus bagi pengguna yang di-mention.
