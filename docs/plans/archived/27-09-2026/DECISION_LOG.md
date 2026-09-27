# DECISION LOG — M-Mobile-8.18

- **DEC-022**: Mengadopsi library resmi Expo SDK 57 `expo-sqlite` (~57.0.3) dengan modern asynchronous API (`openDatabaseAsync`) untuk persistensi data obrolan lokal.
- **DEC-023**: Menerapkan kolom `raw_json` di tabel `local_conversations` di samping kolom terindeks (`is_pinned`, `updated_at`) untuk memastikan data model `Conversation` dapat di-hydrate kembali secara lengkap dan lossless tanpa takut schema drift.
- **DEC-024**: Menerapkan strategi *Cache-First, Network-Silent-Update (SWR)* pada `ConversationContext.tsx`: data lokal langsung di-render dan `isLoading` diset `false` seketika saat data lokal ditemukan, memotong waktu render Home Screen saat cold start hingga < 50ms.
