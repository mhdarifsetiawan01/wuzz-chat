# 📞 Domain: WebRTC Real-Time Calling (`WEBRTC_CALLING`)

Dokumen ini adalah spesifikasi definitif untuk domain **Panggilan Suara Real-Time P2P (1-on-1 Voice Calling) via WebRTC** pada Wuzz Chat.

---

## 📋 1. Aturan Bisnis & Invarian (*Business Invariants*)

1. **P2P Audio Calling**:
   - Media audio ditransmisikan secara langsung *Peer-to-Peer* (P2P) antar-perangkat menggunakan WebRTC MediaStream tanpa melewati server utama (menjamin latensi ultra-rendah dan privasi).
2. **NAT & Firewall Traversal**:
   - Koneksi mengandalkan Google STUN server publik (`stun:stun.l.google.com:19302`) untuk pemetaan IP publik.
   - Dilengkapi fallback OpenRelay TURN server untuk menembus jaringan seluler bertipe *Symmetric NAT*.
3. **SDP Normalization & RFC Compliance**:
   - Klien seluler (Android/iOS) dan Web melakukan normalisasi atribut SDP DTLS fingerprint (`setup:actpass` pada penawar / `setup:active` pada penjawab) untuk mencegah kegagalan *handshake crypto negotiation* antar platform.
4. **Manajemen Rute Audio Seluler**:
   - Mendukung peralihan dinamis antara **Loudspeaker (Handsfree)** dan **Earpiece (Penerima Telinga)** menggunakan modul native audio.
5. **Nada Dering Prosedural**:
   - Nada panggil keluar (*ringback*) dan nada panggilan masuk (*ringtone*) dibangkitkan secara prosedural menggunakan Web Audio API / synthesizer audio lokal tanpa memerlukan aset berkas audio eksternal.
6. **Background & Cold-Start Call Push Notification (FCM v1)**:
   - Jika penerima tidak terhubung ke WebSocket (aplikasi di-background atau ditutup), backend otomatis memicu High-Priority Push Notification ke token FCM penerima (`type: "call_incoming"`).
   - Dilengkapi proteksi anti-spam (cooldown 5 detik per room), payload size guard (< 3500 bytes), serta sinyal pembatalan instan (`type: "call_cancelled"`).

---

## 📡 2. Protokol Signaling WebSocket

Signaling dijalankan melalui koneksi WebSocket yang sudah terotentikasi:

```mermaid
sequenceDiagram
    autonumber
    actor Caller as Penelepon (A)
    participant WS as WebSocket Hub (Go)
    actor Callee as Penerima (B)

    Caller->>WS: call_offer {sdp, room_id, caller_name}
    WS->>Callee: call_offer {sdp, room_id, caller_name}
    Note over Callee: Muncul IncomingCallModal & Berdering
    alt Menjawab Panggilan
        Callee->>WS: call_answer {sdp, room_id}
        WS->>Caller: call_answer {sdp, room_id}
        Note over Caller,Callee: Pertukaran ICE Candidate via WS
        Caller->>WS: ice_candidate {candidate, room_id}
        WS->>Callee: ice_candidate {candidate, room_id}
        Callee->>WS: ice_candidate {candidate, room_id}
        WS->>Caller: ice_candidate {candidate, room_id}
        Note over Caller,Callee: P2P Audio Streaming Aktif (WebRTC)
    else Menolak Panggilan
        Callee->>WS: call_reject {room_id, reason: "busy"/"declined"}
        WS->>Caller: call_reject {room_id}
    end
    Caller->>WS: call_end {room_id}
    WS->>Callee: call_end {room_id}
```

---

## 💻📱 3. Antarmuka Pengguna & Komponen (Web & Mobile)
- **Modal Panggilan Masuk**: `IncomingCallModal.tsx` dengan tema Aurora Dark Mode, avatar berkedip/pendar neon, serta tombol "Tolak" (merah) dan "Terima" (hijau).
- **Overlay Panggilan Aktif**: `ActiveCallOverlay.tsx` dengan live timer panggilan (mm:ss), toggle mute mikrofon, switch audio output, dan tombol tutup panggilan merah mengambang.
