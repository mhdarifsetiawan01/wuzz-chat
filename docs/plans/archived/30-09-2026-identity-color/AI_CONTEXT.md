# AI Context — Mobile UI Redesign: Clean Soft-Blue Modern (Image-Inspired)

- **Target Repository & Directory**: `mobile/` (React Native Expo 57, TypeScript, React 19)
- **Active Git Branch**: `dev` (Protected branch rule: never commit or work on `main`)
- **Aesthetic Direction**: Clean Soft-Blue Minimalist (Inspired by user's reference images: iOS/Modern messenger with clean white/ice-blue background, favorite contacts horizontal cards, circular avatars with unread badge overlays, soft shadows, and vibrant soft-blue accent)
- **New Feature Preparation**: Addition of "Feed" (Status / Berita / Postingan publik) in the bottom navigation architecture alongside Chats and Settings
- **Key Performance Constraint**: Clean views, native shadows and elevations, lightweight FlatList items, 120 FPS target
- **Scope of Current Milestone**: Redesign Home Screen (`RecentChatsScreen`), Favorite Contacts horizontal carousel, `ChatListItem`, `Avatar` (circular with unread badge overlay), and bottom tab bar preparation for Feed
- **Testing Gate**: Automated TypeScript typecheck (`npx tsc --noEmit` in `mobile/`)
