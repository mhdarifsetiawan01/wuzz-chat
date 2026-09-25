# Decision Log — Milestone M-Mobile-7: Voice Notes & Audio Messaging

- **Status**: Active Formulation
- **Branch**: `dev`

---

### DEC-M22: Pemilihan Audio Engine — Migrasi dari `expo-av` ke `expo-audio`
- **Konteks**: Expo SDK 57 (React Native 0.86.3) menghapus native module `ExponentAV` dari binary Expo Go, sehingga modul `expo-av` menyebabkan error fatal `Cannot find native module 'ExponentAV'`.
- **Keputusan**: Mengadopsi library resmi Expo SDK 57 terbaru `expo-audio` (`~57.0.5`), menggunakan `useAudioRecorder(RecordingPresets.HIGH_QUALITY)` untuk perekaman AAC (.m4a), `createAudioPlayer(url)` untuk pemutaran, serta `player.setPlaybackRate(rate)` untuk pengatur kecepatan pemutaran.
- **Konsekuensi**: Aplikasi berjalan tanpa error native di Expo Go SDK 57, mendukung kontrol audio modern, dan audio output `.m4a` 100% kompatibel dengan frontend web.

---

### DEC-M26: Bypass Android Scoped Storage 404 pada Audio Upload (`expo-file-system`)
- **Konteks**: Pada React Native Android / Expo WinterCG fetch, pemanggilan `fetch(localFileUri)` pada berkas audio hasil rekaman (`file:///data/user/0/...`) menghasilkan error `404 File not found` akibat pembatasan Scoped Storage.
- **Keputusan**: Mengintegrasikan `expo-file-system` untuk membaca byte berkas lokal via `new File(uri).bytes()` (atau fallback `FileSystem.readAsStringAsync`), kemudian merakit FormData part berbasis byte streaming (`entry.bytes()`) yang didukung penuh oleh Expo WinterCG `convertFormDataAsync`.
- **Konsekuensi**: Berkas audio lokal berhasil diunggah langsung ke endpoint `/api/media/upload` tanpa kegagalan I/O.

---

### DEC-M23: Arsitektur Single Active Audio Playback (`audioManager.ts`)
- **Konteks**: Jika pengguna memutar beberapa voice note di linimasa chat, suara tidak boleh saling bertumpukan (*overlapping*).
- **Keputusan**: Menerapkan singleton `audioManager` yang memegang referensi ke `activeSound: Audio.Sound | null`. Ketika instance `AudioPlayerBubble` meminta putar, `audioManager` secara otomatis menghentikan (*stop & unload*) suara sebelumnya dan menyiarkan notifikasi ke bubble terkait agar kembali ke state jeda.
- **Konsekuensi**: Pengalaman pengguna rapi dan konsisten setara WhatsApp asli.

---

### DEC-M24: UI Perekaman Suara WhatsApp-Style (Mode Switch di `ChatInputBar`)
- **Konteks**: Diperlukan UX input yang familiar bagi pengguna WhatsApp mobile.
- **Keputusan**: Tombol kirim ➤ dan tombol mic 🎙️ berbagi posisi yang sama di kanan bawah. Ketika `text.trim().length === 0 && !stagedMedia`, tombol mic ditampilkan. Menekan tombol mic akan mengaktifkan *recording bar* dengan indikator merah berkedip, durasi berjalan, tombol batal ✕/🗑️, dan tombol kirim ➤.
- **Konsekuensi**: Alur kerja intuitif tanpa memakan ruang tambahan di layar.

---

### DEC-M25: Store-and-Forward & Format Media Interop
- **Konteks**: Berkas suara harus dapat dikirim ke Fly.io backend storage dan dimainkan oleh klien web maupun mobile.
- **Keputusan**: Menggunakan endpoint `/api/media/upload` via `mediaApi.uploadMedia` dengan MIME type `audio/m4a`, payload WebSocket `media_type: 'audio'`, dan timeout guard 60 detik. Saat lawan bicara menerima pesan audio, aplikasi memanggil `mediaApi.acknowledgeMediaDownload`.
- **Konsekuensi**: 100% interoperabel dengan `frontend/app/chat/AudioPlayerBubble.tsx` dan mematuhi aturan WhatsApp Store-and-Forward Lifecycle.
