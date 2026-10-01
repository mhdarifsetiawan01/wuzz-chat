# Handover & Verification: Mobile Clickable Links & Link Preview Card

## 📦 Deliverables
1. [`mobile/src/utils/linkUtils.ts`](mobile/src/utils/linkUtils.ts):
   - Regex URL detector (http/https/www).
   - Sanitasi tanda baca trailing (`.,;:!?()[]"'`).
   - Whitelist protokol aman (`http:` & `https:`), tolak skema eksploitasi native.
   - Ekstraktor URL valid pertama untuk WhatsApp-style single preview per message.
   - `safeOpenUrl` dengan `Linking.canOpenURL` dan feedback alert yang aman.
2. [`mobile/src/api/linkPreview.ts`](mobile/src/api/linkPreview.ts):
   - Integrasi REST API `/api/link-preview` dengan timeout 8s (AbortController).
   - In-memory LRU/FIFO Cache (kapasitas 100 entri) untuk performa 60 FPS di FlatList tanpa query berulang.
3. [`mobile/src/components/LinkPreviewCard.tsx`](mobile/src/components/LinkPreviewCard.tsx):
   - Kartu pratinjau thumbnail gambar web, favicon, nama domain, judul, dan deskripsi singkat.
   - Skeleton loader ringkas dan silent error fallback jika scraping gagal.
4. [`mobile/src/components/MessageBubble.tsx`](mobile/src/components/MessageBubble.tsx):
   - Integrasi auto-linking teks pesan (warna link kontras WCAG AA: `#e0f2fe` di atas bubble self, `#38bdf8` di atas bubble other).
   - Integrasi `LinkPreviewCard` di bawah konten teks.

## 🧪 Verification Proof
- `npx tsc --noEmit` (mobile): **LULUS (Exit code 0, 0 error)**.
- `go test -v ./internal/api -run TestLinkPreview` (backend): **LULUS (100% PASS)**.
