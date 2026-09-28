# Implementation Summary — M-Mobile-8.23: Instant Unread Badge Reset & Seamless Return-to-Home Sync

## Executive Summary
Perbaikan masalah status obrolan belum terbaca (unread badge tidak hilang) saat pengguna kembali ke Home/RecentChatsScreen setelah membaca pesan baru di mobile.

## Akar Masalah (Root Cause)
1. `ConversationContext` tidak menyediakan fungsi untuk mereset `unread_count` obrolan secara optimis ketika room dibuka atau dibaca.
2. `RecentChatsScreen` tetap ter-mount saat berpindah ke `ChatScreen`. Ketika pengguna menekan tombol Back (`navigation.goBack()`), layar Home tidak mengalami re-mount sehingga `useEffect` inisialisasi tidak dieksekusi ulang dan `unread_count` tetap menampilkan angka lama.
3. Tidak adanya `useFocusEffect` pada `RecentChatsScreen` untuk memicu silent background revalidation (`refreshConversations(true)`) saat pengguna kembali ke Home.
4. Tidak adanya proteksi `activeRoomId` di `ConversationContext` sehingga event WebSocket `message` yang datang saat room sedang dibuka berpotensi menimpa unread count menjadi > 0 karena race condition kueri server sebelum receipt tercatat.

## Target Penyelesaian
1. Menambahkan `updateStoredConversationUnread` di `sqliteStorage.ts` (mengupdate kolom dan `raw_json`).
2. Menambahkan `markConversationAsRead` dan tracking `activeRoomId` di `ConversationContext.tsx`.
3. Mengintegrasikan `markConversationAsRead` pada `handleChatPress` di `RecentChatsScreen.tsx` dan saat room aktif dimount di `ChatScreen.tsx`.
4. Menambahkan `useFocusEffect` di `RecentChatsScreen.tsx` untuk silent sync saat layar kembali aktif.
