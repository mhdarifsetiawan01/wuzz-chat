# 📋 Rencana Kerja: M-Mobile-8.16
## Native Stack Navigation & Aurora Action Bottom Sheet

**Status**: 🟡 PENDING APPROVAL  
**Branch**: `dev`  
**Dibuat**: 2026-09-27  
**Estimasi**: 4 task utama

---

## 🎯 Konteks & Masalah yang Dipecahkan

| # | Masalah Saat Ini | Solusi Target |
|---|---|---|
| 1 | `App.tsx` menggunakan conditional rendering manual (tidak ada animasi native 60fps, tidak ada gesture swipe-back) | Migrasi ke `createNativeStackNavigator` dengan animasi `slide_from_right` |
| 2 | Menu aksi di header `RecentChatsScreen` (profil, logout, transfer perangkat) masih pakai `Alert.alert` standar | Ganti dengan `BottomSheetModal` Aurora-grade yang slide-up dari bawah |

**Dependency yang sudah tersedia** (tidak perlu install baru):
- `@react-navigation/native` ^7.4.1 ✅
- `@react-navigation/native-stack` ^7.19.2 ✅
- `react-native-screens` ~4.26.0 ✅

---

## 📦 Task Breakdown

### Task 1: Komponen `BottomSheetModal` Reusable
**File**: `mobile/src/components/BottomSheetModal.tsx`

Membuat komponen bottom sheet generic yang dapat dipakai ulang di seluruh aplikasi:
- Backdrop: Modal native dengan `transparent={true}` + TouchableWithoutFeedback untuk dismiss on tap
- Backdrop color: `colors.bgOverlay` (akan ditambahkan ke colors.ts jika belum ada: `rgba(15, 23, 42, 0.85)`)
- Container card: `borderTopLeftRadius: 24`, `borderTopRightRadius: 24`, background `colors.bgCard`
- Handle bar: lebar 40dp, tinggi 4dp, `borderRadius: 2`, warna `colors.textMuted` + opacity 0.5
- Animasi: `Animated.spring()` slide-up dari bawah layar saat `visible=true`; slide-down saat dismiss
- Safe-area: `paddingBottom: Math.max(insets.bottom, spacing.md)` via `useSafeAreaInsets()`
- Dismiss gesture: `PanResponder` deteksi swipe-down (dy > 80 → dismiss)
- Props interface: `visible`, `onClose`, `children`, `title?`

### Task 2: Komponen `ActionMenuItem` Helper (inline di BottomSheetModal.tsx)
Sub-komponen item menu yang dipakai di dalam bottom sheet:
- Icon emoji + label + optional destructive styling
- Touch target 48dp, border-bottom `colors.borderSubtle`
- Props: `icon`, `label`, `onPress`, `destructive?`

### Task 3: Integrasi Action Menu Bottom Sheet di `RecentChatsScreen.tsx`
**File**: `mobile/src/screens/RecentChatsScreen.tsx`

Perubahan pada header:
- Tambah state: `isActionMenuOpen: boolean`
- Tap avatar → buka BottomSheetModal (ganti dari Alert.alert)
- Item menu dalam bottom sheet:
  1. 👥 Buat Grup Baru → memanggil callback ke App.tsx via prop baru `onStartNewGroup?`
  2. 💻 Tautkan Perangkat (QR) → setIsDeviceTransferModalOpen(true)
  3. 👤 Profil & Keamanan E2EE → tampilkan info user
  4. 🔔 Pengaturan Notifikasi → setIsNotificationModalOpen(true)
  5. 🚪 Keluar Akun → konfirmasi via Alert.alert (1 aksi destruktif tetap pakai Alert)
- Hapus handleProfilePress lama
- Pertahankan semua state & modal yang sudah ada

Prop baru di RecentChatsScreenProps:
- `onStartNewGroup?: () => void`

### Task 4: Migrasi `App.tsx` ke `createNativeStackNavigator`
**File**: `mobile/App.tsx`

Stack route definition:
- Home → RecentChatsScreen
- Chat → ChatScreen (animation: slide_from_right, gesture: enabled)
- NewChat → NewChatScreen
- NewGroup → NewGroupScreen
- GroupInfo → GroupInfoScreen

Strategi:
1. Tambah NavigationContainer + enableScreens() dari react-native-screens
2. Definisikan RootStackParamList dengan typed params per route
3. Pertahankan semua provider Context di luar NavigationContainer
4. Pertahankan global modals (IncomingCallModal, ActiveCallOverlay, dll.) di layer atas
5. Pass data antar screen via route.params (menggantikan state + callback prop)
6. Pertahankan BackHandler logic untuk hardware back (Android)

---

## 🗂️ Urutan Pengerjaan (Sequential)

```
[1] Token colors.ts → tambah bgOverlay jika belum ada
[2] BottomSheetModal.tsx (komponen baru)
[3] RecentChatsScreen.tsx (ganti Alert.alert → BottomSheetModal)
[4] App.tsx (migrasi ke native-stack navigator)
[5] Verifikasi: cd mobile && npx tsc --noEmit
```

---

## ✅ Definition of Done

- [ ] BottomSheetModal: slide-up/down animasi mulus, swipe-down & tap backdrop dismiss
- [ ] Menu RecentChatsScreen: 5 item menu berfungsi via bottom sheet
- [ ] App.tsx: NavigationContainer + createNativeStackNavigator aktif
- [ ] Transisi ke ChatScreen: animasi native slide + gesture swipe-back
- [ ] Global modals (WebRTC, SessionAlert, KeyConflict) tetap overlay di layer teratas
- [ ] cd mobile && npx tsc --noEmit → 0 error TypeScript
