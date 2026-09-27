# Implementation Plan: Mobile HomeScreen Design System Alignment

## Objective
Update `mobile/src/screens/RecentChatsScreen.tsx` to match the exact specifications outlined in `mobile/DESIGN.md`:
1. Clean brand header with Connection State dot & text, key transfer modal trigger, notification settings modal trigger, and streamlined profile action.
2. Real-time debounced Search Bar (filtering by title, peer_nickname, participant name, last message snippet).
3. Filter Tabs (Semua, Belum Dibaca, Grup) with active styling according to Aurora Dark Mode tokens.
4. Filtered conversations FlatList with tailored empty states (all empty, search empty, unread empty, group empty).
5. Dynamic safe area positioning for FAB and list padding.

## Target Files
- `mobile/src/screens/RecentChatsScreen.tsx`: Implement search bar, filter tabs, dynamic insets, and visual cleanup.

## Verification Strategy
- `cd mobile && npx tsc --noEmit`: Ensure 0 TypeScript errors.
- Verify touch targets >= 44dp.
- Verify compliance with design tokens from `mobile/src/theme`.
