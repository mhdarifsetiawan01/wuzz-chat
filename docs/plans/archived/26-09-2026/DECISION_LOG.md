# Decision Log — Milestone M-Mobile-8.5

## DEC-015: 30-Digit Safety Number Deterministic Parity
- **Context**: Signal and WhatsApp use cryptographic fingerprinting for users to verify that no man-in-the-middle attack or key swap is occurring. Web frontend uses SHA-256 over `[pubKeyA, pubKeyB].sort().join('::')` broken into 6 blocks of 5 digits.
- **Decision**: Adopt the exact same SHA-256 algorithm and 4-byte chunk extraction in `mobile/src/services/e2eeService.ts` to ensure 100% cross-platform bit parity between Web and Mobile clients.

## DEC-016: Zero-Native-Dependency Pure JS QR Matrix Renderer
- **Context**: Native QR code rendering libraries like `react-native-qrcode-svg` require `react-native-svg` and native iOS/Android pod linking, which can fail or break Expo Go / dev clients.
- **Decision**: Implement a pure JavaScript/TypeScript QR generator module that outputs a 2D boolean matrix (`boolean[][]`), rendered as scalable high-contrast `<View>` rows/blocks. This delivers 100% reliability with zero native linking dependencies.

## DEC-017: WhatsApp Aurora Glassmorphism for Contact Profile
- **Context**: Contact information should feel native, premium, and unified with WuzzChat's design system.
- **Decision**: Implement `ContactInfoModal.tsx` as a sleek modal card with avatar hero, verified badge rosette, quick action pills (call, share, mute), bio card, and dedicated E2EE security container.
