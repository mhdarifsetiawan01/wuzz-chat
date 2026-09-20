# Implementation Plan: Milestone 6 — Member Knowledge Viewer (Frontend Next.js)

## 🎯 Objective
Membangun antarmuka pembacaan memori terkurasi bagi seluruh anggota grup (Member Knowledge Viewer), mencakup penampil daftar memori grup, kartu detail memori terdenormalisasi, banner memori pada forum kedaluwarsa, dan pencatatan analitik keterbacaan sesuai `docs/GROUP_MEMORY_AI_SPEC.md` Bagian 11 & 12.

## 📦 Scope of Work

### 1. Komponen Penampil Memori Grup (`frontend/app/chat/memory/`)
- **`GroupMemoryListModal.tsx`**:
  - Modal/Drawer yang menampilkan linimasa seluruh memori grup yang telah disetujui (`fetchGroupMemories(groupId)`).
  - Tampilan kartu memori: Judul forum, cuplikan ringkasan, jumlah keputusan, admin yang memvalidasi, tanggal disetujui, dan indikator suntingan admin.
  - Opsi klik kartu untuk membuka detail lengkap.
- **`GroupMemoryDetailModal.tsx`**:
  - Kartu detail memori penuh sesuai spesifikasi Bagian 12:
    - **Header**: Judul forum, tanggal disetujui, admin validator.
    - **Summary**: Ringkasan utama dengan `ConfidenceBadge`.
    - **Decisions**: Daftar poin keputusan lengkap dengan bukti kutipan pesan sumber (`preview`, `sender_name`, `sent_at`) dan tautan jump-to-chat.
    - **Journey Lite**: Tiga fase alur diskusi (*Awalnya... Kemudian... Akhirnya...*) jika tersedia.
    - **Footer**: Badge tanda validasi manusia (*"✅ Divalidasi oleh {admin_name}"* atau *"✅ Divalidasi dan disunting oleh {admin_name}"*).
  - Panggilan otomatis ke `fetchApprovedMemoryDetail(memoryId)` yang secara otomatis memicu pencatatan analitik `memory_view_events` di backend.

### 2. Integrasi Banner Memori di Forum Kedaluwarsa (`ChatArea.tsx`)
- Jika ruang obrolan yang sedang dibuka merupakan subgrup/forum berstatus expired (`status === 'expired'` atau remainingSeconds <= 0):
  - Tampilkan banner sticky di atas linimasa chat: **"🧠 Memori Grup Tersedia — Diskusi forum ini telah selesai dan dirangkum ke dalam Memori Pengetahuan Grup [Buka Memori →]"**.
  - Mengklik banner langsung memunculkan `GroupMemoryDetailModal`.

### 3. Entry Point di Header / Drawer Grup (`SubGroupListDrawer.tsx` & `GroupInfoDrawer.tsx`)
- Menambahkan tombol aksi cepat: **"🧠 Arsip Memori Grup"** di drawer topik forum dan info grup sehingga seluruh anggota dapat mengakses riwayat keputusan grup kapan saja.

### 4. Verification Plan
- **Automated Gate**:
  - `npm run build` di `frontend/` (0 error TypeScript & Turbopack).
  - `go test ./...` di `backend/` (100% PASS).
- **Dual-Platform Compatibility**:
  - Tampilan responsif pada Mobile (100dvh) dan Desktop.
  - Kepatuhan token CSS dari `globals.css` tanpa raw hex code.
