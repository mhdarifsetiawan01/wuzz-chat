# 📈 Wuzz Chat — Domain Progress Logs (`docs/progress/`)

Direktori ini memuat **Log Progres & Riwayat Implementasi** yang terpisah per domain teknis. Tujuannya adalah mendokumentasikan fitur yang telah selesai (*What's Done*), status pengujian, dan rencana langkah berikutnya (*What's Next*) tanpa membebani context window dengan riwayat domain lain.

---

## 🗺️ Peta Dokumen Progres per Domain

| Dokumen Progres | Domain Teknis | Lingkup Pelaporan |
|---|---|---|
| ⚙️ **[`BACKEND.md`](BACKEND.md)** | Go Backend & Modular Monolith | Riwayat use case `authz`, `messaging`, `group`, `memory`, WebSocket Hub, migrasi SQL, dan rilis Fly.io. |
| 💻 **[`FRONTEND.md`](FRONTEND.md)** | Next.js 16 Web Application | Riwayat UI/UX web, App Router, Design Tokens, portal modals, Web Crypto E2EE, dan IndexedDB cache. |
| 📱 **[`MOBILE.md`](MOBILE.md)** | React Native Expo Mobile App | Riwayat tonggak M-Mobile-1 s/d M-Mobile-8.12, APK build, WebRTC voice call, FCM push background decrypt, dan Trusted Device pattern. |
| 🏢 **[`MULTI_TENANT.md`](MULTI_TENANT.md)** | Multi-Tenancy Engine | Riwayat implementasi isolasi data, schema additive migration, middleware header routing, dan tenant registry. |
| 🤖 **[`AI_MEMORY.md`](AI_MEMORY.md)** | Group Memory AI Engine | Riwayat pipeline M1–M7, antrean PostgreSQL `SKIP LOCKED`, integrasi provider Gemini, dan review suite. |

---

## 📝 Konvensi Pembaruan Dokumen Progres
Setiap kali menyelesaikan tugas pada suatu domain:
1. Perbarui dokumen progres yang bersangkutan di direktori ini (`docs/progress/<DOMAIN>.md`).
2. Cantumkan:
   - **Ringkasan Pengerjaan**: Apa saja yang ditambahkan/diubah.
   - **File yang Terdampak**: Daftar file path yang dimodifikasi.
   - **Bukti Pengujian Otomatis**: Status kelulusan `go test`, `npm run build`, atau `npx tsc`.
