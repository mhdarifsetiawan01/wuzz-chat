# Implementation Summary — Mobile Notification Icon, Decrypt & Anti-Loop Sync

## Executive Summary
1. **Small Notification Icon Android**: Diganti dari default Expo ke siluet resmi WuzzChat transparan dengan aksen biru brand `#0462E8`.
2. **Instant Decryption on Notification Tap**: Selesai diatasi dengan memperbaiki parsing `dm_` multi-tenant (`extractDMPeerId`) dan menyertakan `peer_id` & `peer_public_key` pada `targetConv`.
3. **Anti-Loop Return-to-Home (DEC-018)**: Selesai diatasi dengan memasang guard `handledResponseIdentifiers` Set di `notificationService.ts` dan mendecouple state `conversations` dari dependency array effect notifikasi di `App.tsx`.

## Rincian Perubahan:
1. **Notification Icon & Theme Color**:
   - `mobile/assets/notification-icon.png` (512x512 RGBA) & 5 drawable native Android di-generate.
   - `mobile/app.json`, `colors.xml`, `notificationService.ts`, dan `notificationBackgroundTask.ts` diselaraskan ke `#0462E8`.
2. **Multi-Tenant DM Room ID Parser (`extractDMPeerId`)**:
   - Helper `extractDMPeerId` di `mobile/src/services/crypto.ts` untuk mem-parse `dm_<tenant>_<userA>_<userB>`, mengabaikan prefix tenant (`default`), dan selalu mengambil user ID lawan bicara yang benar.
   - Mengintegrasikan `extractDMPeerId` pada `ChatScreen.tsx`, `MessageContext.tsx`, dan `ConversationContext.tsx`.
3. **Enriched Notification Tap Navigation & Anti-Loop Guard**:
   - `extractTargetRoom` menyertakan `senderPublicKey`.
   - `handleTargetNavigation` mencari room di cache `conversations` atau membawa `peer_id` & `peer_public_key`.
   - `handledResponseIdentifiers` Set di `notificationService.ts` memastikan setiap event respons notifikasi hanya dieksekusi 1 kali seumur sesi, mencegah auto-redirect berulang kali saat tombol Back ditekan.
   - `App.tsx` menggunakan `conversationsRef` dan `userRef` agar `useEffect` notifikasi tidak re-trigger saat daftar chat di-refresh.
