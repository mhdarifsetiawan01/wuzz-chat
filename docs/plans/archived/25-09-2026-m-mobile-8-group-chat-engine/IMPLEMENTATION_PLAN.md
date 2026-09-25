# Implementation Plan — Milestone M-Mobile-8: Core Group Chat Engine & Member Management

## 🎯 Objective
Mengimplementasikan dukungan penuh obrolan grup (*Core Group Chat Engine*) pada aplikasi mobile (`mobile/`), meliputi pembuatan grup baru multi-step, integrasi linimasa obrolan grup dengan format snippet ber-prefix pengirim, visualisasi nama pengirim deterministik pada balon obrolan, header cerdas dengan akses ke profil grup, serta layar manajemen info & anggota grup lengkap dengan RBAC hierarkis (Pembuat, Admin, Anggota).

---

## 🏗️ Architectural Design & Component Tree

```
App.tsx
├── AppNavigator
│   ├── RecentChatsScreen (renders ChatListItem with is_group support & sender prefixes)
│   ├── NewChatScreen (has "👥 Grup Baru" option at top of list)
│   │   └── NewGroupScreen (Wizard: title, description, multi-select contact checklist)
│   ├── ChatScreen (Header with member count + info button, E2EE bypass for grp_, MessageBubble with deterministic sender color)
│   └── GroupInfoScreen (Profile details, member list with role badges, Add Member modal, Kick/Role action sheets, Leave Group)
```

---

## 📂 Target Modified & Created Files

1. **`mobile/src/api/types.ts`** (MODIFY):
   - Tambahkan type `GroupRole = 'creator' | 'admin' | 'member'`.
   - Tambahkan interface `GroupMember`: `user_id`, `username`, `display_name`, `avatar_url`, `role`, `is_verified`, `joined_at`.
   - Tambahkan interface `GroupDetails`: `id`, `title`, `description`, `avatar_url`, `is_public`, `group_username`, `created_by`, `created_at`, `member_count`, `my_role`, `members`.
   - Perbarui `Conversation` agar `member_count?: number` dan `my_role?: GroupRole` tercatat.

2. **`mobile/src/api/groups.ts`** (NEW):
   - `createGroup(input: { title: string; description?: string; avatar_url?: string; member_ids?: string[] }): Promise<GroupDetails>` (`POST /api/groups`)
   - `getGroupDetails(groupId: string): Promise<GroupDetails>` (`GET /api/groups/{id}`)
   - `getGroupMembers(groupId: string): Promise<GroupMember[]>` (`GET /api/groups/{id}/members`)
   - `addGroupMembers(groupId: string, memberIds: string[]): Promise<void>` (`POST /api/groups/{id}/members`)
   - `removeGroupMember(groupId: string, targetUserId: string): Promise<void>` (`DELETE /api/groups/{id}/members/{userId}`)
   - `updateMemberRole(groupId: string, targetUserId: string, role: 'admin' | 'member'): Promise<void>` (`PATCH /api/groups/{id}/members/{userId}/role`)
   - `leaveGroup(groupId: string, currentUserId: string): Promise<void>` (`DELETE /api/groups/{id}/members/{currentUserId}`)
   - Export via `mobile/src/api/index.ts`.

3. **`mobile/src/components/Avatar.tsx`** (MODIFY):
   - Berikan perlakuan visual khusus jika `isGroup === true`:
     - Tambahkan lencana ikon grup mini (👥) di sudut kanan bawah avatar atau gunakan gradien latar grup bertema Aurora (`colors.accentPrimary` ke `colors.colorCyanNeon`) agar instan terbedakan dari kontak 1-on-1.

4. **`mobile/src/components/ChatListItem.tsx`** (MODIFY):
   - Deteksi grup: `conversation.id.startsWith('grp_') || conversation.is_group || conversation.type === 'group'`.
   - Format snippet pesan terakhir grup: Sertakan prefix nama pengirim (contoh: `"Budi: Halo semua"`, atau `"Anda: 📷 Foto"` jika pengirim adalah diri sendiri).
   - Render avatar grup dengan properti `isGroup={true}`.

5. **`mobile/src/components/MessageBubble.tsx`** (MODIFY):
   - Update styling `senderName` untuk menggunakan fungsi deterministik pewarnaan unik per user (`getAvatarColor(senderName || message.from || 'User')` atau `SENDER_PALETTE`).
   - Pastikan nama pengirim tampil jelas di atas balon pesan masuk grup dengan tipografi proporsional sesuai design token.

6. **`mobile/src/screens/NewGroupScreen.tsx`** (NEW):
   - Layar wizard pembuatan grup:
     - Header: Tombol kembali, Judul "Grup Baru", Indikator langkah / tombol aksi "Lanjut / Buat".
     - Input field: Nama grup (wajib, max 128 karakter, auto-counter), Deskripsi grup (opsional).
     - Section pemilihan anggota: Pencarian kontak cepat + multi-select checklist dengan chip preview anggota terpilih di atas list (tap chip untuk menghapus seleksi).
     - Submit handler: Panggil `createGroup(...)`, tampilkan loading spinner & anti-double-click guard.
     - Selesai: Langsung alihkan ke `ChatScreen` grup yang baru dibuat.

7. **`mobile/src/screens/NewChatScreen.tsx`** (MODIFY):
   - Tambahkan item opsi tetap di bagian teratas daftar kontak sebelum daftar pencarian:
     - Tombol "👥 Buat Grup Baru" yang menavigasikan pengguna ke `NewGroupScreen`.

8. **`mobile/src/screens/ChatScreen.tsx`** (MODIFY):
   - Deteksi `isGroup`: `conversation.id.startsWith('grp_') || conversation.is_group || conversation.type === 'group'`.
   - Header grup:
     - Tampilkan nama grup dan jumlah anggota (`${memberCount} anggota`).
     - Tampilkan tombol ikon info (`ℹ️` / titik tiga) atau buat seluruh header bar dapat diketuk untuk membuka `GroupInfoScreen`.
   - Bypass E2EE fail-closed:
     - Cegah eksekusi key derivation pairwise ECDH jika `isGroup`.
     - Kirim pesan dalam plaintext melalui WebSocket (server-relayed TLS).
     - Tangani penerimaan pesan masuk tanpa mencoba dekripsi ECDH.
   - Sambungkan navigasi ke `GroupInfoScreen`.

9. **`mobile/src/screens/GroupInfoScreen.tsx`** (NEW):
   - Layar detail & info grup WhatsApp-grade:
     - Header profil: Avatar grup besar, Nama grup, Deskripsi, Tanggal pembuatan, Jumlah anggota total.
     - Action bar: Tombol "Tambah Anggota" (jika Admin/Creator), Tombol "Keluar Grup".
     - Daftar Anggota Lengkap (`FlatList`):
       - Tampilkan avatar, display name, `@username`, badge `👑 Pembuat`, `🛡️ Admin`, atau `Anggota`, status dot.
       - Tanda `(Anda)` jika anggota tersebut adalah current user.
     - RBAC Context Menu / Action Sheet:
       - Creator: Dapat mengubah role anggota (Jadikan Admin / Turunkan Admin) dan mengeluarkan anggota (Kick).
       - Admin: Dapat mengeluarkan anggota biasa (bukan sesama Admin atau Creator).
       - Anggota: Hanya dapat melihat daftar dan keluar mandiri (Leave Group).
     - Modal Tambah Anggota Baru (`AddGroupMemberModal`):
       - Multi-select kontak yang belum tergabung dalam grup, panggil `addGroupMembers(...)`.
     - Konfirmasi Keluar Grup:
       - Alert konfirmasi aman sebelum eksekusi `leaveGroup(...)`. Khusus Creator yang masih memiliki anggota lain, tampilkan instruksi untuk mengalihkan status pembuat terlebih dahulu.
     - Integrasi navigasi kembali dan sinkronisasi pembaruan ke `ChatScreen` / `RecentChatsScreen`.

10. **`mobile/src/screens/index.ts`** & **`mobile/App.tsx`** (MODIFY):
    - Export `NewGroupScreen` dan `GroupInfoScreen`.
    - Daftarkan screen pada routing state `App.tsx` (mendukung `activeGroupInfo` state dan `isNewGroupOpen` state dengan hardware BackHandler support).

---

## 🧪 Verification Strategy

1. **Static Analysis & Typecheck**:
   - `npx tsc --noEmit` di `mobile/` (0 error TypeScript).
2. **Regression Check**:
   - `go test ./...` di `backend/` (100% PASS).
   - `npm run build` di `frontend/` (0 error kompilasi Turbopack).
3. **End-to-End Simulation & Verification**:
   - Uji pembuatan grup baru dengan beberapa anggota.
   - Uji penulisan pesan grup dan rendering nama pengirim dengan warna deterministik.
   - Uji RBAC: Tambah anggota baru, ganti role admin, kick anggota, dan leave group.
