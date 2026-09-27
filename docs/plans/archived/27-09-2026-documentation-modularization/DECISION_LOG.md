# Decision Log: Modularisasi Dokumen Konteks, Progress & Domain Specs

- **DEC-041 (Modular Context Primer Architecture)**:
  - *Context*: `PROMPT.md` awalnya memuat seluruh riwayat fase 1–11 dan detail teknis seluruh domain (web, backend, mobile, crypto, memory, AI). Ini menyebabkan konsumsi context window yang boros dan mempersulit AI untuk langsung fokus pada tugas spesifik.
  - *Decision*: Memecah konteks menjadi domain primers di bawah `docs/context/` (`BACKEND.md`, `FRONTEND.md`, `MOBILE.md`, `MULTI_TENANT.md`, `AI_MEMORY.md`, `ARCHITECTURE.md`), dan menjadikan `PROMPT.md` di root sebagai Master Router yang memetakan jenis tugas ke dokumen konteks target.
  - *Impact*: Peningkatan efisiensi token secara signifikan, kecepatan adaptasi agent terhadap tugas spesifik, dan eliminasi kontaminasi konteks antar-platform.

- **DEC-042 (Dedicated Domain Progress Directory `docs/progress/`)**:
  - *Context*: File `docs/PROGRESS.md` mencapai 336 KB (2.500+ baris), mencampurkan log pengerjaan Go SQL, CSS Next.js, AI worker, dan APK mobile. Setiap pengecekan status tugas di domain tertentu memicu token waste yang masif.
  - *Decision*: Mengadopsi Pilihan A (Folder Khusus `docs/progress/` yang memisahkan riwayat pengerjaan menjadi `BACKEND.md`, `FRONTEND.md`, `MOBILE.md`, `MULTI_TENANT.md`, `AI_MEMORY.md`), dengan `docs/PROGRESS.md` di root tetap sebagai Master Changelog ringkas.
  - *Impact*: Riwayat kemajuan dapat dibaca seketika dan diperbarui secara terisolasi tanpa menyentuh ratusan kilobyte riwayat domain lain.

- **DEC-043 (DDD Bounded Context Specifications Directory `docs/domains/`)**:
  - *Context*: Layer `docs/context/` membagi sistem secara horizontal (layer platform: Backend/Frontend/Mobile). Namun, fitur bisnis seperti Auth, Profil, Messaging, Group/Forum, Media, WebRTC, dan AI Memory adalah domain bisnis vertikal yang memotong seluruh layer (Database, Go Service, REST/WS API, Web UI, Mobile UI).
  - *Decision*: Membuat layer ketiga `docs/domains/` yang berisi 7 Core Business Domains (`AUTH_SESSION`, `PROFILE_IDENTITY`, `MESSAGING_CHAT`, `GROUP_FORUM`, `MEDIA_LIFECYCLE`, `WEBRTC_CALLING`, `AI_MEMORY`) + 2 Platform Domains (`MULTI_TENANT`, `NOTIFICATION_SYNC`). Direktori ini bersifat terbuka (*open for extension*), memungkinkan pemekaran atau penambahan domain baru di masa depan secara independen.
  - *Impact*: Aturan bisnis, model entitas DDD, kontrak API, dan perilaku klien untuk setiap fitur terdokumentasi dalam satu tempat yang definitif (*Single Source of Truth* per fitur).
