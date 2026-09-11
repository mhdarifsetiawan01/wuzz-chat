# PRD — Aplikasi Chat Real-Time (WebSocket)

**Versi**: 1.0 (Fase 1)
**Tujuan proyek**: Belajar membangun komunikasi dua arah (bidirectional) menggunakan WebSocket, dengan Golang sebagai backend dan Next.js sebagai frontend + proxy layer.

---

## 1. Latar belakang & tujuan

Proyek ini dibuat untuk memahami secara praktis:
- Cara kerja WebSocket di Golang (handshake, upgrade connection, broadcast/unicast message)
- Pola arsitektur proxy di Next.js untuk menyembunyikan URL backend asli dari client
- Desain sistem yang scalable — dimulai dari kasus sederhana (1-on-1, anonim, in-memory) tapi strukturnya siap dikembangkan ke fitur yang lebih kompleks

## 2. Scope

### 2.1 Fase 1 (in-scope sekarang)
- Chat **1-on-1** antara dua user
- User **anonim** — tidak ada login, cukup masukkan nickname/session id saat connect
- Pesan disimpan **in-memory** (hilang saat server restart)
- Real-time messaging via WebSocket
- Indikator status: online/offline, typing indicator (opsional, nice-to-have)
- Frontend Next.js mem-proxy semua komunikasi ke backend, backend URL asli tidak terekspos ke browser

### 2.2 Out-of-scope untuk fase 1 (tapi disiapkan arsitekturnya)
- Autentikasi (JWT) — akan masuk fase 2
- Group chat / room dengan banyak peserta — fase 3
- Public chat room — fase 3
- Persistensi pesan ke database — fase 2/3
- Notifikasi push, read-receipt, file/media sharing

## 3. Tech stack

| Layer | Teknologi | Catatan |
|---|---|---|
| Backend | Go + `gorilla/websocket` | WebSocket hub, connection manager |
| Frontend | Next.js (App Router) | UI chat + proxy layer |
| Proxy | Custom Next.js server (`server.js`) menangani event `upgrade` | Lihat bagian 5 |
| Komunikasi | WebSocket (ws://, wss:// di production) | Full-duplex, persistent connection |
| State (fase 1) | In-memory map di Go (`map[string]*Client`) | Diganti Redis/DB di fase berikutnya |

**Catatan penting**: standard library Go tidak punya WebSocket built-in. `gorilla/websocket` dipilih karena paling matang dan paling banyak referensi belajar.

## 4. Arsitektur sistem

```
Browser (Client)
      |
      |  same-origin request (http/ws ke domain Next.js)
      v
Next.js (Proxy layer, custom server.js)
      |
      |  forward via reverse proxy internal, URL backend tidak terlihat browser
      v
Golang Backend (WebSocket Hub)
```

- Browser hanya tahu satu origin: domain Next.js.
- Next.js custom server menangkap event `upgrade` dari HTTP server bawaan Node, lalu memforward koneksi WebSocket ke backend Go menggunakan library proxy (misal `http-proxy` dengan opsi `ws: true`).
- Backend Go menjalankan **hub**: struktur yang menyimpan semua koneksi aktif, dan tahu cara mengirim pesan dari client A ke client B secara spesifik (unicast) — bukan broadcast semua seperti chat room.

### 4.1 Kenapa custom server, bukan `next.config.js` rewrites?
Next.js `rewrites()` bagus untuk REST API, tapi tidak reliable untuk WebSocket upgrade di semua environment deployment (terutama serverless). Custom server memberi kontrol penuh atas proses upgrade koneksi — dan karena tujuan proyek ini belajar, kamu jadi paham betul mekanismenya, bukan cuma pakai fitur jadi.

## 5. Desain komponen backend (Go)

### 5.1 Struktur inti
- **Client**: representasi satu koneksi WebSocket (punya ID, koneksi, channel `send`)
- **Hub**: registry semua client aktif + fungsi routing pesan ke client tujuan
- **Room/Pair**: untuk fase 1, cukup mapping sederhana `clientID -> peerID` (siapa lawan chat siapa)

### 5.2 Desain agar scalable ke fase berikutnya
| Komponen fase 1 | Interface disiapkan untuk | Implementasi fase depan |
|---|---|---|
| `map[string]*Client` in-memory | `ClientStore` interface | Redis-backed store (multi-instance) |
| Pairing manual 1-on-1 | `Room` struct dengan `[]*Client` | Group chat tinggal ubah kapasitas room |
| Anonim (nickname only) | Middleware `AuthMiddleware` kosong/no-op | JWT middleware tinggal di-inject |
| Pesan tidak disimpan | `MessageStore` interface (no-op) | Ganti implementasi ke Postgres/Mongo |

Pola ini (interface dulu, implementasi sederhana dulu) membuat fase 2 dan 3 jadi soal *mengganti implementasi*, bukan menulis ulang sistem.

## 6. Protokol pesan (WebSocket payload)

Format JSON sederhana antar client-server:

```json
{
  "type": "message",
  "from": "clientA",
  "to": "clientB",
  "content": "halo!",
  "timestamp": "2026-09-11T10:00:00Z"
}
```

Tipe pesan (`type`) yang didukung fase 1:
- `join` — client connect, kirim nickname
- `message` — kirim pesan chat
- `typing` — indikator sedang mengetik (opsional)
- `leave` — client disconnect

Desain ini sengaja pakai field `type` supaya gampang ditambah tipe baru (`join_room`, `read_receipt`, dst) tanpa mengubah struktur dasar.

## 7. Functional requirements

1. User membuka aplikasi, memasukkan nickname, sistem generate session/client ID
2. User bisa melihat siapa lawan chat-nya (untuk fase 1: pairing sederhana, misal by room code atau langsung 1-on-1 otomatis)
3. Pesan yang dikirim langsung muncul di sisi lawan chat secara real-time
4. Status koneksi (connected/disconnected) terlihat di UI
5. Jika koneksi WebSocket putus, frontend mencoba reconnect otomatis

## 8. Non-functional requirements

- Latency pengiriman pesan < 200ms (local network/dev)
- Backend bisa handle multiple concurrent connection tanpa blocking (pakai goroutine per client + channel)
- Proxy tidak membocorkan URL/port backend asli ke response header atau network tab browser
- Kode backend terstruktur dengan interface agar mudah di-extend (lihat bagian 5.2)

## 9. Roadmap setelah fase 1

- **Fase 2**: tambah JWT authentication, mulai persist pesan ke database (Postgres)
- **Fase 3**: group chat / room dengan banyak peserta, public chat room
- **Fase 4** (opsional): scale backend pakai Redis pub/sub agar bisa multi-instance Go server

## 10. Struktur folder yang disarankan (untuk vibe coding)

```
/backend (Go)
  /internal/ws       -> hub, client, connection handling
  /internal/store     -> interface + in-memory implementation
  /internal/auth       -> no-op middleware (siap diisi fase 2)
  main.go

/frontend (Next.js)
  /app                -> UI chat
  /server.js          -> custom server + proxy WS upgrade
  /lib/ws-client.ts    -> koneksi WebSocket dari sisi client
```

## 11. Kriteria sukses fase 1

- Dua browser tab bisa saling kirim pesan real-time tanpa refresh
- URL backend Go tidak muncul di Network tab browser (semua request lewat domain Next.js)
- Koneksi WebSocket bertahan selama tab aktif, dan reconnect otomatis saat network sempat putus
