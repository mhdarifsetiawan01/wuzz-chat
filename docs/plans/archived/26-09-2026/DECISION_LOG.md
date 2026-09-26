# Decision Log — Milestone M-Mobile-8.11

## 🏛️ Architecture & Design Decisions

### DEC-M28: Unified WebRTC Signaling Wire Format
- **Konteks**: Web frontend dan Go backend telah menggunakan format WebSocket payload: `type: 'call_offer'`, `call_answer`, `ice_candidate`, `call_reject`, `call_end`, `call_busy` dengan field `room`, `sdp`, `candidate`, `from`, `nickname`.
- **Keputusan**: Mobile client menggunakan wire format 100% identik agar interoperabilitas Web ⇄ Mobile dan Mobile ⇄ Mobile berjalan transparan tanpa perlu perubahan pada Go backend.

### DEC-M29: Call Audio Routing & Ringtone via Expo Audio (`expo-audio`)
- **Konteks**: Mobile client menggunakan Expo SDK 57 dengan modul `expo-audio`. Panggilan suara memerlukan perpindahan dinamis rute audio antara speakerphone dan earpiece, serta pemutaran nada sambung/dering.
- **Keputusan**: Mengimplementasikan `callAudioManager.ts` yang memanfaatkan `setAudioModeAsync` untuk beralih mode earpiece (`shouldRouteThroughEarpiece: true`) vs speaker (`shouldRouteThroughEarpiece: false`) serta mengelola nada dering masuk dan nada tunggu keluar dengan lifecycle cleanup yang ketat.

### DEC-M30: App-Level Root Mounting via CallContext
- **Konteks**: Pengguna dapat menerima panggilan masuk saat sedang membuka layar apapun di aplikasi (Recent Chats, Chat Screen, Search, Profile).
- **Keputusan**: Menempatkan `CallProvider` di root `App.tsx` agar listener WebSocket sinyal panggilan aktif secara global dan modal panggilan masuk dapat muncul di atas layar apapun.

### DEC-M31: Dual-Layer Audio & Microphone Permissions Guard (Android & iOS)
- **Konteks**: Panggilan suara WebRTC memerlukan akses hardware mikrofon (`RECORD_AUDIO` di Android dan `NSMicrophoneUsageDescription` di iOS) serta izin modifikasi output audio (`MODIFY_AUDIO_SETTINGS`).
- **Keputusan**: Menerapkan izin 2 lapis:
  1. *Static Layer*: Deklarasi eksplisit di `mobile/app.json` untuk Android `permissions` dan iOS `infoPlist`.
  2. *Runtime Layer*: Pengecekan dan prompt dinamis (`requestRecordingPermissionsAsync`) di `callAudioManager.ts` sebelum panggilan suara diinisiasi atau dijawab, dengan fallback pesan user-friendly jika izin ditolak pengguna.
