# Implementation Progress — Milestone M-Mobile-8: Core Group Chat Engine & Member Management

## 📋 Task Checklist

- [x] **Task 1: API & Type Layer Integration**
  - [x] Deklarasi type `GroupRole`, `GroupMember`, `GroupDetails` di `mobile/src/api/types.ts`.
  - [x] Buat `mobile/src/api/groups.ts` dengan method `createGroup`, `getGroupDetails`, `getGroupMembers`, `addGroupMembers`, `removeGroupMember`, `updateMemberRole`, `leaveGroup`.
  - [x] Export module dari `mobile/src/api/index.ts`.

- [x] **Task 2: Group Visual Distinction in Components**
  - [x] Berikan visualisasi lencana / gradien khusus grup pada `Avatar.tsx` (`isGroup={true}`).
  - [x] Perbarui `ChatListItem.tsx` untuk format preview pengirim pesan grup (`"Budi: Halo semua"`) dan deteksi room `grp_...`.
  - [x] Perbarui `MessageBubble.tsx` agar nama pengirim pada balon lawan bicara diwarnai secara deterministik per user (`getAvatarColor`).

- [x] **Task 3: Group Creation Flow (NewGroupScreen & NewChatScreen)**
  - [x] Tambahkan opsi "👥 Buat Grup Baru" di `NewChatScreen.tsx`.
  - [x] Bangun komponen layar `NewGroupScreen.tsx` (input nama grup, deskripsi, multi-select contact checklist, selected member chips).
  - [x] Hubungkan pemanggilan `POST /api/groups` dan direct redirect ke chat room baru saat grup berhasil dibuat.

- [x] **Task 4: Group Chat Timeline & E2EE Bypass (ChatScreen)**
  - [x] Deteksi room `grp_` secara konsisten di `ChatScreen.tsx`.
  - [x] Bypass pairwise ECDH key derivation & fail-closed error untuk room grup (server-relayed TLS).
  - [x] Perbarui sticky header `ChatScreen`: nama grup, subtitle jumlah anggota, dan tombol akses info profil grup.

- [x] **Task 5: Group Profile & Member Management (GroupInfoScreen)**
  - [x] Bangun komponen `GroupInfoScreen.tsx`: profil grup, tanggal dibuat, daftar anggota dengan role badge (👑 Pembuat, 🛡️ Admin, Anggota).
  - [x] Implementasikan modal Tambah Anggota (`AddGroupMemberModal`) untuk Admin/Creator.
  - [x] Implementasikan RBAC Action Sheet: Ubah role (Admin/Member) & Keluarkan anggota (Kick) untuk Admin/Creator.
  - [x] Implementasikan aksi Keluar Grup (Leave Group) dengan dialog konfirmasi aman.

- [x] **Task 6: Navigation Integration in App.tsx**
  - [x] Integrasikan `NewGroupScreen` dan `GroupInfoScreen` ke dalam state navigator `App.tsx`.
  - [x] Pastikan hardware back button Android berfungsi mulus pada seluruh transisi layar grup baru dan info grup.

- [x] **Task 7: Verification & Quality Gate**
  - [x] Jalankan `npx tsc --noEmit` di `mobile/` (0 error).
  - [x] Jalankan `go test ./...` di `backend/` (100% pass).
  - [x] Jalankan `npm run build` di `frontend/` (0 error).
  - [x] Tahan perubahan (tanpa git commit) dan minta konfirmasi user.
