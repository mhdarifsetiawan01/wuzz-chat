# Implementation Plan: Redesain UI Wuzz Chat — Soft Tri-Color Glassmorphism

- **Objective**: Transformasi UI Wuzz Chat menuju gaya **Soft Glassmorphism** dengan palet 3 warna harmonis (Soft Blue Primer, Soft Lavender Violet Sekunder, Soft Coral Rose Tersier), ambient glowing orbs di background, dan panel frosted glass transparan.
- **Target Files**:
  - `frontend/app/globals.css` (Token CSS, ambient background orbs, glass surface classes, glass bubbles, floating input bar).
  - `frontend/app/chat/Sidebar.tsx` (Glass card items, search bar, unread badge coral).
  - `frontend/app/chat/ChatArea.tsx` (Glass header, soft blue-to-violet bubble chat, floating glass input dock).
- **Architecture**:
  - Dual-Platform (Desktop 2-Kolom & Mobile WhatsApp Single-Screen Flow).
  - GPU-accelerated `-webkit-backdrop-filter` & `backdrop-filter: blur(16px)`.
  - WCAG AAA/AA contrast ratio.
- **Verification Strategy**:
  - Visual check Desktop & Mobile flow.
  - `npm run build` zero-error gate.
