# Implementation Summary — Sub-Group Join Request Notification Engine

## 📋 Executive Overview
- **Fitur**: Real-Time Join Request Notification & Badge Counter untuk Subgrup/Topik Forum Privat.
- **Tujuan**: Memastikan admin & pembuat subgrup privat segera mengetahui permohonan izin gabung dari anggota melalui WebSocket real-time dan Web Push notification, serta menampilkan visual badge counter pada UI drawer subgrup.
- **Status**: Active Implementation (Phase 1).

## 🚀 Key Deliverables
1. Backend:
   - Query `GetSubGroupAdmins` di `group_store.go` untuk menyaring creator & admin yang merupakan anggota subgrup tersebut.
   - Metode `NotifyUsers` di `pushService` untuk pengiriman Web Push ke daftar user ID tertentu.
   - Metode `NotifyUser` di `Hub` untuk pengiriman pesan WebSocket spesifik ke target user.
   - Pengiriman notifikasi pada `handleRequestToJoinSubGroup` (ke admin subgrup) dan `handleRespondJoinRequest` (ke pemohon).
   - Penambahan `pending_requests_count` di `GetSubGroups`.
2. Frontend:
   - Update tipe `SubGroupItem` dengan `pending_requests_count?: number`.
   - Update UI `SubGroupListDrawer.tsx` dengan badge visual pada tombol "📋 Kelola Izin" dan handling event live notification.
   - Update `page.tsx` WebSocket listener untuk menangkap event `join_request` dan memunculkan toast/alert informatif.
