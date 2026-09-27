# Decision Log: Pembuatan mobile/DESIGN.md

- **DEC-044 (Canonical Mobile Design System Specification)**:
  - *Context*: Klien mobile (`mobile/`) dibangun dengan React Native dan memiliki kebutuhan teknis UI/UX yang berbeda signifikan dari Web (StyleSheet JS objek vs CSS, unit dp vs px/rem, Safe Area insets, touch target min 44dp, swipe gesture, dan virtual keyboard handling). Sebelumnya belum ada `mobile/DESIGN.md`.
  - *Decision*: Menyusun dokumen kanonikal `mobile/DESIGN.md` yang memuat seluruh katalog token warna, tipografi, spacing, radius, elevasi bayangan, aturan touch target WCAG, keyboard avoidance pattern, dan spesifikasi komponen primitif native.
  - *Impact*: Memberikan Single Source of Truth yang definitif bagi perancangan dan modifikasi UI/UX mobile, mencegah inkonsistensi styling, dan menjamin standar estetika WhatsApp Aurora Dark Mode tetap terjaga konsisten di Android dan iOS.
