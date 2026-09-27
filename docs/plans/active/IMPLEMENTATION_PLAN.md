# IMPLEMENTATION PLAN — M-Mobile-8.19
## Aurora Glassmorphic Bottom Tab Navigation & Multi-Tab Screens

---

## Objectives
1. Install `@react-navigation/bottom-tabs` package.
2. Buat `MainTabNavigator.tsx` dengan custom Aurora tab bar.
3. Buat `CallsHistoryScreen.tsx` (Tab Panggilan).
4. Buat `SettingsScreen.tsx` (Tab Pengaturan & Profil).
5. Modifikasi `AppNavigator.tsx` agar `Home` route diganti menjadi `MainTabs`.
6. Update `types.ts` dengan tipe baru.
7. Update index exports.
8. Verifikasi typecheck `npx tsc --noEmit`.

---

## Arsitektur Navigator

```
NavigationContainer
└── AppNavigator (Native Stack)
    ├── MainTabs (Bottom Tab) ← entry point
    │   ├── Chats tab → RecentChatsScreen
    │   ├── Calls tab → CallsHistoryScreen
    │   └── Settings tab → SettingsScreen
    ├── Chat (slide_from_right) ← meluncur di atas tab bar
    ├── NewChat (slide_from_right)
    ├── NewGroup (slide_from_right)
    └── GroupInfo (slide_from_right)
```

---

## Target Files

| File | Status |
|------|--------|
| `mobile/package.json` | MODIFY — install bottom-tabs |
| `mobile/src/navigation/types.ts` | MODIFY — tambah TabParamList |
| `mobile/src/navigation/MainTabNavigator.tsx` | CREATE |
| `mobile/src/screens/CallsHistoryScreen.tsx` | CREATE |
| `mobile/src/screens/SettingsScreen.tsx` | CREATE |
| `mobile/src/screens/index.ts` | MODIFY — tambah exports |
| `mobile/src/navigation/AppNavigator.tsx` | MODIFY — ganti Home → MainTabs |
| `mobile/src/navigation/index.ts` | MODIFY — tambah export |

---

## Verification Strategy
- `cd mobile && npx tsc --noEmit` → 0 errors
- Mental smoke test Desktop & Mobile flow
