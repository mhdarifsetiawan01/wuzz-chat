# Implementation Plan — WebRTC Call Background Push Notification

## 🎯 Objectives
Mengatasi masalah panggilan terputus/tidak masuk saat aplikasi mobile sedang tidak dibuka (background / killed) dengan memanfaatkan sinyal Firebase Cloud Messaging (FCM) High-Priority Data Push.

## 📂 Target Modified / Created Files
1. `backend/internal/push/push.go`: Menambahkan metode `NotifyIncomingCall` dan `NotifyCallCancelled`.
2. `backend/internal/push/push_test.go`: Menambahkan pengujian unit untuk kedua metode push panggilan baru.
3. `backend/internal/ws/client.go`: Memperluas penanganan `TypeCallOffer` dan `TypeCallEnd` di `onCallSignaling` agar memicu push ke penerima yang tidak aktif di room/WebSocket.
4. `mobile/src/services/notificationService.ts`: Menambahkan channel `wuzz_chat_calls` dengan `importance: MAX`, serta fungsi dismiss notifikasi.
5. `mobile/src/services/notificationBackgroundTask.ts`: Menambahkan logika rendering notifikasi panggilan masuk lokal dan pembersihan notifikasi saat panggilan dibatalkan.
6. `mobile/src/context/CallContext.tsx`: Menambahkan listener/handler untuk menerima panggilan yang dipicu dari notifikasi luar / background.
7. `mobile/App.tsx`: Mendaftarkan event handling tap notifikasi panggilan masuk untuk meluncurkan antarmuka panggilan.

## 🏗️ Technical Architecture & Flow

```mermaid
sequenceDiagram
    autonumber
    actor Caller as User A (Mobile/Web)
    participant WS as Backend WebSocket Hub (Go)
    participant Push as Backend Push Service
    participant FCM as Firebase FCM v1
    actor Callee as User B (Mobile - Background/Killed)

    Caller->>WS: TypeCallOffer {room_id, sdp, peer_id}
    WS->>WS: Cek status online Callee di WebSocket
    alt Callee Sedang Online di WebSocket
        WS->>Callee: TypeCallOffer via WS langsung (Realtime Modal)
    else Callee Sedang Offline / App Ditutup
        WS->>Push: NotifyIncomingCall(roomID, callerID, callerNickname, sdpOffer, calleeIDs)
        Push->>FCM: Send High-Priority Silent Data Push (call_incoming)
        FCM->>Callee: Bangunkan Background Task (OS Notification Bar)
        Note over Callee: Tampil Head-Up Notification "📞 Panggilan Suara dari Alice" + Dering
        Callee->>Callee: User menekan Notifikasi / "Terima"
        Callee->>WS: Reconnect WebSocket & Join Room
        Callee->>WS: TypeCallAnswer {room_id, sdp}
        Note over Caller,Callee: WebRTC P2P Audio Aktif!
    end
```

## 🧪 Verification Strategy
1. **Backend Verification**:
   - `go test -v ./internal/push/...`
   - `go test -v ./internal/ws/...`
   - `go test -v ./...` (memastikan 0 regresi di seluruh backend).
2. **Mobile Verification**:
   - `cd mobile && npx tsc --noEmit` (memastikan 0 error tipe TypeScript).
