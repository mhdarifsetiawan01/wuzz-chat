# Implementation Plan: Mobile Clickable Links & Link Preview Card

## 🎯 Objectives
1. **Clickable Links (Auto-Linking)**: Mengurai dan merender tautan URL di dalam konten pesan teks menjadi tautan aktif yang dapat diklik langsung di perangkat mobile dengan aman.
2. **Link Preview Card (Pratinjau Tautan Web)**: Mengimplementasikan kartu pratinjau thumbnail, judul situs, deskripsi, dan domain badge yang di-fetch dari backend API (`/api/link-preview`), dilengkapi in-memory caching untuk menjaga performa rendering FlatList 60 FPS.
3. **Keamanan (Security First)**:
   - Sanitasi URL sebelum parsing & scraping (menghapus trailing punctuation `.,;:!?()[]`).
   - Whitelist ketat skema protokol (`http:` dan `https:`). Tolak skema lokal berbahaya (`file:`, `javascript:`, `data:`, `intent:`, `content:`).
   - Sanitasi teks OpenGraph dari script injection dan validasi batas string.
4. **Performa (High Performance & Smooth Scrolling)**:
   - In-memory cache singleton (`LinkPreviewCache`) berbatas ukuran agar tidak membebani memori ponsel atau melakukan redundant HTTP request saat scroll up/down.
   - Timeout network request terkendali (AbortController maks 8 detik).
   - Card dibatasi maksimal 1 URL pertama per pesan (WhatsApp standard).

## 📂 Target Files
- `mobile/src/utils/linkUtils.ts` (Baru: Regex detector, URL sanitizer, safe openURL handler)
- `mobile/src/components/LinkPreviewCard.tsx` (Baru: Komponen UI pratinjau kartu tautan)
- `mobile/src/components/MessageBubble.tsx` (Update: Integrasi auto-link parser & LinkPreviewCard)
- `mobile/src/components/index.ts` (Update: Export LinkPreviewCard)
- `mobile/src/api/types.ts` (Update: Interface LinkPreview data contract)

## 🧪 Verification Strategy
1. Unit testing / TypeScript compile typecheck: `npx tsc --noEmit` di `mobile/`.
2. Verifikasi keamanan URL sanitizer (menolak link non-http/https, menangani link bertanda kurung/titik di ujung).
3. Verifikasi performa cache (hit in-memory vs miss fetch).
