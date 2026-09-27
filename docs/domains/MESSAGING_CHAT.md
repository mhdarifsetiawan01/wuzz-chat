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
