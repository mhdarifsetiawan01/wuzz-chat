# IMPLEMENTATION PLAN — Mobile Group Chat SWR & Instant Local Hydration

## 1. Problem Statement
Saat pengguna membuka ruang obrolan grup (`grp_*` atau `sub_*`) di mobile, layar selalu menampilkan loading spinner besar (`ActivityIndicator`) dan menahan (blocking) hidrasi pesan lokal dari SQLite serta WebSocket join sampai API HTTP `groupsApi.getGroupDetails(roomId)` selesai. Di jaringan seluler atau saat latensi 200–800ms+, ini menimbulkan jeda pemuatan yang mengganggu kenyamanan pengguna.

## 2. Technical Solution
1. **Identifikasi Status Keanggotaan Terverifikasi (`isKnownGroupMember`)**:
   - Jika `!isGroup`, `conversation.my_role`, `conversation.last_message !== undefined`, `conversation.unread_count !== undefined`, `conversation.updated_at`, atau sudah ada pesan di memori (`messages.length > 0`), maka grup tersebut adalah obrolan aktif pengguna.
2. **Non-Blocking Verification State**:
   - Inisialisasi `isVerifyingGroup` menjadi `false` jika `isKnownGroupMember` terpenuhi.
   - Tetap jadikan `true` hanya untuk link grup luar/unjoined public group yang belum terverifikasi keanggotaannya (menjaga kepatuhan DEC-012 & DEC-013).
3. **Instant SWR Timeline Render (0ms)**:
   - Efek hidrasi pesan SQLite dan WebSocket `joinRoom` segera berjalan tanpa menunggu response `getGroupDetails`.
   - `ChatScreen` segera merender linimasa pesan lokal dari SQLite/memori.
4. **Background Details Sync & Resilient Error Handling**:
   - `getGroupDetails(roomId)` tetap dijalankan di latar belakang untuk memperbarui judul, avatar, member count, dan role pengguna.
   - Jika menerima HTTP 403, tetap alihkan ke `AccessDeniedShield` (DEC-013).
   - Jika terjadi network error / timeout pada grup yang sudah dikenal, jangan lakukan `onBack()` atau alert kegagalan memuat grup; biarkan pengguna tetap membaca linimasa offline.
5. **Verifikasi**:
   - Jalankan `npx tsc --noEmit` di direktori `mobile/`.
