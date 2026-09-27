# Decision Log

### DEC-020: Mobile Home Screen Alignment with DESIGN.md
- **Context**: `mobile/src/screens/RecentChatsScreen.tsx` lacked the Search Bar, Filter Tabs, and dynamic insets specified in `mobile/DESIGN.md` Section 3.
- **Decision**:
  1. Add real-time search filtering covering chat title, participant names, and decrypted message snippets.
  2. Add category filter tabs ('all', 'unread', 'groups') with count badges where appropriate.
  3. Replace `SafeAreaView` with `useSafeAreaInsets()` to dynamically pad header and elevate FAB above system bars.
  4. Redesign header action cluster to be cleaner and adhere to min 44dp touch targets.
- **Impact**: Full compliance with `mobile/DESIGN.md` and WhatsApp Single-Screen Flow.
