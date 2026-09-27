# 🎯 Wuzz Chat — Domain Specifications (`docs/domains/`)

Direktori ini memuat **Spesifikasi Domain Bisnis Vertikal (DDD Bounded Contexts)**. Setiap dokumen di sini bertindak sebagai **Single Source of Truth (SSOT)** untuk aturan bisnis, model entitas, kontrak API, dan perilaku antarmuka (Web & Mobile) untuk fitur spesifik tersebut.

Berbeda dengan `docs/context/` yang membagi sistem secara horizontal (berdasarkan bahasa/platform: Go Backend, Web Next.js, Mobile React Native), dokumen di sini memotong secara vertikal dari basis data hingga UI.

---

## 🗺️ Peta 7 Domain Bisnis Inti + 2 Domain Platform

| Dokumen Domain | Bounded Context | Ruang Lingkup Fitur Utama |
|---|---|---|
| 🔐 **[`AUTH_SESSION.md`](AUTH_SESSION.md)** | Autentikasi & Sesi | Register, Login, JWT, JTI blacklist, kuota 2 perangkat, session override, Passkey. |
| 👤 **[`PROFILE_IDENTITY.md`](PROFILE_IDENTITY.md)** | Profil & Identitas | UUID immutable, username, display name, Avatar Studio, Verified Badge, kontak. |
| 💬 **[`MESSAGING_CHAT.md`](MESSAGING_CHAT.md)** | Perpesanan 1-on-1 | Direct chat, 3-stage receipts, edit 15m, delete, pin, reactions, E2EE ECDH P-256. |
| 👥 **[`GROUP_FORUM.md`](GROUP_FORUM.md)** | Grup & Topik Forum | Grup `grp_`, topik forum `sub_`, RBAC, akses publik/privat, TTL 7d/30d, @mentions. |
| 📦 **[`MEDIA_LIFECYCLE.md`](MEDIA_LIFECYCLE.md)** | Siklus Hidup Media | Store-and-Forward (auto-ACK $0 cost), Shared Media Hub 7d, Voice Notes, WebP. |
| 📞 **[`WEBRTC_CALLING.md`](WEBRTC_CALLING.md)** | Panggilan Suara P2P | Panggilan 1-on-1 WebRTC, signaling WebSocket, STUN/TURN, audio hardware routing. |
| 🤖 **[`AI_MEMORY.md`](AI_MEMORY.md)** | Group Memory AI | Pipeline M1–M7, worker PostgreSQL `FOR UPDATE SKIP LOCKED`, review suite. |
| 🏢 **[`MULTI_TENANT.md`](MULTI_TENANT.md)** | Multi-Tenancy (Platform) | Partisi data `tenant_id`, fallback `tenant_default`, header `X-Tenant-ID`, isolasi B2B. |
| 🔔 **[`NOTIFICATION_SYNC.md`](NOTIFICATION_SYNC.md)** | Notifikasi & Sinkronisasi | FCM v1 data-only push, background decryptor, Web Push VAPID, Redis cluster sync. |

---

## 📐 Format Standar Setiap Dokumen Domain
Setiap file spesifikasi domain disusun dengan format standar berikut:
1. **Definisi Bisnis & Aturan Main (*Business Invariants*)**: Logika validasi dan batasan aturan produk.
2. **Model Domain Backend DDD**: Entitas di `backend/internal/<domain>/`, Value Objects, dan use case di `Service`.
3. **Skema Basis Data**: Tabel-tabel relasional dan indeks yang dimiliki oleh domain ini.
4. **Kontrak API & Wire Protocol**: Endpoint REST dan kamus event WebSocket yang relevan.
5. **Perilaku Antarmuka (Web & Mobile)**: Alur interaksi pengguna, loading states, dan error handling.

---

## 🚀 Prinsip Fleksibilitas & Pemekaran Domain (Extensibility)
Direktori ini bersifat **Open for Extension**:
1. **Menambah Fitur Baru**: Kapanpun Wuzz Chat menambahkan fitur besar baru (misal: *Status Stories 24 Jam* atau *Avatar Marketplace*), cukup buat file baru di sini (misal `STATUS_STORIES.md`) dan daftarkan di tabel router `PROMPT.md`.
2. **Memecah Domain Lama**: Jika sebuah domain tumbuh terlalu kompleks, domain tersebut dapat dimekarkan menjadi dua file independen tanpa merusak dokumen lainnya.
