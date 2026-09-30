# Implementation Plan — Clean Soft-Blue Modern Redesign (Image Reference)

## 1. Objectives
Rebuild the mobile UI to faithfully match the clean, airy, high-end messenger layout in the reference images, using a soft-blue base palette:
1. Update `mobile/src/theme/colors.ts`: Establish the Clean Soft-Blue palette (Soft Ice-Blue `#F3F6FB`, pure white surface `#FFFFFF`, vibrant soft-blue accent `#2563EB`/`#3B82F6`, crisp text `#0F172A`/`#64748B`, soft shadows).
2. Update `mobile/src/components/Avatar.tsx`: Circular avatars (`shape="circle"` by default), support badge overlays (unread count or status dot attached directly to the avatar's bottom-right corner as seen in the screenshot).
3. Redesign `mobile/src/components/ChatListItem.tsx`: Clean row with large circular avatar + unread badge overlay, bold contact name, subtle right-aligned relative time ("2h ago", "4h ago"), and clean grey snippet preview with hairline separator.
4. Redesign `mobile/src/screens/RecentChatsScreen.tsx`:
   - Top Header: Large bold "Messages" title (or "Pesan" / "Wuzz"), top-right compose icon button (`✏️`).
   - "FAVORITE CONTACTS" horizontal card carousel: Elevated clean white cards with circular avatars, unread badge counter, and contact name below.
   - Clean list with subtle dividers.
5. Update `mobile/src/navigation/MainTabNavigator.tsx` & `types.ts`:
   - Add new `Feed` tab (Status / Berita / Postingan) to the bottom tab bar with an attractive icon (📰 / 👥).
   - Create a clean `FeedScreen` placeholder / feed timeline so tapping the tab works seamlessly.
6. Verify via `npx tsc --noEmit` in `mobile/`.

## 2. Target Modified/Created Files
- `mobile/src/theme/colors.ts`
- `mobile/src/components/Avatar.tsx`
- `mobile/src/components/ChatListItem.tsx`
- `mobile/src/screens/RecentChatsScreen.tsx`
- `mobile/src/navigation/types.ts`
- `mobile/src/navigation/MainTabNavigator.tsx`
- `mobile/src/screens/FeedScreen.tsx` (new)
- `mobile/src/screens/index.ts`

## 3. Verification Strategy
- Typecheck: `npx tsc --noEmit` in `mobile/` (0 errors).
- Clean visual hierarchy check against reference screenshot.
