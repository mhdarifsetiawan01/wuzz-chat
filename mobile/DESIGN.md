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
| **Background** | `colors.bgBase` | `#090d16` | Background kanvas utama aplikasi |
| | `colors.bgSurface` | `rgba(15, 23, 42, 0.72)` | Panel permukaan transparan & header |
| | `colors.bgElevated` | `rgba(30, 41, 59, 0.65)` | Kartu item daftar obrolan & input bar |
| | `colors.bgCard` | `rgba(30, 41, 59, 0.95)` | Modal card & bottom sheet surface |
| | `colors.bgCardSolid` | `#1e293b` | Surface solid tanpa transparansi |
| | `colors.bgInput` | `rgba(15, 23, 42, 0.60)` | Input field & search bar |
| **Border** | `colors.borderSubtle` | `rgba(255, 255, 255, 0.07)` | Pemisah baris list obrolan & divider |
| | `colors.borderDefault` | `rgba(255, 255, 255, 0.12)` | Border kontainer kartu standar |
| | `colors.borderStrong` | `rgba(147, 197, 253, 0.25)` | Highlight border aktif / specular edge |
| | `colors.borderFocus` | `rgba(59, 130, 246, 0.50)` | Border input saat state focused |
| **Teks** | `colors.textPrimary` | `#f8fafc` | Teks utama, judul, dan isi pesan |
| | `colors.textSecondary` | `#94a3b8` | Teks sekunder, cuplikan chat, timestamp |
| | `colors.textMuted` | `#64748b` | Label non-aktif dan placeholder |
| | `colors.textOnAccent` | `#ffffff` | Teks di atas tombol aksen biru |
| **Aksen** | `colors.accentPrimary` | `#3b82f6` | Tombol utama, bubble pesan keluar, FAB |
| | `colors.accentHover` | `#2563eb` | State ditekan (active/pressed) |
| | `colors.tintAccent10` | `rgba(59, 130, 246, 0.10)` | Background chip, tag, & quote preview |
| | `colors.tintAccent20` | `rgba(59, 130, 246, 0.20)` | Highlight seleksi & badge |
| **Status** | `colors.colorOnline` | `#34d399` | Dot indikator pengguna online |
| | `colors.colorCyanNeon` | `#00f2fe` | Tanda terima centang biru neon (`✓✓`) |
| | `colors.colorVerified` | `#38bdf8` | Centang biru akun terverifikasi |
| | `colors.colorError` | `#f87171` | Status error, tombol batal/tolak |
| | `colors.colorWarning` | `#fbbf24` | Peringatan E2EE & status kedaluwarsa |
| | `colors.unreadBadgeBg`| `#2563eb` | Badge hitungan pesan belum dibaca |

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

## ⌨️ 5. Resiliensi Virtual Keyboard (*Keyboard Avoiding*)

Agar input bar obrolan dan form login tidak tertutup oleh keyboard virtual Android atau iOS:

1. **Formula Baku di `ChatScreen.tsx`**:
   ```tsx
   <KeyboardAvoidingView
     style={{ flex: 1 }}
     behavior={Platform.OS === 'ios' ? 'padding' : undefined}
     keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
   >
     {/* Timeline Obrolan & ChatInputBar */}
   </KeyboardAvoidingView>
   ```
2. **Android Window Soft Input Mode**:
   - Pada `app.json`, pastikan konfigurasi Android menggunakan:
     `"softwareKeyboardLayoutMode": "resize"`
   - Ini memastikan sistem operasi me-resize window secara natural tanpa memerlukan offset manual yang kaku.

---

## 🧩 6. Pola Komponen Primitif Mobile

### A. Bubble Chat (`MessageBubble.tsx`)
- **Pesan Keluar (*Outgoing / Self*)**:
  - Background: `colors.accentPrimary` (`#3b82f6`).
  - Alignment: Kanan (`alignSelf: 'flex-end'`).
  - Radius: `borderTopLeftRadius: 16`, `borderTopRightRadius: 4`, `borderBottomLeftRadius: 16`, `borderBottomRightRadius: 16`.
- **Pesan Masuk (*Incoming / Peer*)**:
  - Background: `colors.bgElevated` (`rgba(30, 41, 59, 0.85)`).
  - Alignment: Kiri (`alignSelf: 'flex-start'`).
  - Radius: `borderTopLeftRadius: 4`, `borderTopRightRadius: 16`, `borderBottomLeftRadius: 16`, `borderBottomRightRadius: 16`.
  - Dilengkapi mini avatar pengirim deterministik (26dp) pada obrolan grup.
- **Tanda Terima Neon Cyan**:
  - Centang ganda (`✓✓`) berwarna `colors.colorCyanNeon` (`#00f2fe`) dengan sudut paralel 45° standar WhatsApp.

### B. Chat Input Bar (`ChatInputBar.tsx`)
- Kapsul pil presisi dengan `borderRadius: radius.xl` (24dp), tinggi fleksibel (min 48dp).
- Background: `colors.bgInput` ber-border halus `colors.borderDefault`.
- Tombol aksi mengambang melingkar (*circular floating buttons*): Tombol klip attachment (📎), mikrofon voice note (🎙️), dan tombol kirim (➤).

### C. Voice Note Player
- Visualizer waveform 24-bar vertikal dengan scrubber progress pendar neon.
- Tombol toggle kecepatan putar dinamis: `1x`, `1.5x`, `2x`.

### D. Bottom Sheet & Modal Dialog
- Menggunakan backdrop gelap semi-transparan `colors.bgOverlay` (`rgba(15, 23, 42, 0.85)`).
- Card container ber-radius atas `borderTopLeftRadius: radius.xl`, `borderTopRightRadius: radius.xl` dengan handle bar abu-abu di bagian atas tengah (lebar 40dp, tinggi 4dp).
