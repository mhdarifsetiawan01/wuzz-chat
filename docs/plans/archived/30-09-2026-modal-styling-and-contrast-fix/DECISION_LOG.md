# Decision Log — Modal Styling Bugfix

## DEC-001: Button Secondary Text Contrast
- **Konteks**: Tombol dengan `variant="secondary"` memiliki background putih (`colors.bgSurface`), namun `getTextColor()` mengembalikan `colors.textOnAccent` (`#ffffff`), menyebabkan teks tidak terbaca (putih di atas putih).
- **Keputusan**: Set `getTextColor()` untuk `variant === 'secondary'` ke `colors.textPrimary` (`#0f172a`), dan sesuaikan spinner loading ke `colors.accentPrimary` agar selalu kontras.

## DEC-002: EditProfileModal Bottom Sheet Flush Alignment
- **Konteks**: Modal Edit Profil mengambang dan memiliki jarak/gap hitam tidak proporsional di atas tab bar Android.
- **Keputusan**: Tambahkan `statusBarTranslucent`, gunakan `KeyboardAvoidingView` sebagai overlay container utama (`flex: 1, justifyContent: 'flex-end'`), tambahkan absolute backdrop `Pressable/TouchableOpacity`, dan sesuaikan `card` dengan `paddingBottom: Math.max(insets.bottom, spacing.lg)` serta `formScroll: { flexShrink: 1 }` agar bottom sheet menempel rapat di tepi bawah layar secara proporsional.
