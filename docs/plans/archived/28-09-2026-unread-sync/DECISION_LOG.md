# Decision Log

- **DEC-024**: Penerapan Optimistic Reset `unread_count = 0` secara instan (0ms) di level `ConversationContext` saat obrolan dipilih/dibuka, serta penulisan ke SQLite lokal `local_conversations` (kolom query + payload `raw_json`), mencegah unread count tetap muncul saat kembali ke layar Home (`RecentChatsScreen`).
- **DEC-025**: Integrasi `useFocusEffect` pada `RecentChatsScreen` untuk memicu silent background revalidation (`refreshConversations(true)`) saat pengguna kembali ke layar Home (Layar 1) dari layar chat (Layar 2), memastikan status pesan centang dua biru (`read`) tersinkronisasi 100% tanpa perlu pull-to-refresh manual.
- **DEC-026**: Dual-Channel Receipt Dispatch: Mengirim receipt baca (`read`) melalui WebSocket hub (`websocketClient.sendReceipt`) dan REST API fallback (`/api/messages/receipt`), menjamin server backend Fly.io tetap menerima tanda terima meskipun koneksi soket sedang reconnecting/flaky.
