# 📚 Wuzz Chat — Domain Context Primers (`docs/context/`)

Direktori ini memuat **Domain Context Primers** modular untuk pengembang dan agen AI. Setiap file dirancang agar terfokus pada domain teknis tertentu, padat informasi, bebas dari *context bloat*, dan langsung mengarahkan pada implementasi kode yang tepat.

---

## 🗺️ Peta Domain Primer

| File Dokumen | Domain Teknis | Lingkup Kode | Kapan Harus Dibaca? |
|---|---|---|---|
| ⚙️ **[`BACKEND.md`](BACKEND.md)** | Go Backend & Modular Monolith | `backend/internal/...` | Saat mengerjakan REST API, Auth, WebSocket Hub, SQL queries, background workers, atau integrasi database. |
| 💻 **[`FRONTEND.md`](FRONTEND.md)** | Next.js 16 Web Application | `frontend/app/...`, `frontend/components/...` | Saat mengerjakan UI/UX web, App Router, Design Tokens (`globals.css`), Web Crypto E2EE, atau IndexedDB cache. |
| 📱 **[`MOBILE.md`](MOBILE.md)** | React Native Expo Mobile App | `mobile/...` | Saat mengerjakan aplikasi mobile Android/iOS, layout single-screen, WebRTC audio calling, Keystore E2EE, atau FCM push. |
| 🏢 **[`MULTI_TENANT.md`](MULTI_TENANT.md)** | Multi-Tenancy Architecture | `backend/internal/tenant/...`, middleware | Saat merancang atau mengimplementasikan isolasi tenant, header `X-Tenant-ID`, tenant registry, atau skema partisi. |
| 🤖 **[`AI_MEMORY.md`](AI_MEMORY.md)** | Group Memory AI Engine | `backend/internal/memory/...`, review drawer | Saat memodifikasi ekstraksi memori M1–M7, worker `SKIP LOCKED`, interface `AIService` (Gemini), atau viewer arsip. |
| 🏛️ **[`ARCHITECTURE.md`](ARCHITECTURE.md)** | High-Level Architecture & Infra | Skema DB, Redis, Fly.io, Vercel | Saat meninjau ERD relasional, clustering Redis multi-node, optimasi query $O(1)$, atau model keamanan zero-trust. |

---

## 💡 Prinsip Penggunaan untuk AI Agent
1. **Targeted Priming**: AI **HANYA** memuat dokumen konteks yang secara langsung relevan dengan instruksi yang diberikan oleh pengguna.
2. **Token Efficiency**: Hindari membaca semua primer sekaligus. Jika tugas berkaitan dengan "Auth Backend", cukup buka `BACKEND.md`.
3. **No Guessing**: Setiap domain primer mendefinisikan lokasi file sebenarnya (*exact path*), konvensi kode, pola arsitektur, dan cara verifikasi testing.
