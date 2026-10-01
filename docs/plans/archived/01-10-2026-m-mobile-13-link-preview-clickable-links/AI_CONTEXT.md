# Context & Workspace Boundaries: Mobile Clickable Links & Link Preview Card

- **Target Subsystem**: Mobile React Native Expo (`mobile/`)
- **Domain Focus**: `MESSAGING_CHAT` ([`docs/domains/MESSAGING_CHAT.md`](docs/domains/MESSAGING_CHAT.md))
- **Primary Files**:
  - `mobile/src/components/MessageBubble.tsx`
  - `mobile/src/components/LinkPreviewCard.tsx` (New)
  - `mobile/src/components/index.ts`
  - `mobile/src/api/client.ts`
  - `mobile/src/api/types.ts`
  - `mobile/src/utils/linkUtils.ts` (New: Secure URL parser & sanitizer)
- **Active Constraints**:
  - Performa: In-memory LRU/Map cache untuk hasil scrape, non-blocking render di FlatList (60 FPS).
  - Keamanan: Whitelist skema `http`/`https` saja, sanitasi trailing punctuation, proteksi SSRF via existing backend guard, no malicious scheme execution (`javascript:`, `file:`, `intent:`).
  - Dual-Platform & Mobile UX: Sesuai WhatsApp pattern (hanya 1 preview card per pesan untuk link pertama), safe clickable hit-slop.
