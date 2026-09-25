# Implementation Plan — M-Mobile-8.2B & 8.2C
## Ephemeral Sub-Groups, Forum Topics & Access Control (Mobile)

- **Status**: AWAITING USER APPROVAL
- **Branch**: `dev`
- **Target Directory**: `mobile/`
- **Milestone**: M-Mobile-8.2B (Forum Sub-Group Engine) + M-Mobile-8.2C (Mobile Header UX & Breadcrumb Navigation)
- **Created**: 2026-09-25

---

## 🎯 Objective

Mengimplementasikan fitur Ephemeral Sub-Groups (Topik Forum) di aplikasi mobile React Native (Expo), mencakup:
1. **Layer API** — endpoint REST sub-groups & join requests
2. **Layer Types** — tipe TypeScript sub-group & join request
3. **SubGroupListModal** — Drawer daftar topik forum aktif
4. **CreateSubGroupModal** — Form pembuatan topik baru
5. **JoinRequestsModal** — Panel review permohonan izin (Admin only)
6. **ChatScreen enhancements** — Breadcrumb header, fail-closed lock, forum button
7. **GroupInfoScreen enhancement** — Tombol 🏛️ Forum
8. **App.tsx navigation** — Smart back navigation parent-first hierarchy

---

## Arsitektur Teknis

### A. Data Model Types (types.ts)

Tipe baru yang ditambahkan ke mobile/src/api/types.ts:

- SubGroupTTL: '7_days' | '30_days'
- SubGroupStatus: 'active' | 'expired'
- SubGroup: { id, parent_id, title, description, is_public, status, expires_at, created_by, created_at, member_count, my_role, is_member, has_pending_request }
- CreateSubGroupRequest: { title, description, ttl, is_public }
- JoinRequest: { id, conversation_id, user_id, username, display_name, avatar_url, status, created_at }

### B. API Layer (subgroups.ts) — 6 Endpoint

1. GET  /api/groups/{id}/subgroups
2. POST /api/groups/{id}/subgroups
3. POST /api/groups/{sub_id}/join
4. POST /api/groups/{sub_id}/join-request
5. GET  /api/groups/{sub_id}/join-requests
6. POST /api/groups/{sub_id}/join-requests/{id}/action

### C. ChatScreen Enhancements

- isSubGroup flag: conversation.id.startsWith('sub_')
- Breadcrumb subtitle (jika isSubGroup): "↖ [Nama Grup Induk] • Forum • X anggota" (tap = kembali ke parent)
- Smart Back: Jika isSubGroup, onBack navigasi ke parent group, bukan keluar ke RecentChats
- Forum Button (🏛️): Tampil di header grup utama (grp_) saja
- Fail-Closed Lock: Jika status expired, ChatInputBar disabled + banner permanen

### D. SubGroupListModal

- Daftar topik aktif: judul, deskripsi, badge TTL countdown, status 🌐/🔒, jumlah anggota
- Tombol aksi per topik:
  - is_public: "Gabung & Buka"
  - !is_public + !is_member + !has_pending_request: "🔒 Minta Izin Gabung"
  - !is_public + has_pending_request: "⏳ Menunggu Izin" (disabled)
  - admin/creator: panel join requests
- Tombol "+ Buat Topik Baru" (admin/creator saja)

### E. App.tsx Navigation State Baru

- forumParentGroup: Conversation | null — parent group ketika buka forum dari sub-group
- Smart back order: activeGroupInfo → activeSubGroup (→ kembali ke parent conv) → activeConversation → isNewGroupOpen → isNewChatOpen
