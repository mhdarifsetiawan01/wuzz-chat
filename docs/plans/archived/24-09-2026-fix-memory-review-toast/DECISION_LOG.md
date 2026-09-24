# Decision Log — Active

### DEC-030: Centralized In-App Toast Architecture & Safe Header Offset
- **Context**: Admin/creator yang mereview dan meng-approve memori AI menemui bug floating pill toast yang tidak hilang selamanya, transparan karena ketiadaan token `--bg-card`, dan bertumpuk di atas header chat di mobile & laptop.
- **Decision**:
  1. Menambahkan token `--bg-card: rgba(30, 41, 59, 0.95);` di `:root` CSS variables sebagai safety surface token.
  2. Mengganti raw inline style toast dengan utility class `.in-app-toast-banner` yang diposisikan di bawah header (`top: calc(56px + env(safe-area-inset-top, 0px) + 12px)`), memiliki opaque frosted glass backdrop, border specular, enter animation, dan auto-dismiss via `showInAppToast(msg, duration, icon)`.
  3. Memungkinkan interaksi pengguna (tap/click untuk dismiss seketika).
- **Consequences**: Layout mobile maupun desktop tetap bersih, header tidak pernah tertutup, dan notifikasi berumur terkontrol (3.5–5s) tanpa memory leak.

