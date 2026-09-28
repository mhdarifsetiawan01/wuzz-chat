# Implementation Plan — Mobile Keyboard Resilience across Android 10-16

## 1. Technical Strategy
1. **Native Window Insets Listener (`MainActivity.kt`)**:
   - Conditional check `Build.VERSION.SDK_INT >= 35` (Android 15 & Android 16+).
   - In Android 15 & 16 (Edge-to-Edge enforced), attach `ViewCompat.setOnApplyWindowInsetsListener` to `findViewById(android.R.id.content)` to dynamically update bottom padding with `imeInsets.bottom`.
   - In Android 10 (API 29) to Android 14 (API 34), bypass listener and preserve native `adjustResize` behavior to prevent double padding.
2. **React Native Screen Ergonomics**:
   - In `LoginScreen.tsx` & `RegisterScreen.tsx`: ensure `ScrollView` has proper keyboard dismissal, touch persistence, and scroll clearance so that when keyboard appears, inputs and action buttons remain fully visible and scrollable.
   - In `ChatScreen.tsx`: verify `ChatInputBar` handles bottom padding consistently between keyboard open (`8px`) and keyboard closed (`Math.max(insets.bottom, 8)`).

## 2. Target Modified Files
- `mobile/android/app/src/main/java/com/wuzzchat/mobile/MainActivity.kt`
- `mobile/src/screens/LoginScreen.tsx`
- `mobile/src/screens/RegisterScreen.tsx`

## 3. Verification Strategy
- `cd mobile && npx tsc --noEmit` (TypeScript typecheck).
- `cd mobile/android && ./gradlew assembleDebug` or compilation check.

