# Implementation Plan — Milestone M-Mobile-8.12

## 🎯 Target Objective
Mengintegrasikan modul native C++ `react-native-webrtc` ke dalam WuzzChat Mobile, mengonfigurasi `mediaDevices.getUserMedia({ audio: true })` dan native `RTCPeerConnection` untuk menangkap suara mikrofon asli, mengompresi Opus, dan mentransmisikan paket audio UDP RTP secara peer-to-peer dengan PWA (`chat.wuzzhub.id`), serta melakukan kompilasi Expo Development Build (`com.wuzzchat.mobile`) langsung ke perangkat Android yang terhubung via ADB (`192.168.18.11:5555`).

---

## 📋 Target Files & Scope
1. `mobile/package.json`: Menambahkan dependensi `react-native-webrtc` dan `expo-dev-client`.
2. `mobile/app.json`: Menambahkan package name `com.wuzzchat.mobile`, permissions audio/kamera/bluetooth, dan plugin `react-native-webrtc`.
3. `mobile/src/services/webrtcService.ts`: Mengintegrasikan native `RTCPeerConnection`, `mediaDevices.getUserMedia`, dan `MediaStreamTrack` dari `react-native-webrtc` dengan auto-fallback aman.
4. `mobile/src/services/callAudioManager.ts`: Mengatur routing audio native WebRTC (earpiece vs speakerphone via `expo-audio`).
5. `mobile/android/`: Dihasilkan via `npx expo prebuild` dan di-build via `npx expo run:android`.

---

## 🧪 Verification Strategy
1. Verifikasi instalasi dependensi & TypeScript (`npx tsc --noEmit`).
2. Verifikasi kompilasi prebuild Android (`npx expo prebuild --platform android --clean`).
3. Build & Install development APK ke perangkat Android via ADB (`npx expo run:android --device`).
4. Uji panggilan suara nyata dua arah antara perangkat Android HP dan PWA Chrome.

