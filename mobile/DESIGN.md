# 🎨 Standar Sistem Desain Mobile (React Native) — Wuzz Chat

Dokumen ini adalah **Single Source of Truth (SSOT)** sistem desain antarmuka pengguna (UI/UX) untuk aplikasi mobile **Wuzz Chat** (`mobile/`). Seluruh komponen React Native, layar (*screens*), modal, dan styling wajib mematuhi panduan dan token di dalam dokumen ini.

---

## 🌌 1. Filosofi & Tema Visual: *Aurora Glassmorphic Dark Mode*

Aplikasi mobile Wuzz Chat mengadopsi estetika **Aurora Dark Mode** berstandar industri (sekelas WhatsApp & Telegram) dengan ciri khas:
- **Latar Belakang Gelap Pekat (*Deep Obsidian Slate*)**: Menghemat daya baterai layar OLED/AMOLED dan ramah di mata (`#090d16`).
- **Surface Transparan & Glassmorphic**: Latar kartu dan header menggunakan transparansi bertingkat (`rgba(...)`) dengan specular border tipis untuk memberikan efek kedalaman (*depth*).
- **Aksen Lembut & Pendar Neon**: Perpaduan Soft Azure (`#3b82f6`), Electric Neon Cyan (`#00f2fe`), dan Soft Emerald (`#10b981`) untuk status interaktif dan tanda terima pesan.

---

## 🎨 2. Katalog Token Desain (`mobile/src/theme/`)

Seluruh styling di React Native **WAJIB** mengimpor token dari `@/theme` (`mobile/src/theme/index.ts`). **DILARANG** menuliskan raw hex code atau magic numbers secara sembarangan di dalam file komponen.

### A. Palet Warna (`colors.ts`)

| Kategori Token | Nama Token | Nilai Warna | Kegunaan |
|---|---|---|---|
| **Background** | `colors.bgBase` | `#f4f7fb` | Kanvas utama aplikasi (Soft Ice-Blue clean canvas) |
| | `colors.bgSurface` | `#ffffff` | Kartu putih bersih, list obrolan & header |
| | `colors.bgSurfaceHover` | `#edf2f7` | State baris saat ditekan (pressed) |
| | `colors.bgElevated` | `#ffffff` | Header, floating tab bar & elevated cards |
| | `colors.bgCard` | `#ffffff` | Modal card & bottom sheet surface |
| | `colors.bgCardSolid` | `#ffffff` | Surface solid kartu dialog |
| | `colors.bgInput` | `#eef2f6` | Input field & pill search bar |
| | `colors.bgInputFocused` | `#e2e8f0` | Input field saat aktif / focused |
| | `colors.bgOverlay` | `rgba(15, 23, 42, 0.45)` | Backdrop modal gelap transparan |
| **Border** | `colors.borderSubtle` | `#f1f5f9` | Garis pemisah ultra-halus (hairline divider) |
| | `colors.borderDefault` | `#e2e8f0` | Border pemisah kartu standar |
| | `colors.borderStrong` | `#cbd5e1` | Highlight border aktif |
| | `colors.borderFocus` | `#30AFFF` | Border input saat state focused |
| **Teks** | `colors.textPrimary` | `#0f172a` | Teks utama, judul, label field & isi pesan (Deep Slate) |
| | `colors.textSecondary` | `#64748b` | Teks sekunder, cuplikan chat, timestamp (Muted Slate) |
| | `colors.textMuted` | `#94a3b8` | Label non-aktif dan placeholder |
| | `colors.textOnAccent` | `#ffffff` | Teks di atas tombol aksen biru atau badge |
| **Aksen** | `colors.accentPrimary` | `#30AFFF` | Tombol utama, bubble pesan keluar, FAB (#30AFFF) |
| | `colors.accentHover` | `#169de8` | State tombol utama saat ditekan |
| | `colors.tintAccent10` | `rgba(48, 175, 255, 0.08)` | Background chip, tag, & quote preview |
| | `colors.tintAccent20` | `rgba(48, 175, 255, 0.16)` | Highlight seleksi, active tab & badge |
| **Status** | `colors.colorOnline` | `#10b981` | Dot indikator pengguna online (Emerald) |
| | `colors.colorCyanNeon` | `#0ea5e9` | Tanda terima centang biru (`✓✓`) |
| | `colors.colorVerified` | `#30AFFF` | Centang biru akun terverifikasi |
| | `colors.colorError` / `colorDanger` | `#ef4444` | Status error, tombol bahaya/hapus |
| | `colors.colorWarning` | `#f59e0b` | Peringatan E2EE & status kedaluwarsa |
| | `colors.unreadBadgeBg` | `#30AFFF` | Badge hitungan pesan belum dibaca |
| | `colors.unreadBadgeText` | `#ffffff` | Teks badge hitungan pesan |

---

### B. Spacing & Radius (`spacing.ts`)

```typescript
export const spacing = {
  xs: 4,     // Micro padding, icon gap
  sm: 8,     // Gap standar antar-elemen kecil
  md: 12,    // Padding internal kartu/bubble pesan
  lg: 16,    // Margin layar & horizontal content padding
  xl: 20,    // Spacing antar-seksi
  xxl: 24,   // Padding modal & form
  xxxl: 32,  // Header offset
  huge: 48,  // Minimal FAB height
} as const;

export const radius = {
  xs: 4,     // Tag & chip kecil
  sm: 8,     // Thumbnail & card border
  md: 12,    // Input box & card rounded
  lg: 16,    // Bubble pesan & modal card
  xl: 24,    // Capsule pil chat input bar & bottom sheet top corners
  full: 9999,// Avatar circular, FAB, & status dot
} as const;
```

---

### C. Elevasi & Bayangan Seluler (`shadows`)

Pada React Native, bayangan wajib mendukung **iOS Shadow Properties** dan **Android `elevation`**:

```typescript
export const shadows = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4, // Android elevation
  },
  modal: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10, // Android elevation
  },
};
```

---

## 📱 3. Kaidah Layout & Navigasi: *WhatsApp Single-Screen Flow*

Aplikasi mobile mengadopsi pola layar tunggal bergantian penuh standar WhatsApp:

```text
┌──────────────────────────────┐          ┌──────────────────────────────┐
│  LAYAR 1: HomeScreen         │          │  LAYAR 2: ChatScreen         │
├──────────────────────────────┤  Buka    ├──────────────────────────────┤
│ • Status Bar & Brand Header  │ ───────> │ • Sticky Header + ← Back     │
│ • Search Bar (Debounced)     │  Obrolan │ • Linimasa Obrolan (E2EE)    │
│ • Filter Tabs (Semua, Grup)  │ <─────── │ • Staged Quote/Media Banner  │
│ • Daftar Percakapan          │  Tombol  │ • ChatInputBar (Mic / Send)  │
│ • Floating Action Button (+) │  ← Back  │ • Audio Waveform Player      │
└──────────────────────────────┘          └──────────────────────────────┘
```

1. **Transisi Bersih (*Clean History Sync*)**:
   - Berpindah dari Home ke Chat: State `messages` di-reset dan diisi dari server/IndexedDB secara instan.
   - Kembali ke Home via tombol `← Back` atau Hardware Back: `activeRoomId` di-set menjadi `''`.
2. **Hardware BackHandler Guard**:
   - Selalu pasang listener `BackHandler.addEventListener('hardwareBackPress', ...)` di level modal dan ChatScreen.
   - Urutan prioritas penutupan saat tombol Back ditekan:
     `Modal / Lightbox Terbuka ➔ Tutup Modal`  
     `Di dalam ChatScreen ➔ Kembali ke HomeScreen`  
     `Di dalam HomeScreen ➔ Keluar dari Aplikasi / Minimize`
3. **Safe Area Insets Hierarchy**:
   - Selalu bungkus root dengan `SafeAreaProvider`.
   - Gunakan `useSafeAreaInsets()` untuk menyuntikkan padding dinamis:
     - Header: `paddingTop: insets.top`
     - Bottom Input Bar / FAB: `paddingBottom: Math.max(insets.bottom, spacing.md)`

---

## 👆 4. Standar Sentuhan & Interaksi (*Touch & Gestures*)

1. **Target Sentuh Minimum (*Minimum Touch Target*)**:
   - Sesuai standar WCAG 2.1 AA dan Apple/Google HIG, setiap tombol aksi, avatar interaktif, dan icon sentuh **WAJIB memiliki area sentuh minimal 44 × 44 dp**.
   - Jika icon visual berukuran 20–24 dp, bungkus dengan container `TouchableOpacity` / `Pressable` ber-padding minimal atau berikan properti `hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}`.
2. **Gesture Interaktif**:
   - **Swipe-to-Reply**: Menggeser bubble pesan ke arah kanan untuk memunculkan banner kutipan pesan (*quote reply*).
   - **Long Press**: Menekan bubble pesan selama 500ms memunculkan panel reaksi emoji dan opsi (Balas, Salin, Teruskan, Hapus).
   - **Haptic Feedback**: Berikan getaran halus saat perekaman suara dimulai atau saat panggilan terhubung.

---

## ⌨️ 5. Resiliensi Virtual Keyboard & Window Soft Input Mode (*Keyboard Handling SOP*)

Untuk memastikan konsistensi tampilan di seluruh versi sistem operasi (**Android 11 lama hingga Android 16+ modern dengan edge-to-edge enforcement**, serta iOS), wajib mematuhi 4 pilar arsitektur keyboard berikut:

### A. Aturan Isolasi Header Layar Penuh (*Sticky Header Outside KAV*)
- **HEADER LAYAR WAJIB DITEMPATKAN DI LUAR `KeyboardAvoidingView`**.
- `KeyboardAvoidingView` **HANYA** membungkus area konten dinamis/scrollable (`FlatList`/`ScrollView`) dan input bar di bawah.
- ❌ **Anti-Pattern**: Meletakkan `<View style={styles.header}>` di dalam `<KeyboardAvoidingView>`.
  - *Dampak*: Pada Android versi lama (Android 11/12), saat keyboard virtual terbuka, header terdorong naik keluar dari layar sehingga tombol kembali dan informasi kontak lenyap.
- ✅ **Pola Struktur Hirarki yang Benar (`ChatScreen.tsx`)**:
  ```tsx
  <View style={[styles.root, { paddingTop: insets.top }]}>
    {/* 1. Header Tetap Diam (Sticky) di Atas */}
    <View style={styles.header}>
      <TouchableOpacity onPress={onBack}><Text>←</Text></TouchableOpacity>
      <Text>{title}</Text>
    </View>

    {/* 2. KAV Hanya Menangani Konten Linimasa + Input */}
    <KeyboardAvoidingView
      style={styles.keyboardContainer}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <FlatList data={messages} ... />
      <ChatInputBar ... />
    </KeyboardAvoidingView>
  </View>
  ```

### B. Aturan Modal Dialog & Bottom Sheet (`<Modal>`)

Komponen `<Modal>` di React Native berjalan pada sub-window native tersendiri. Agar tampilan modal konsisten di seluruh perangkat Android (Android 11 hingga Android 16+ dengan *enforced edge-to-edge*) dan iOS, wajib mematuhi arsitektur baku berikut:

#### 1. Bottom Sheet Modal (Mepet Bawah / Flush Alignment)
Bottom Sheet (`EditProfileModal`, `CreatePostModal`, `PostCommentsModal`, `CreateSubGroupModal`, `BottomSheetModal`) **WAJIB menempel rapat di tepi bawah layar fisik HP (`bottom: 0`)**.
- ❌ **DILARANG KERAS**: Membiarkan kartu bottom sheet melayang (*floating*) atau menyisakan celah/gap hitam di atas navigation bar / tab bar.
- ✅ **3 Syarat Mutlak Bottom Sheet React Native**:
  1. `<Modal>` **WAJIB** menyertakan properti `statusBarTranslucent={true}` agar sub-window dialog Android merender penuh *edge-to-edge* melewati window insets sistem.
  2. `KeyboardAvoidingView` **WAJIB** menjadi container overlay terluar dengan `style={{ flex: 1, justifyContent: 'flex-end' }}`.
  3. Kontainer kartu modal (`styles.card`) **WAJIB** memiliki padding bawah dinamis: `paddingBottom: Math.max(insets.bottom, spacing.lg)` agar tombol aksi (Batal & Simpan) berada aman di atas gesture navigation bar Android / home indicator iOS tanpa terpotong, namun latar belakang kartu tetap menempel sempurna ke dasar layar.
  4. Kontainer form yang dapat di-scroll (`formScroll`) **WAJIB** menggunakan `flexShrink: 1` dengan `showsVerticalScrollIndicator={false}`. **DILARANG** menggunakan fixed `maxHeight` (seperti 460) yang memotong input secara kaku.

✅ **Formula Baku Bottom Sheet Modal**:
```tsx
<Modal
  visible={visible}
  animationType="slide"
  transparent
  statusBarTranslucent
  onRequestClose={onClose}
>
  <KeyboardAvoidingView
    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    style={styles.overlay}
  >
    <TouchableOpacity
      style={styles.backdrop}
      activeOpacity={1}
      onPress={onClose}
    />
    <View
      style={[
        styles.card,
        { paddingBottom: Math.max(insets.bottom, spacing.lg) },
      ]}
    >
      {/* Header, Scrollable Body (flexShrink: 1), Footer Actions */}
    </View>
  </KeyboardAvoidingView>
</Modal>
```

#### 2. Center Dialog Modal (Popup Peringatan & Konfirmasi)
Digunakan untuk dialog peringatan terpusat di tengah layar (`KeyConflictModal`, `DeviceLimitModal`, `SessionAlertModal`):
- `styles.overlay`: `{ flex: 1, backgroundColor: colors.bgOverlay, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.xl }`.
- `styles.card`: `{ width: '100%', maxWidth: 420, maxHeight: '85%', backgroundColor: colors.bgCardSolid, borderRadius: radius.xl, padding: spacing.xxl }`.

### C. Konfigurasi Android Soft Input Mode (`adjustResize`)
- File `mobile/android/app/src/main/AndroidManifest.xml` pada tag `<activity android:name=".MainActivity">` **WAJIB** dikunci menggunakan:
  ```xml
  android:windowSoftInputMode="adjustResize"
  ```
- **STRICT PROHIBITION**: DILARANG menggunakan `adjustPan`. `adjustPan` hanya menggeser titik fokus tanpa mengubah ukuran window aplikasi, menyebabkan desinkronisasi insets antara Android lama dan baru.
- Pada `mobile/app.json`:
  ```json
  "android": {
    "softwareKeyboardLayoutMode": "resize"
  }
  ```

---

## 🎨 6. Standar Baku Kontras Warna Teks & Tombol (*Button & Contrast Rules*)

Untuk mencegah teks tidak terbaca (*white-on-white* atau warna sama dengan tombol), seluruh komponen tombol wajib mematuhi standar rasio kontras WCAG 2.1 AA (minimal 4.5:1 untuk teks biasa, 3:1 untuk tombol dengan teks tebal/bold):

### A. Panduan Varian Tombol (`Button.tsx`)

| Varian Tombol | Background Normal | Border | Warna Teks | Warna Spinner Loading | Kegunaan |
|---|---|---|---|---|---|
| `primary` | `colors.accentPrimary` (`#30AFFF`) | Tidak ada | `colors.textOnAccent` (`#ffffff`) | `colors.textOnAccent` (`#ffffff`) | Aksi utama (Simpan, Kirim, Masuk) |
| `secondary` | `colors.bgSurface` (`#ffffff`) | `1px colors.borderDefault` | **`colors.textPrimary` (`#0f172a`)** | `colors.accentPrimary` (`#30AFFF`) | Aksi sekunder (Batal, Tutup, Reset) |
| `danger` | `colors.colorDanger` (`#ef4444`) | Tidak ada | `colors.textOnAccent` (`#ffffff`) | `colors.textOnAccent` (`#ffffff`) | Aksi destruktif (Hapus, Keluar) |
| `ghost` | `'transparent'` | Tidak ada | `colors.accentPrimary` (`#30AFFF`) | `colors.accentPrimary` (`#30AFFF`) | Tautan teks / tombol tanpa border |
| `disabled` | `colors.bgInput` (`#eef2f6`) | Opsional | `colors.textMuted` (`#94a3b8`) | — | State non-aktif / tidak dapat diklik |

### B. Aturan Ketat Pencegahan Bug Kontras Warna:
1. **DILARANG KERAS** menggunakan `colors.textOnAccent` (putih) pada tombol berlatar terang (`colors.bgSurface`, `colors.bgCard`, `colors.bgElevated`, atau transparan). Tombol berlatar terang **WAJIB** menggunakan `colors.textPrimary` (`#0f172a`) atau `colors.textSecondary` (`#64748b`).
2. **Indikator Loading Spinner (`ActivityIndicator`)**:
   - Tombol gelap/berwarna (`primary`, `danger`): gunakan spinner putih (`#ffffff`).
   - Tombol terang (`secondary`, `ghost`): gunakan spinner biru aksen (`colors.accentPrimary`).
3. **State Loading Tombol Primer**:
   - Saat `isLoading={true}`, background tombol primer **DILARANG** berubah menjadi putih/pucat yang menyamarkan spinner putih. Background harus tetap `colors.accentPrimary` dengan `activeOpacity`.

---

## 🧩 7. Pola Komponen Primitif Mobile

### A. Bubble Chat (`MessageBubble.tsx`)
- **Pesan Keluar (*Outgoing / Self*)**:
  - Background: `colors.accentPrimary` (`#30AFFF`).
  - Alignment: Kanan (`alignSelf: 'flex-end'`).
  - Radius: `borderTopLeftRadius: 16`, `borderTopRightRadius: 4`, `borderBottomLeftRadius: 16`, `borderBottomRightRadius: 16`.
- **Pesan Masuk (*Incoming / Peer*)**:
  - Background: `colors.bgSurface` (`#ffffff`).
  - Alignment: Kiri (`alignSelf: 'flex-start'`).
  - Radius: `borderTopLeftRadius: 4`, `borderTopRightRadius: 16`, `borderBottomLeftRadius: 16`, `borderBottomRightRadius: 16`.
  - Dilengkapi mini avatar pengirim deterministik (26dp) pada obrolan grup.
- **Tanda Terima Neon Cyan**:
  - Centang ganda (`✓✓`) berwarna `colors.colorCyanNeon` (`#0ea5e9`) dengan sudut paralel 45° standar WhatsApp.

### B. Chat Input Bar (`ChatInputBar.tsx`)
- Kapsul pil presisi dengan `borderRadius: radius.xl` (24dp), tinggi fleksibel (min 48dp).
- Background: `colors.bgInput` ber-border halus `colors.borderDefault`.
- Tombol aksi mengambang melingkar (*circular floating buttons*): Tombol klip attachment (📎), mikrofon voice note (🎙️), dan tombol kirim (➤).

### C. Voice Note Player
- Visualizer waveform 24-bar vertikal dengan scrubber progress pendar neon.
- Tombol toggle kecepatan putar dinamis: `1x`, `1.5x`, `2x`.

