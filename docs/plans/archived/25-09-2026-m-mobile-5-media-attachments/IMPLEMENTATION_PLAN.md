# Implementation Plan — Milestone M-Mobile-5

## 🎯 Objective
Mengimplementasikan pemilihan gambar (kamera & galeri), staged media preview sebelum dikirim, pengunggahan media ke endpoint `/api/media/upload`, integrasi WebSocket message dengan metadata media, rendering preview bubble gambar, dan fullscreen image viewer di aplikasi mobile WuzzChat (`mobile/`).

---

## 🛠️ Architecture & Flow Overview

```text
[ User clicks Attachment (📷/🖼️) in ChatInputBar ]
                     │
                     ▼
[ ImagePicker: Camera or Gallery ] ──(User picks image)──▶ [ Staged Media Banner ]
                                                                 │
                                                    (User enters caption & clicks Send)
                                                                 │
                                                                 ▼
                                                  [ Upload to POST /api/media/upload ]
                                                    (60s timeout guard, Multipart Form)
                                                                 │
                                                        (Success: gets media_url)
                                                                 │
                                                                 ▼
                                                  [ E2EE Encrypt Caption (if Direct Chat) ]
                                                                 │
                                                                 ▼
                                                  [ WS Dispatch: type: 'message' ]
                                                    (media_url, media_type, file_name, file_size)
                                                                 │
                                                                 ▼
                                                  [ Optimistic Local Message Render ]
                                                    (renders bubble with local image URI)
                                                                 │
                     ┌───────────────────────────────────────────┴───────────────────────────────────────────┐
                     ▼                                                                                       ▼
         [ Recipient: Receive WS Message ]                                                       [ Receiver Opens Room ]
                     │                                                                                       │
                     ▼                                                                                       ▼
         [ Render ImageBubble with Spinner ]                                                     [ Send POST /api/media/ack ]
                     │                                                                             (WhatsApp Store-and-Forward)
                     ▼
         [ Tap Image: Fullscreen Viewer Modal ]
```

---

## 📂 Target Modified & Created Files

1. `mobile/package.json`:
   - Tambahkan dependensi `expo-image-picker` (`~57.0.20`).
2. `mobile/src/api/types.ts`:
   - Perluas interface `Message` dengan: `media_url?: string; media_type?: string; file_name?: string; file_size?: number; media_status?: string;`.
   - Tambahkan interface `MediaUploadResponse` dan `MediaAckRequest`.
3. `mobile/src/api/media.ts` *(Baru)*:
   - Fungsi `uploadMedia(uri: string, fileName?: string, mimeType?: string): Promise<MediaUploadResponse>` menggunakan `FormData` dan `AbortController` dengan timeout 60 detik.
   - Fungsi `acknowledgeMediaDownload(messageId: string, roomId?: string): Promise<{ status: string; media_status: string }>`.
   - Export di `mobile/src/api/index.ts`.
4. `mobile/src/services/websocket.ts`:
   - Tambahkan parameter opsi media ke `sendMessage(roomId, content, requestId, mediaOptions)`.
5. `mobile/src/components/ChatInputBar.tsx`:
   - Tambahkan tombol lampiran (📷 / 📎) di sebelah kiri input.
   - Action Modal / Bottom Sheet untuk memilih opsi: **Ambil Foto (Kamera)** vs **Pilih dari Galeri**.
   - Komponen Staged Media Banner: Thumbnail gambar, ukuran file, indikator uploading, dan tombol batalkan (✕).
6. `mobile/src/components/MessageBubble.tsx`:
   - Rendering tampilan media gambar responsif (rasio aspek rapi, border radius, spinner/activity indicator saat gambar memuat).
   - Tampilan caption teks di bawah gambar (jika ada).
   - Fullscreen Image Viewer Modal: tap gambar membuka modal fullscreen berlatar belakang gelap dengan tombol tutup dan zoom/pan bawaan.
7. `mobile/src/screens/ChatScreen.tsx`:
   - Integrasi handler pemilihan gambar dengan permission request kamera & galeri yang aman.
   - Penanganan upload staged media ke `/api/media/upload`.
   - Enkripsi caption dengan E2EE (AES-256-GCM) jika direct chat.
   - Pemetaan riwayat WebSocket (`history`) dan pesan masuk (`message`) agar menyertakan semua field media (`media_url`, `media_type`, `file_name`, `file_size`, `media_status`).
   - Trigger otomatis `mediaApi.acknowledgeMediaDownload` untuk pesan gambar dari peer yang belum di-ACK.
8. `mobile/src/components/ChatListItem.tsx`:
   - Dukungan snippet percakapan: render `📷 Foto` (atau `📷 Foto: [caption]`) saat `last_message` merupakan pesan gambar.

---

## 🧪 Verification Strategy

1. **Static Analysis & Typecheck**:
   - Jalankan `npm run build` di `frontend/` (memastikan 0 lint/TS errors).
   - Jalankan `npx tsc --noEmit` di `mobile/` (memastikan 0 TypeScript error pada seluruh interface, komponen, dan screens).
2. **Backend Regression Test**:
   - Jalankan `go test -v ./...` di `backend/` untuk memastikan seluruh suite endpoint media dan chat tetap 100% lulus.
3. **Resilience & Design System Audit**:
   - Verifikasi timeout 60 detik pada upload media (Slow Server Resilience).
   - Verifikasi disabled button saat uploading (Double-Action Guard).
   - Verifikasi warna dan token sesuai WhatsApp Aurora (`theme/colors.ts`).
