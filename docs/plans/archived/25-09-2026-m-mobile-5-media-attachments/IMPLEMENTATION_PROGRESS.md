# Implementation Progress — Milestone M-Mobile-5

- **Status**: Implemented & Verified ✅ (Awaiting User "Selesai" Confirmation)
- **Active Task**: All tasks completed and verified with 100% test passing.

## 📋 Task Checklist

- [x] **Task 1: Setup Dependensi & Kontrak Tipe Media**
  - [x] Pasang dependensi `expo-image-picker` di `mobile/package.json`.
  - [x] Perbarui `mobile/src/api/types.ts` dengan interface media (`MediaUploadResponse`, `MediaAckRequest`, `MediaAckResponse`, dan ekstensi `Message`).
  - [x] Buat modul `mobile/src/api/media.ts` dengan fungsi `uploadMedia` (timeout 60s) dan `acknowledgeMediaDownload`.
  - [x] Re-export di `mobile/src/api/index.ts`.

- [x] **Task 2: Ekstensi WebSocket Client untuk Media Messages**
  - [x] Perbarui method `sendMessage` di `mobile/src/services/websocket.ts` untuk menerima opsi media (`media_url`, `media_type`, `file_name`, `file_size`).

- [x] **Task 3: ChatInputBar Attachment Trigger & Staged Media Banner**
  - [x] Tambahkan tombol lampiran (📷 / 📎) di `mobile/src/components/ChatInputBar.tsx`.
  - [x] Buat Action Modal pilihan: Kamera vs Galeri Foto.
  - [x] Buat Staged Media Banner di atas text input dengan preview thumbnail, nama file, ukuran, loading spinner, dan tombol batalkan (✕).

- [x] **Task 4: MessageBubble Image Rendering & Fullscreen Viewer**
  - [x] Perbarui `mobile/src/components/MessageBubble.tsx` untuk merender gambar dengan rasio aspek rapi, loading indicator, dan error fallback.
  - [x] Tampilkan caption pesan di bawah gambar.
  - [x] Implementasikan Fullscreen Image Viewer Modal dengan backdrop gelap dan tombol close saat bubble gambar di-tap.

- [x] **Task 5: Integrasi ChatScreen (Upload, E2EE Caption, Mapping & ACK)**
  - [x] Implementasikan handler kamera & galeri dengan permission handling di `mobile/src/screens/ChatScreen.tsx`.
  - [x] Tangani proses upload ke `/api/media/upload`, loading guard, dan error alert.
  - [x] Enkripsi caption teks jika direct chat dengan E2EE (AES-256-GCM).
  - [x] Kirim payload media via WebSocket dan render pesan optimistic di timeline.
  - [x] Perbarui pemetaan `history` dan `message` listener agar menyertakan semua properti media.
  - [x] Trigger otomatis `acknowledgeMediaDownload` untuk pesan gambar dari peer.

- [x] **Task 6: ChatListItem Snippet Preview & Polish**
  - [x] Perbarui `mobile/src/components/ChatListItem.tsx` untuk menampilkan `📷 Foto` pada preview `last_message`.

- [x] **Task 7: Automated Verification & Audit**
  - [x] Jalankan `npx tsc --noEmit` di `mobile/` (0 errors).
  - [x] Jalankan `npm run build` di `frontend/` (0 errors).
  - [x] Jalankan `go test ./...` di `backend/` (100% pass).
