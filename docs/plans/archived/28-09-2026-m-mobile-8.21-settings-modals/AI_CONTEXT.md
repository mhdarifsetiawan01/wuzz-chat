# AI CONTEXT — M-Mobile-8.21: SettingsScreen Modals & Interactive Settings

## Workspace Context
- **Target Repository**: Wuzz Chat (`mobile/`)
- **Active Branch**: `dev` *(Protected branch `main` is strictly avoided)*
- **Environment**: React Native (Expo SDK 52 Managed Workflow), TypeScript, Android Keystore & SQLite WAL.
- **Relevant Design Tokens**: `mobile/DESIGN.md`, `mobile/src/theme/colors.ts`, `mobile/src/theme/spacing.ts`.

## Domain References
- `PROMPT.md`: Master Domain Router (Kategori: Profil User & Identitas, Notifikasi & Sesi).
- `docs/context/MOBILE.md`: Arsitektur Trusted Device, E2EE Key Storage, Storage Retention & Vacuum Roadmap.
- `docs/progress/MOBILE.md`: Milestone M-Mobile-8.21.

## Active Constraints & Safety Protocols
- **Server Lifecycle**: Wajib mematikan background server testing bila dijalankan.
- **Dual-Platform Architecture**: Kompatibilitas sentuh, safe-area insets (`useSafeAreaInsets`), Android BackHandler, keyboard layout clamping.
- **Token Compliance**: Wajib menggunakan token tema Aurora Dark Mode dari `mobile/src/theme/`.
- **Quality Gate**: `npx tsc --noEmit` wajib 0 error pada layer `mobile/`.
