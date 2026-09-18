# Decision Log — Milestone 8.5: Group & Subgroup Multi-User Mention Engine (@username)

## DEC-010: Strict Scoping of Autocomplete to Active Conversation Members
- **Context:** Pengguna dapat berada di obrolan grup utama atau subgrup (forum topik).
- **Decision:** Daftar mention suggestion **hanya** mengambil anggota terdaftar dari ID percakapan aktif (`groupDetails.members`). Jika berada di dalam subgrup (`sub_...`), yang muncul hanya anggota yang telah bergabung ke subgrup tersebut.
- **Rationale:** Mencegah user menandai orang yang tidak memiliki akses atau tidak berpartisipasi dalam topik tersebut, menjaga privasi dan relevansi diskusi.

## DEC-011: Multi-Mention via UUID List in Stored Messages
- **Context:** Pengguna dapat men-tag beberapa orang sekaligus dalam satu pesan.
- **Decision:** Di database dan protokol wire, mention disimpan sebagai array UUID string (`mentions: ["uuid-1", "uuid-2"]`). Di teks pesan tetap tertulis `@username`.
- **Rationale:** Menjaga kekebalan terhadap pergantian display name / username (UUID-First Architecture, DEC-008), dan memungkinkan lookup cepat pada penerima push notifikasi.

## DEC-012: Out of Scope for Mass Mentions (@everyone, @all)
- **Context:** Fitur `@all` atau `@everyone` umum di platform seperti Discord/Slack.
- **Decision:** Fitur mention massal ditunda (*skipped*) sesuai kesepakatan untuk menjaga kenyamanan pengguna dan mencegah potensi spam atau abuse admin.

## DEC-013: Strict Immutable Identifier Enforcement (UUID-First Architecture)
- **Context:** User menegaskan: *"pastikan semua logic pakai data immutable ya, jangan sampai ada kesalahan menggunakan misal username atau display_name atau nama grup."*
- **Decision:** Seluruh logika bisnis, otorisasi, relasi database, WebSocket protocol, dan push notification wajib 100% menggunakan identifier kekal (immutable):
  1. Pengguna wajib diidentifikasi HANYA melalui `users.id` (UUID), bukan `username`, `display_name`, atau `nickname`.
  2. Ruang percakapan wajib diidentifikasi HANYA melalui `conversations.id` (UUID / `grp_<UUID>` / `sub_<UUID>`), bukan judul/nama grup.
  3. Field `mentions` yang disimpan di DB, di-broadcast via WS, dan diteruskan ke push service adalah array UUID string (`[]string` berisi `user.id`).
  4. Deteksi self-mention di frontend memprioritaskan pengecekan `message.mentions?.includes(selfId)` (UUID matching) agar kebal terhadap pergantian profil/username.
- **Rationale:** Mencegah kebocoran data, impersonasi, dan desinkronisasi saat pengguna mengubah username atau display name mereka di masa mendatang.
