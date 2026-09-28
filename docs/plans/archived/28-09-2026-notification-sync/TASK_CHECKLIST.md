# Task Checklist — Mobile Notification Icon, Brand Color & Instant Decrypt Sync

- [x] 1. Generate `mobile/assets/notification-icon.png` (512x512, white silhouette with transparent background).
- [x] 2. Update `mobile/app.json` with new icon path and color `#0462E8`.
- [x] 3. Generate native Android notification icons in `drawable-mdpi`, `hdpi`, `xhdpi`, `xxhdpi`, `xxxhdpi`.
- [x] 4. Update `mobile/android/app/src/main/res/values/colors.xml` (`notification_icon_color` -> `#0462E8`).
- [x] 5. Update `notificationService.ts` and `notificationBackgroundTask.ts` (`lightColor` and `color` -> `#0462E8`).
- [x] 6. Add `extractDMPeerId` utility in `crypto.ts` supporting multi-tenant DM room IDs (`dm_<tenant>_<userA>_<userB>`).
- [x] 7. Update `ChatScreen.tsx`, `MessageContext.tsx`, and `ConversationContext.tsx` to use `extractDMPeerId`.
- [x] 8. Update `extractTargetRoom` in `notificationService.ts` to extract `senderPublicKey`.
- [x] 9. Enrich `handleTargetNavigation` in `App.tsx` with existing conversation lookup and peer crypto parameters.
- [x] 10. Verification: inspect generated PNGs, run `npx tsc --noEmit`, `npm run build`, `go test ./...`.
