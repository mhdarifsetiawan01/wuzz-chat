# Context Boundaries & System Constraints

## Target Scope
- **Component**: Mobile App Home Screen (`mobile/src/screens/RecentChatsScreen.tsx`)
- **Design System SSOT**: `mobile/DESIGN.md` (Aurora Glassmorphic Dark Mode, Section 3 Layar 1: HomeScreen)
- **Context Primer**: `docs/context/MOBILE.md`

## Operating Constraints
1. **Branch**: `dev` (strictly non-main).
2. **Tokens**: Import all colors, radius, spacing, and typography from `@/theme` (`colors.ts`, `spacing.ts`, etc.).
3. **Safe Area**: Dynamically computed via `useSafeAreaInsets()`.
4. **Touch Target**: Minimum 44x44 dp for all interactive elements.
5. **No Live Server Leaks**: Verify with `npx tsc --noEmit`. No servers left hanging.
