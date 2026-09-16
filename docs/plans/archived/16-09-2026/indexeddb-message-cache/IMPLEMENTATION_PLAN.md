# IMPLEMENTATION_PLAN.md — Milestone 8.4: IndexedDB Message Cache

## 1. Tujuan
Mengimplementasikan cache pesan lokal berbasis IndexedDB agar riwayat chat yang sudah berhasil didekripsi tersimpan secara persisten di perangkat pengguna. Dengan ini, pesan lama tetap dapat dibaca meskipun kunci kriptografi lawan bicara sudah berubah (misal karena reset device).

## 2. Branch Kerja
`feature/indexeddb-message-cache` (merge ke `dev` setelah semua milestone selesai)

## 3. Daftar Milestone

| No | Milestone | Status |
|----|-----------|--------|
| 1  | Buat `messageCache.ts` — IndexedDB adapter | ⏳ Sedang Dikerjakan |
| 2  | Cache-First Load di `page.tsx` — baca dari IndexedDB sebelum fetch server | ⬜ |
| 3  | Write-Through Cache — tulis ke IndexedDB saat pesan masuk/terkirim/diubah/dihapus | ⬜ |
| 4  | Notifikasi "Kode Keamanan Berubah" di timeline | ⬜ |
| 5  | Update Roadmap & Dokumentasi Proyek | ⬜ |

## 4. File yang Dimodifikasi / Dibuat

- [NEW] `frontend/lib/messageCache.ts`
- [MODIFY] `frontend/app/chat/page.tsx`
- [MODIFY] `docs/ROADMAP.md`
- [MODIFY] `docs/plans/active/DECISION_LOG.md`
