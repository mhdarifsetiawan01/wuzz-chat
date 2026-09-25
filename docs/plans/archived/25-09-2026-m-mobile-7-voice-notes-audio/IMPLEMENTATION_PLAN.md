# Implementation Plan — Milestone M-Mobile-7: Voice Notes & Audio Messaging

## 1. Overview & Architecture

Milestone M-Mobile-7 melengkapi kemampuan multimedia di aplikasi mobile WuzzChat (`mobile/`) dengan menghadirkan fitur Voice Notes (Pesan Suara) interaktif berstandar WhatsApp. Fitur ini dirancang memiliki interoperabilitas penuh (100% interop) dengan Web Client Next.js (`frontend/app/chat/AudioPlayerBubble.tsx` & `VoiceRecorder.tsx`) dan backend Go (`backend/internal/api/media_handler.go`).

```text
[Mobile ChatInputBar] 
      │ 🎙️ Hold/Tap Record (.m4a AAC)
      ▼
[Local Optimistic Bubble] ──(renders instantly)──► [Chat Timeline]
      │
      │ ☁️ mediaApi.uploadMedia (multipart POST /api/media/upload)
      ▼
[Fly.io Storage Server]
      │
      │ 📡 WebSocket Hub: { type: 'message', media_url: '...', media_type: 'audio' }
      ▼
[Peer Clients (Mobile & Web Next.js)]
      │
      ▼
[AudioPlayerBubble Component] (Play/Pause, Waveform Scrubber, 1x/1.5x/2x Speed, Single Audio Guard)
```

---

## 2. Granular Technical Scope

### 2.1 Dependency & Audio Engine Setup
- Install `expo-av` (v16.0.8) di `mobile/package.json` yang kompatibel penuh dengan Expo SDK 57.
- Konfigurasi global audio mode via `Audio.setAudioModeAsync`:
  - `allowsRecordingIOS: true`
  - `playsInSilentModeIOS: true`
  - `shouldDuckAndroid: true`
  - `playThroughEarpieceAndroid: false`
- Presets perekaman suara: `Audio.RecordingOptionsPresets.HIGH_QUALITY` menghasilkan berkas audio `.m4a` (AAC) hemat bandwidth yang didukung natif oleh browser web (HTML5 Audio) dan perangkat seluler.

### 2.2 Singleton Audio Manager (`mobile/src/services/audioManager.ts`)
- Mencegah *audio collision* (hanya boleh 1 suara berbunyi pada satu waktu di seluruh aplikasi).
- Menyediakan metode:
  - `play(uri: string, sound: Audio.Sound, onPlaybackFinished?: () => void)`
  - `stopActiveSound()`
  - `getActiveAudioUri(): string | null`
  - Event listener untuk memberi tahu komponen pemutar audio lama agar mengubah tombol kembali ke mode jeda/pause (⏸ ➔ ▶).

### 2.3 WhatsApp-Style Voice Recorder di `ChatInputBar.tsx`
- **Dynamic Mode Switch**:
  - Kolom teks kosong & tidak ada media: Tombol kirim (➤) otomatis berganti menjadi tombol mikrofon (🎙️).
  - Terdapat teks atau media: Tombol kirim (➤) aktif.
- **Recording UI Transition**:
  - Saat tombol mic ditekan:
    1. Cek & minta izin mikrofon secara halus via `Audio.requestPermissionsAsync()`. Tampilkan dialog ramah jika izin ditolak.
    2. Mulai perekaman audio `.m4a`.
    3. Input bar berubah menjadi mode rekam WhatsApp:
       - Sisi kiri: Tombol Batal/Hapus (🗑️ / ✕)
       - Bagian tengah: Indikator titik merah berkedip (🔴 pulsing animation) + Timer berjalan realtime (`00:01`, `00:02`, ...)
       - Sisi kanan: Tombol Kirim/Selesai (➤ dengan accent color)
- **Pembatalan Rekaman**:
  - Menekan tombol batal (✕ / 🗑️) langsung menghentikan perekaman, membuang berkas sementara, dan mengembalikan UI input bar.
- **Pengiriman Rekaman**:
  - Menekan tombol kirim langsung menghentikan perekaman, mengambil URI berkas, mengukur durasi, dan memicu callback `onSendAudio(uri, durationSeconds, fileSize)`.

### 2.4 WhatsApp-Style Audio Player Bubble (`mobile/src/components/AudioPlayerBubble.tsx`)
- Komponen balon audio voice note dengan elemen:
  1. **Sender Avatar / Mic Badge**: Lingkaran avatar pengirim dengan aksen mikrofon kecil.
  2. **Tombol Play / Pause**:
     - Status memutar (⏸), status jeda (▶), dan status loading/buffering (`ActivityIndicator`).
     - Terintegrasi dengan `audioManager` untuk menghentikan audio lain saat dimainkan.
  3. **Waveform Scrubber Interaktif**:
     - Visualisasi baris vertikal waveform (24 batang variatif seperti pada web `AudioPlayerBubble.tsx`).
     - Batang terisi warna hijau aksen (`colors.accentPrimary`) sesuai persentase progres putar (`progressPercent`).
     - Tappable & scrubbable: pengguna dapat mengetuk posisi gelombang mana saja untuk melompat (seek) ke detik yang diinginkan.
  4. **Durasi & Indikator Waktu Realtime**:
     - Menampilkan waktu berjalan saat memutar (misal `0:12 / 0:38`) atau total durasi saat diam (`0:38`).
  5. **Tombol Kecepatan Putar (Playback Speed)**:
     - Tombol pill kecepatan khas WhatsApp: `1x` ➔ `1.5x` ➔ `2x` ➔ `1x`.

### 2.5 MessageBubble Integration (`mobile/src/components/MessageBubble.tsx`)
- Deteksi `isAudio`:
  ```ts
  const isAudio = message.media_type === 'audio' || (message.file_name && /\.(m4a|aac|mp3|wav|ogg|webm)$/i.test(message.file_name));
  ```
- Render `AudioPlayerBubble` di dalam kontainer balon pesan jika `isAudio && message.media_url`.
- Panggil `onMediaLoaded` untuk mengirim ACK store-and-forward (`mediaApi.acknowledgeMediaDownload`) ke backend.

### 2.6 ChatScreen Orchestration (`mobile/src/screens/ChatScreen.tsx`)
- Handler `handleSendAudio(uri: string, durationSeconds: number)`:
  1. Buat `optimisticMsg` dengan status `sending`, `media_type: 'audio'`, dan `media_url: uri` lokal agar pengirim bisa langsung memutar audio seketika (Optimistic UI 0ms).
  2. Eksekusi upload background via `mediaApi.uploadMedia(uri, fileName, 'audio/m4a')` dengan AbortController timeout 60 detik.
  3. Kirim payload WebSocket ke backend:
     ```json
     {
       "type": "message",
       "room": "...",
       "content": "",
       "media_url": "https://...",
       "media_type": "audio",
       "file_name": "voice_note_123.m4a",
       "file_size": 28400
     }
     ```
  4. Perbarui status pesan di linimasa menjadi `sent` beserta URL permanen.
- Dukungan Quoted Reply untuk pesan audio: jika membalas pesan audio, banner reply menampilkan `"🎙️ Pesan Suara"`.

### 2.7 Recent Chats Snippet (`mobile/src/components/ChatListItem.tsx`)
- Perbarui `getMessagePreview(conversation)` agar mengenali `mediaType === 'audio'` atau berkas audio dan menampilkan label `"🎙️ Pesan Suara"` (bukan `"📷 Foto"`).

---

## 3. Verification & Quality Gates

1. **Mobile Typecheck**: `npx tsc --noEmit` di `mobile/` (harus 0 errors).
2. **Frontend Compilation**: `npm run build` di `frontend/` (memastikan tidak ada regresi lintas platform web).
3. **Backend Integration**: `go test -v ./...` di `backend/` (seluruh pengujian storage & media handler lulus 100%).
4. **UX & State Validation**:
   - Kolom pesan kosong menampilkan tombol mic 🎙️.
   - Ketik huruf menampilkan tombol kirim ➤.
   - Perekaman menampilkan titik merah berkedip & timer durasi berjalan.
   - Batal rekam membatalkan tanpa sisa file.
   - Kirim rekam memunculkan balon audio optimistik secara instan.
   - Balon audio dapat di-play, pause, seek melalui waveform, dan diatur kecepatan 1x/1.5x/2x.
   - Memutar audio A saat audio B sedang berbunyi akan menghentikan audio B otomatis.
   - Snippet di layar beranda obrolan menampilkan "🎙️ Pesan Suara".
