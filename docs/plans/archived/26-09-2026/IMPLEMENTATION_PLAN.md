# Implementation Plan — Milestone M-Mobile-8.11: WebRTC 1-on-1 Voice Calling & Audio Session Management (Mobile)

## 🎯 Tujuan & Latar Belakang
Mengintegrasikan fitur panggilan suara peer-to-peer (P2P) berbasis WebRTC ke aplikasi WuzzChat Mobile (React Native / Expo SDK 57) agar kompatibel penuh dengan Go Backend WebSocket Signaling dan Frontend Web. Pengguna mobile dapat memanggil dan menerima panggilan suara dari pengguna Web maupun sesama pengguna mobile secara real-time.

---

## 🏛️ Arsitektur & Spesifikasi Teknis

### 1. WebSocket Signaling Integration (`mobile/src/services/websocket.ts` & `webrtcService.ts`)
- **Tipe Pesan Signaling**:
  - `call_offer`: Pemanggil mengirim penawaran SDP ke penerima di room DM.
  - `call_answer`: Penerima mengirim balasan SDP ke pemanggil setelah menerima panggilan.
  - `ice_candidate`: Pertukaran kandidat koneksi STUN/TURN antar peer.
  - `call_reject`: Penerima menolak panggilan masuk.
  - `call_end`: Pemanggil atau penerima menutup / membatalkan panggilan.
  - `call_busy`: Sinyal otomatis jika penerima sedang berada dalam panggilan lain saat panggilan masuk tiba.
- **ICE Configuration**:
  - Google Public STUN Cluster (`stun:stun.l.google.com:19302`, dll).
  - OpenRelay STUN & TURN Relay Cluster (`turn:standard.relay.metered.ca:80/443`, transport udp/tcp).

### 2. Call State Machine & Service Layer (`webrtcService.ts`)
- **Call Statuses**:
  - `idle`: Tidak ada panggilan aktif.
  - `outgoing_calling`: Memanggil peer, menunggu jawaban / dering.
  - `incoming_ringing`: Panggilan masuk berdering, menunggu aksi user (Terima / Tolak).
  - `connecting`: Peer menerima panggilan, pertukaran SDP & ICE candidate berlangsung.
  - `connected`: P2P terhubung, timer durasi berjalan, audio streaming aktif.
  - `ended`: Panggilan ditutup, membersihkan resource audio & koneksi.
- **Resilience & Universal Compatibility**:
  - Menyediakan interface `WebRTCSession` terisolasi dengan penanganan gracefully untuk environment React Native/Expo.
  - Pipa signaling dan state machine dapat beroperasi penuh dengan logging diagnosa komprehensif.

### 3. Audio Session, Permissions & Ringtone Manager (`mobile/src/services/callAudioManager.ts` & `app.json`)
- **Android & iOS Permissions Configuration (`mobile/app.json`)**:
  - Android permissions: `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS`, `INTERNET`.
  - iOS `infoPlist`: `NSMicrophoneUsageDescription` ("WuzzChat memerlukan izin akses mikrofon untuk melakukan panggilan suara dan mengirim pesan audio.").
  - Runtime permission guard: request / periksa izin mikrofon (`requestRecordingPermissionsAsync`) sebelum memulai (`startCall`) atau menerima (`acceptCall`) panggilan.
- **Expo Audio Management (`expo-audio`)**:
  - Konfigurasi audio mode untuk panggilan (`allowsRecording: true`, `playsInSilentMode: true`).
  - Switch rute audio antara **Speakerphone** (`shouldRouteThroughEarpiece: false`) dan **Earpiece** (`shouldRouteThroughEarpiece: true`).
  - Kontrol Mute / Unmute mikrofon (`setMute(boolean)`).
  - Generator / Pemutar nada sambung (*outgoing ringback tone*) dan nada dering (*incoming ringtone*).
  - Lifecycle cleanup otomatis saat panggilan diakhiri atau ditolak.

### 4. User Interface Panggilan (Aurora Dark Mode)
- **Tombol Panggil (`📞`)** di header `ChatScreen.tsx` untuk 1-on-1 chat (`!isGroup`).
- **`IncomingCallModal.tsx`**:
  - Banner/Modal fullscreen bertema Aurora Dark Mode.
  - Avatar penelepon, nama/nickname, animasi denyut (*pulse indicator*).
  - Tombol **Terima (Hijau)** dan **Tolak (Merah)**.
- **`ActiveCallOverlay.tsx`**:
  - Tampilan panggilan aktif dengan avatar lawan bicara.
  - Indikator status: "Memanggil...", "Menghubungkan...", "Terhubung" + timer durasi `mm:ss`.
  - Tombol kontrol: **Mute Mic**, **Speaker/Earpiece Toggle**, dan **Tutup Panggilan (Merah)**.
- **Root Mount (`App.tsx` & `CallContext.tsx`)**:
  - Panggilan masuk dapat dideteksi dan ditampilkan dari screen manapun saat user login.

---

## 📂 Target Modifikasi & Pembuatan File
1. `mobile/app.json`: Tambahkan deklarasi permissions Android (`RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS`) dan iOS `NSMicrophoneUsageDescription`.
2. `mobile/src/services/websocket.ts`: Tambah helper method signaling (`sendCallOffer`, `sendCallAnswer`, `sendIceCandidate`, `sendCallReject`, `sendCallEnd`, `sendCallBusy`).
3. `mobile/src/services/callAudioManager.ts`: Audio manager khusus panggilan suara berbasis `expo-audio` + runtime permission check.
4. `mobile/src/services/webrtcService.ts`: WebRTC calling session & state management.
5. `mobile/src/context/CallContext.tsx`: React Context untuk state panggilan global di level mobile app.
6. `mobile/src/components/IncomingCallModal.tsx`: Komponen modal panggilan masuk.
7. `mobile/src/components/ActiveCallOverlay.tsx`: Komponen overlay panggilan aktif dengan kontrol mic/speaker/hangup.
8. `mobile/src/screens/ChatScreen.tsx`: Tambah tombol `📞` panggil suara di header room 1-on-1.
9. `mobile/App.tsx`: Bungkus dengan `CallProvider` dan pasang modal panggilan global.
10. `mobile/test-webrtc-signaling.mjs`: Skrip automated test simulasi skenario signaling WebRTC mobile.
11. `docs/MOBILE_INTEGRATION_GUIDE.md`: Update status checklist dan dokumentasi WebRTC.

---

## 🧪 Strategi Verifikasi & Quality Gate
1. `npx tsc --noEmit` di `mobile/` (0 error TypeScript).
2. `go test -v ./...` di `backend/` (100% test lulus).
3. `npm run build` di `frontend/` (0 error kompilasi).
4. Menjalankan `test-webrtc-signaling.mjs` untuk menguji alur signaling P2P antara dua klien mobile simulasi.
