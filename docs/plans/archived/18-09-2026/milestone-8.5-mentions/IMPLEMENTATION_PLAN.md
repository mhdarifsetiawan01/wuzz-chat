# Technical Implementation Plan: Group & Subgroup Multi-User Mention Engine (@username)

## 1. Problem Statement & Objectives
Saat ini obrolan grup dan subgrup/forum belum memiliki mekanisme pemanggilan terarah (*direct addressing / mentions*). Pengguna kesulitan menarik perhatian anggota tertentu dalam diskusi multi-user yang aktif.

Tujuan:
- Menyediakan UX mention yang mulus (ketik `@` -> suggestion popover -> insert nama).
- Mengisolasi anggota yang bisa di-mention secara ketat: hanya anggota grup jika di grup, hanya anggota subgrup jika di subgrup.
- Mendukung multi-mention dalam 1 pesan.
- Memberikan highlight tag pada pesan di linimasa chat.
- Mengirim notifikasi Web Push prioritas kepada pihak yang di-mention saat offline.

## 2. Technical Architecture & Data Flow

### A. Database Layer (PostgreSQL & SQLite)
- Auto-migration non-destruktif:
  - `ALTER TABLE messages ADD COLUMN IF NOT EXISTS mentions TEXT DEFAULT '[]';` (PostgreSQL)
  - `ALTER TABLE messages ADD COLUMN mentions TEXT DEFAULT '[]';` (SQLite)
- Kolom `mentions` menyimpan JSON string array berupa UUID pengguna yang di-mention, misal `["uuid-1", "uuid-2"]`.

### B. Backend Go Layer
1. `internal/store/store.go`:
   - Tambahkan field `Mentions string` pada struct `StoredMessage`.
2. `internal/store/sql.go`:
   - Update query `INSERT INTO messages` dan `GetRoomHistoryForUser` (termasuk batched CTE) untuk menyertakan kolom `mentions`.
3. `internal/ws/message.go`:
   - Tambahkan field `Mentions []string json:"mentions,omitempty"` pada struct `Message`.
4. `internal/ws/hub.go`:
   - Validasi fail-closed: verifikasi setiap ID dalam `msg.Mentions` adalah anggota valid dari `roomID`.
   - Teruskan `msg.Mentions` ke `ps.NotifyOfflineRecipients`.
5. `internal/push/push.go`:
   - Jika penerima push notifikasi termasuk dalam `msg.Mentions`, format notifikasi dengan judul prioritas:
     `"🔔 [Sender] menyebut Anda di [Group]"` serta set tag/flag `is_mention: true`.

### C. Frontend Next.js Layer
1. `lib/types.ts`:
   - Perbarui tipe `Message`: tambahkan `mentions?: string[]`.
2. `app/chat/MessageInput.tsx`:
   - Tambahkan props `members?: GroupMember[]`.
   - Deteksi karakter `@` dan kata kunci pencarian.
   - Komponen popover autocomplete `MentionSuggestPopover`:
     - Render daftar anggota yang cocok (filter `username` dan `display_name`, exclude self).
     - Menampilkan avatar, nama, username, verified badge, dan role badge.
     - Dukungan navigasi keyboard (Arrow Up, Arrow Down, Enter, Escape) dan mouse click / mobile touch.
     - Posisi floating di atas input pill dengan styling Aurora Glassmorphism.
   - Multi-mention accumulator: melacak user IDs yang di-insert ke dalam teks.
   - Kirimkan `mentions: string[]` pada callback `onSend`.
3. `app/chat/MessageBubble.tsx`:
   - Parser teks mention: render `@username` dengan highlight badge (`.mention-tag`).
   - Jika mention merujuk ke diri sendiri (`@currentUsername` atau current user ID ada di `mentions`), berikan style khusus (`.mention-tag-me`) dengan pendaran aksen.
4. `app/chat/page.tsx`:
   - Pass `groupDetails?.members` ke `MessageInput`.
   - Kirimkan `mentions` via WebSocket client saat `handleSend`.
5. `app/globals.css`:
   - Styling responsive Aurora Glassmorphism untuk dropdown mention dan mention tags.

## 3. Verification & Testing Strategy
- Unit test backend (`go test -v ./...`):
  - Tes `SQLMessageStore` menyimpan dan memuat `mentions`.
  - Tes `PushService` menghasilkan payload khusus mention.
  - Tes validasi fail-closed keanggotaan mention di WebSocket Hub.
- Frontend build & type check:
  - `npm run build` di folder `frontend/` (0 errors).
- Verifikasi visual & UX:
  - Mention di grup induk (hanya member grup induk).
  - Mention di subgrup (hanya member subgrup).
  - Multi-mention (2+ orang).
  - Styling mobile keyboard & desktop popover.
