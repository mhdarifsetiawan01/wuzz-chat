# Active Implementation Plan — Milestone 8.8: Realtime Engine Scalability & High-ROI Optimizations

## 1. Problem Statement & Objectives
Berdasarkan audit teknis mendalam terhadap arsitektur WebSocket Wuzz Chat:
1. `broadcastLocal` di `Hub` mengeksekusi query database SQL `GetConversationMemberUsernames` dan melakukan loop linier $O(N)$ terhadap seluruh `h.clients` di setiap broadcast pesan, memicu *database connection pool exhaustion* dan lonjakan CPU saat user mencapai ribuan.
2. Handler `onTyping` di backend Go tidak memiliki *rate limiter*, membuka celah *flood typing DoS*.
3. Mekanisme sinkronisasi riwayat pesan saat *reconnect* menggunakan batas *hardcoded* 50 pesan tanpa cursor/checkpoint (`since`), berisiko memicu hilangnya pesan (*message loss*) jika user offline cukup lama.
4. `WsClient.send()` langsung membuang (*drop*) pesan jika socket sedang tidak dalam status `OPEN`, berisiko menghilangkan pesan pengguna pada kondisi jaringan seluler yang tidak stabil (*flaky network*).
5. Transmisi Redis Pub/Sub cluster menggunakan single channel global yang membanjiri semua node dengan pesan dari seluruh room.

Tujuan rencana ini adalah mengatasi kelima area di atas dengan perubahan yang presisi, performa tinggi, dan tanpa merusak fungsionalitas yang ada (*zero regression*).

---

## 2. Rencana Perubahan Teknis (Step-by-Step)

### A. Core Fanout Optimization & Typing Guard (Backend Go)
1. **`backend/internal/ws/hub.go`**:
   - Tambahkan cache in-memory untuk keanggotaan percakapan: `roomMembersCache map[string][]string` (atau set ID anggota) dengan *read/write lock* terisolasi atau TTL pendek, di-invalidation saat ada member bergabung/keluar (`BroadcastGroupSystemEvent`).
   - Pada `broadcastLocal(roomID, msg, senderID)`:
     - Dapatkan daftar anggota percakapan dari cache in-memory (fallback ke `userStore` hanya jika cache belum terisi).
     - Ganti loop `for id, client := range h.clients` ($O(N_{\text{total\_users}})$) dengan lookup langsung per anggota: `for _, memberID := range members { if client, ok := h.clients[memberID]; ok && id != senderID { targetMap[client] = true } }` ($O(M_{\text{room\_members}})$).
     - Kompleksitas turun drastis dari puluhan ribu operasi menjadi 2 operasi untuk DM dan puluhan operasi untuk grup!
2. **`backend/internal/ws/client.go`**:
   - Di method `onTyping(msg Message)`:
     - Pasang sliding-window rate limiter per koneksi: `if !c.allowRateLimit(3, 2*time.Second) { return }`.
     - Mencegah spam frame typing dari klien non-resmi atau bot.

### B. Checkpoint-based Delta Offline History Sync
3. **`backend/internal/ws/message.go`**:
   - Tambahkan field opsional `Since string` (`json:"since,omitempty"`) pada struct `Message` untuk menampung ISO timestamp checkpoint klien.
4. **`backend/internal/store/message_store.go` & `sql.go`**:
   - Tambahkan method `GetRoomHistorySince(roomID, clientID string, since time.Time, limit int) ([]StoredMessage, error)`.
   - Query SQL: `WHERE room_id = $1 AND timestamp > $2 ORDER BY timestamp ASC LIMIT $3`.
5. **`backend/internal/ws/hub.go` & `client.go`**:
   - Di `onJoin(msg)`: Teruskan `msg.Since` ke `sendRoomHistory(clientID, roomID, sinceStr)`.
   - Jika `since` valid, panggil `GetRoomHistorySince`; jika kosong, fallback ke `GetRoomHistoryForUser(50)`.
6. **`frontend/app/chat/page.tsx`**:
   - Saat mengirim event `join` ke room, ambil timestamp pesan terakhir yang tersimpan di `IndexedDB` lokal untuk room tersebut (`messageCache.ts`), lalu kirimkan sebagai `since: lastCachedTimestamp`.

### C. Client-Side Outbound Queue & Auto-Retry
7. **`frontend/lib/ws-client.ts`**:
   - Tambahkan properti `private outboundQueue: Message[] = []` (dengan batas aman maks 100 pesan FIFO).
   - Di method `send(msg: Message)`:
     - Jika `this.ws?.readyState === WebSocket.OPEN`, kirim langsung.
     - Jika sedang `reconnecting` / `connecting`, masukkan ke `outboundQueue`.
   - Di handler `this.ws.onopen`:
     - Flush dan kirim seluruh pesan yang tertunda di `outboundQueue` secara sekuensial.
     - Mengeliminasi risiko pesan hilang saat pergantian jaringan WiFi ➔ 4G.

### D. Redis Pub/Sub Cluster Optimization
8. **`backend/internal/ws/hub.go`**:
   - Pastikan serialisasi JSON `ClusterEvent` efisien dan payload hanya dipublikasikan jika cluster broker benar-benar aktif.
   - Siapkan sharding channel per room `wuzz:room:{roomID}` dengan fallback aman ke channel default.

---

## 3. Strategi Verifikasi & Testing
1. **Unit & Integration Testing Backend**:
   - Jalankan seluruh test suite Go: `go test -v ./...` di direktori `backend/`.
   - Tambahkan unit test baru di `backend/internal/ws/` untuk menguji:
     - O(M) `broadcastLocal` direct member lookup.
     - Rate-limiting `onTyping`.
     - Query `GetRoomHistorySince` dengan timestamp checkpoint.
2. **Frontend Build & Typecheck Gate**:
   - Jalankan `npm run build` di direktori `frontend/` untuk memastikan 0 error kompilasi Next.js/TypeScript.
3. **Simulation Verification**:
   - Uji skenario offline queue di frontend dan verify pengiriman saat online kembali.
