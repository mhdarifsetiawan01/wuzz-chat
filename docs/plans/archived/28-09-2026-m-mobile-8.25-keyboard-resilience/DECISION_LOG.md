# Decision Log — M-Mobile-8.22

## DEC-020: Conditional SDK 35+ WindowInsets Listener for Edge-to-Edge IME Resilience
- **Context**: Di Android 15 (API 35) dan Android 16 (API 36), OS memberlakukan Edge-to-Edge secara default, menonaktifkan resizing otomatis pada `adjustResize`. Namun pada Android lama (Android 10/API 29 dan Android 11/API 30), `adjustResize` konvensional bekerja dengan sempurna.
- **Decision**: Menambahkan listener `WindowInsetsCompat.Type.ime()` secara bersyarat hanya jika `Build.VERSION.SDK_INT >= 35`.
- **Rationale**:
  - Untuk Android 15 & 16: Padding bawah root view dinaikkan sebesar tinggi keyboard, mengembalikan fungsionalitas resize window secara native dan 60/120fps.
  - Untuk Android 10 & 11: Tidak ada penambahan padding ganda (*zero double-padding*), mengandalkan window manager bawaan Android lama.

