# 💬 Domain: Messaging & Direct Chat (`MESSAGING_CHAT`)

Dokumen ini adalah spesifikasi definitif untuk domain **Perpesanan Langsung (Direct Message 1-on-1), Tanda Terima, Fitur Pesan Modern, dan Kriptografi E2EE** pada Wuzz Chat.

---

## 📋 1. Aturan Bisnis & Invarian (*Business Invariants*)

1. **3-Stage Read Receipts**:
   - `🕒` (Pending / Antrean pengiriman lokal)
   - `✓` (`sent` — Diterima dan disimpan di server)
   - `✓✓` (`delivered` — Terkirim ke perangkat penerima yang online)
   - `✓✓` biru neon (`read` — Dibuka dan dilihat di jendela obrolan penerima)
2. **Aturan Edit Pesan**:
   - Pengeditan hanya diizinkan dalam rentang waktu **15 menit** sejak pesan dikirim (`PUT /api/messages/edit`).
   - Pesan yang diedit memiliki tanda visual `(diedit)` pada bubble obrolan.
3. **Aturan Hapus Pesan**:
   - **Hapus untuk Saya (*Delete for Me*)**: Kapan saja, hanya menyembunyikan pesan di perangkat pengguna sendiri.
   - **Hapus untuk Semua Orang (*Delete for Everyone*)**: Maksimal **1 menit** sejak pesan dikirim. Konten di server dan linimasa lawan bicara digantikan oleh placeholder `🚫 Pesan ini telah dihapus`.
4. **Penyematan Pesan (*Pin Message*)**:
   - Maksimal **3 pesan disematkan** per ruang percakapan.
   - Menggunakan mekanisme FIFO: jika menyematkan pesan ke-4, pesan pin terlama otomatis dilepas (*unpinned*).
5. **Penerusan Pesan (*Forward Message*)**:
   - Dapat diteruskan ke 1 hingga 5 ruang obrolan sekaligus (`POST /api/messages/forward`).
   - Menampilkan label `↪ Diteruskan` jika `is_forwarded: true`.

---

## 🔐 2. Standar Kriptografi End-to-End Encryption (E2EE)

- **Algoritma**: **ECDH NIST P-256 + HKDF-SHA256 + AES-256-GCM** (NIST RFC Cryptography).
- **Format Wire**: Pesan 1-on-1 dikirim dalam format terenkripsi:
  `e2ee:v1:<base64_iv>:<base64_ciphertext>:<base64_tag>`
- **Zero-Knowledge Backend**: Server hanya bertindak sebagai *relay*; server tidak memiliki private key dan tidak pernah dapat membaca plaintext percakapan 1-on-1.
- **Safety Number Fingerprint 30-Digit**: Fingerprint numerik deterministik berbasis SHA-256 dari gabungan public key kedua pengguna, dibagi dalam format `XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX` untuk verifikasi visual atau via QR scan.
- **Migrasi Kunci via QR Code**: Pemindahan identitas E2EE antar-perangkat menggunakan bundle terenkripsi AES-256-GCM (PBKDF2 256-bit) via QR ephemeral (TTL 5 menit) dan single-use consume atomic di database.

---

## 🏛️ 3. Model Backend DDD (`backend/internal/messaging/`)

```text
backend/internal/messaging/
├── entity.go         # Message, Conversation, ConversationMember, PinnedMessage
├── repository.go     # Interface MessageRepository
├── service.go        # MessageService (Send, Edit, Delete, Forward, Pin, History)
└── infra/            # SQL Message Repository Adapter
```

---

## 🗄️ 4. Skema Basis Data

- `conversations`: `id` (PK, UUID), `type` (`direct`/`group`), `created_at`, `updated_at`.
- `conversation_members`: `conversation_id`, `user_id`, `is_pinned`, `cleared_at`.
- `messages`: `id` (PK, UUID), `conversation_id`, `sender_id`, `content`, `type`, `is_deleted`, `is_forwarded`, `reply_to_id`, `created_at`.
- `message_receipts`: `message_id`, `user_id`, `status` (`delivered`/`read`), `updated_at`.

---

## 🔌 5. Kontrak API & Event Real-Time

### A. REST Endpoints
| Method | Endpoint | Keterangan |
|---|---|---|
| `GET` | `/api/conversations` | Daftar obrolan aktif + pesan terakhir + unread badge |
| `GET` | `/api/messages/history` | Riwayat obrolan (mendukung checkpoint `since`) |
| `PUT` | `/api/messages/edit` | Mengedit pesan dalam batas 15 menit |
| `POST` | `/api/messages/delete` | Menghapus pesan (*for_me* / *for_everyone*) |
| `POST` | `/api/messages/forward` | Meneruskan pesan ke 1–5 room |
| `POST` | `/api/messages/pin` / `unpin` | Menyematkan / melepas pin pesan |
| `GET` | `/api/messages/search` | Mencari teks pesan dalam obrolan aktif |

### B. Event WebSocket
- `chat_message`: Pengiriman dan penerimaan pesan baru.
- `delivery_receipt`: Pembaruan status pengiriman (`delivered` / `read`).
- `message_edited`: Siaran perubahan teks pesan.
- `message_deleted`: Siaran penarikan pesan.
- `message_pinned` / `message_unpinned`: Siaran perubahan status semat.

> **Catatan penamaan:** daftar di atas memakai nama konseptual. Nilai `type` yang sebenarnya di kabel ada di `backend/internal/ws/message.go` (mis. `message`, `receipt`, `typing`), dan itulah yang menjadi acuan kontrak.

### C. Kontrak Event `typing` (Indikator "Sedang Mengetik")

Event efemeral untuk memberi tahu anggota room bahwa seseorang sedang mengetik. Tidak disimpan di database, tidak ada ACK, dan **tidak ada event "berhenti mengetik"**: penerima sendiri yang memadamkan indikator (lihat aturan penerima). Berlaku sama untuk DM, grup, dan subgrup. Implementasi acuan: server `backend/internal/ws/client.go` (`onTyping`), klien mobile `mobile/src/hooks/usePeerTyping.ts` dan `mobile/src/utils/typingTracker.ts`, klien web `frontend/app/chat/page.tsx`.

**Klien → Server**

```json
{ "type": "typing", "room": "<room_id>" }
```

- Hanya `type` dan `room` yang dipakai. Field lain dibuang atau ditimpa server.
- `nickname` dari klien **diabaikan**; server memakai nickname koneksi.
- Server **tidak mengenal** `is_typing`. Jangan mengirim `typing` untuk menandakan "berhenti"; event itu tetap dianggap "sedang mengetik" oleh penerima.

**Server → Penerima**

```json
{
  "type": "typing",
  "from": "<user_id pengirim>",
  "room": "<room_id>",
  "nickname": "Alice",
  "tenant_id": "default",
  "timestamp": "2026-10-05T00:41:27Z"
}
```

`from`, `nickname`, `tenant_id`, dan `timestamp` selalu diisi server dari koneksi yang terautentikasi, tidak dari payload klien.

**Invarian server (ditegakkan di `ws.Client.onTyping` dan `ws.Hub.broadcastLocal`)**

| # | Aturan | Perilaku bila dilanggar |
|---|---|---|
| 1 | **Rate limit**: maksimal 3 event `typing` per 2 detik per koneksi | Kelebihannya dibuang diam-diam |
| 2 | **Otorisasi room**: pengirim harus anggota room (fail-closed) | Dibuang diam-diam, tercatat di log keamanan server |
| 3 | **Isolasi tenant**: tenant diambil dari koneksi (klaim JWT), bukan dari payload; event hanya diteruskan ke klien dengan tenant yang sama, walau ID room identik | `tenant_id` palsu dari klien ditimpa; tidak pernah bocor lintas tenant |
| 4 | **Tanpa pengiriman balik** ke koneksi pengirim | Perangkat lain milik pengguna yang sama **tetap menerima** (lihat aturan penerima #3) |
| 5 | Tidak disimpan di DB, tanpa ACK; bila cluster Redis aktif, tiap event juga di-publish ke broker agar node lain meneruskannya | — |
| 6 | **Tidak ada batas ukuran grup di server**: event diteruskan ke seluruh anggota room | Biaya penyiaran tumbuh seiring jumlah anggota, jadi klien yang membatasi (aturan pengirim #3) |

Tidak ada pesan error ke klien untuk pelanggaran #1 dan #2.

**Aturan pengirim (klien)**

1. **Throttle**: kirim paling banyak 1 event per 2 detik selama pengguna mengetik (web dan mobile: 2000 ms). Ini di bawah batas server 3 per 2 detik.
2. **Jangan kirim** saat teks kosong atau saat mengedit pesan lama.
3. **Batas grup**: mobile hanya mengirim bila percakapan adalah DM, atau grup dengan jumlah anggota **diketahui dan ≤ 30** (`TYPING_MAX_GROUP_MEMBERS`). Jumlah anggota belum diketahui = tidak mengirim. Alasan: satu orang mengetik menghasilkan sekitar 3–5 event per pesan, masing-masing diteruskan ke N−1 anggota (ditambah satu publish Redis), sehingga di grup besar beban penyiaran berlipat dan indikatornya pun hampir selalu menyala.

**Aturan penerima (klien)**

1. **Saring room**: tampilkan hanya bila `room` sama dengan room yang sedang dibuka.
2. **Kedaluwarsa sendiri**: anggap pengetik berhenti bila tidak ada event baru dalam 3 detik (mobile `TYPING_TTL_MS = 3000`; web 2,5 detik). Event baru dari orang yang sama memperpanjang waktu tanpa menggambar ulang.
3. **Abaikan event milik sendiri**: bila `from` sama dengan ID pengguna saat ini, buang event itu. Perangkat lain milik pengguna yang sama ikut menerima event typing-nya sendiri (terbukti di uji backend), dan tanpa penyaringan ini perangkat kedua menampilkan "sedang mengetik" untuk dirinya sendiri.
4. **Padam seketika** saat pesan (`message`) dari pengirim yang sama masuk di room itu.
5. **Kunci identitas pengetik**: `from` (ID pengguna). `nickname` hanya untuk tampilan karena tidak dijamin unik.
6. **Penerimaan tidak dibatasi** ukuran grup: event dari perangkat lama atau dari grup kecil tetap ditampilkan.
7. **Teks tampilan (mobile)**: DM "sedang mengetik"; grup "Alice sedang mengetik", "Alice dan Bob sedang mengetik", atau "N orang sedang mengetik" (3 orang atau lebih). Teks menggantikan subjudul header selama ada yang mengetik dan kembali ke subjudul semula saat padam.

**Multi-tenant**

- Perilaku server identik untuk semua tenant; tenant ditentukan server dari koneksi (`ws/handler.go`), sehingga klien tenant mana pun tidak perlu mengirim tenant.
- Klien non-resmi (B2B headless) wajib mengimplementasikan aturan pengirim dan penerima di atas sendiri, karena server hanya menegakkan invarian #1–#6.
- Saat ini belum ada pengaturan fitur per tenant: batas 30 anggota adalah konstanta klien. Rencana: pindahkan ke pengaturan tenant dan tegakkan di server (lewati penyiaran `typing` bila room melebihi batas) setelah registri tenant (Milestone 1) tersedia.

**Uji**

- Backend: `backend/internal/ws/hub_typing_tenant_test.go` (isolasi tenant, `tenant_id` palsu, jalur anggota percakapan, non-anggota, rate limit).
- Mobile: `mobile/scripts/test/typing-tracker.test.js` (kedaluwarsa, perpanjangan, padam saat pesan masuk, batas kirim, teks tampilan, kunci pengetik berbasis `from`, dan penyaringan event milik sendiri).
