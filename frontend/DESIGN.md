# DESIGN.md — Wuzz Chat Design System

> Dokumen ini adalah **single source of truth** untuk design system frontend Wuzz Chat.
> Dibuat via Batch #7 (design-system-capture). Perbarui setiap kali token atau komponen primitif berubah.

---

## 1. Token Palette (`app/globals.css` `:root`)

### 1.1 Background & Surface
| Token | Value | Usage |
|---|---|---|
| `--bg-base` | `#090d16` | Root background |
| `--bg-surface` | `rgba(15,23,42,0.72)` | Card / panel surface |
| `--bg-elevated` | `rgba(30,41,59,0.65)` | Elevated card / modal |
| `--bg-overlay` | `rgba(15,23,42,0.85)` | Blocking overlay |
| `--bg-secondary` | `rgba(15,23,42,0.65)` | Secondary surface |
| `--bg-tertiary` | `rgba(30,41,59,0.6)` | Tertiary surface |
| `--bg-input` | `rgba(15,23,42,0.6)` | Input field background |
| `--bg-surface-hover` | `rgba(30,41,59,0.8)` | Surface hover state |

### 1.2 Border & Glass
| Token | Value | Usage |
|---|---|---|
| `--border-subtle` | `rgba(255,255,255,0.07)` | Very subtle divider |
| `--border-default` | `rgba(255,255,255,0.12)` | Default border |
| `--border-strong` | `rgba(147,197,253,0.25)` | Accent-tinted border |
| `--border-focus` | `rgba(59,130,246,0.5)` | Focus ring on inputs |
| `--glass-border` | `1px solid rgba(255,255,255,0.09)` | Glass panel border |
| `--glass-blur` | `16px` | Backdrop-filter blur |

### 1.3 Text
| Token | Value | Usage |
|---|---|---|
| `--text-primary` | `#f8fafc` | Primary text |
| `--text-secondary` | `#94a3b8` | Secondary text |
| `--text-muted` | `#64748b` | Muted/placeholder text |
| `--text-inverse` | `#090d16` | Dark text (on light bg) |
| `--text-on-accent` | `#ffffff` | White text/icon on accent fill/gradient |

### 1.4 Status & Semantic Colors
| Token | Value | Role | A11y Note |
|---|---|---|---|
| `--color-online` | `#34d399` | Presence indicator | Supplemented by icon |
| `--color-error` | `#f87171` | **Error text/icon** on dark bg | ~4.5:1 on `--bg-base` |
| `--color-warning` | `#fbbf24` | Warning text/icon | — |
| `--color-success` | `#10b981` | Success fill & affirmative actions | — |
| `--color-danger` | `#ef4444` | **Destructive action fill** | Pair with `--text-on-accent` |
| `--color-danger-strong` | `#dc2626` | Danger hover/press variant | — |
| `--color-verified` | `#38bdf8` | Verified badge & security icon | — |
| `--color-cyan-neon` | `#00f2fe` | Electric neon (receipt glow) | Decorative |

### 1.5 Tint Tokens
Never use raw `rgba()` in feature code — use these tokens:

| Token | Value |
|---|---|
| `--tint-accent-05/08/10/12/15/20/25/30/35/40` | `rgba(59,130,246, ...)` |
| `--tint-error-08/10/15/25/30` | `rgba(239,68,68, ...)` |

### 1.6 WhatsApp-web Palette (Documented Exception)
Only for link-preview & expired-media cards: `--wa-bg-dark`, `--wa-bg-elevated`, `--wa-text-primary`, `--wa-text-muted`, `--wa-border`

---

## 2. Spacing, Radius, Shadow, Transitions

**Spacing:** `--space-1` (4px) … `--space-12` (48px)

**Radius:** `--radius-sm` (8px) / `--radius-md` (12px) / `--radius-lg` (16px) / `--radius-xl` (24px) / `--radius-full` (9999px)

**Shadow:** `--shadow-sm` / `--shadow-md` / `--shadow-lg` / `--shadow-glow`

**Transitions:** `--transition-fast` (120ms) / `--transition-base` (200ms) / `--transition-normal` (200ms alias) / `--transition-slow` (350ms)

---

## 3. Z-Index Scale
**Always use tokens. Never use raw numbers.**

| Token | Value | Usage |
|---|---|---|
| `--z-base` | `1` | Base stacking |
| `--z-dropdown` | `100` | Dropdown menus |
| `--z-sticky` | `110` | Sticky headers |
| `--z-overlay` | `120` | Nested overlays |
| `--z-modal` | `1100` | Modal/drawer backdrop |
| `--z-modal-top` | `1200` | Top-priority modal |
| `--z-toast` | `1300` | Toast notifications |
| `--z-critical` | `1400` | Max z-index (replaces `99999`) |

CSS helpers: `.z-modal`, `.z-modal-top`, `.z-dropdown`, `.z-overlay`, `.z-critical`

---

## 4. Typography Scale

Font: `--font-sans: 'Inter', system-ui, -apple-system, sans-serif`

| Utility Class | Value |
|---|---|
| `.u-text-xs` | `0.75rem` |
| `.u-text-sm` | `0.85rem` |
| `.u-text-base` | `0.9rem` |
| `.u-text-md` | `1rem` |
| `.u-text-lg` | `1.1rem` |
| `.u-text-xl` | `1.25rem` |

Font weight: `.u-fw-500` / `.u-fw-600` / `.u-fw-700`

---

## 5. Unified Modal Primitive (Batch #5)

Use for **all** modals and drawers. Do not create new backdrop families.

```
.modal-overlay            — Fixed backdrop z=var(--z-modal)
.modal-overlay.drawer     — Right-aligned drawer
.modal-card-unified       — Glass card (max-width 480px, max-height 90vh)
.modal-card-unified.drawer-card  — Full-height drawer
.modal-card-unified.modal-wide   — 640px wide modal
.modal-header-unified     — Header with title + close button
.modal-close-btn          — Standard ✕ button
.modal-body-unified       — Scrollable body
.modal-footer-unified     — Action buttons footer
.modal-danger-zone        — Red-tinted danger section
.modal-confirm-overlay    — Nested confirm dialog overlay
.modal-confirm-card       — Confirm dialog card
```

---

## 6. Utility Classes (Batch #4)

**Layout:** `.u-flex`, `.u-flex-col`, `.u-flex-center`, `.u-flex-between`, `.u-flex-wrap`, `.u-flex-1`, `.u-flex-shrink-0`, `.u-min-w-0`

**Gap:** `.u-gap-1` … `.u-gap-6`

**Text color:** `.u-text-primary/secondary/muted/accent/verified/error/success/warning/on-accent`

**Tint containers:** `.u-bg-accent-tint`, `.u-bg-error-tint`

**Ghost button:** `.btn-ghost` + `.text-muted/.text-accent/.text-danger/.text-error`

**Other:** `.u-text-center`, `.u-uppercase`, `.u-truncate`, `.u-cursor-pointer`, `.u-scroll-y`, `.u-leading-snug`, `.u-w-full`, `.u-w-auto`

---

## 7. Documented Exceptions (Approved Raw Values)

| Location | Raw Value | Reason |
|---|---|---|
| `lib/avatarColor.ts` | Multiple hex | Avatar palette module (setara token file) |
| `MessageBubble.tsx:SENDER_COLORS` | JS array hex | Runtime sender color constant |
| `app/layout.tsx:themeColor` | `'#090d16'` | HTML meta viewport (var() not applicable) |
| SVG `stopColor` attributes | hex | SVG attributes don't support `var()` |
| `border-radius: 50%` | `50%` | Circle idiom |

---

## 8. Prevention Checklist (Code Review Gate)

- [ ] No raw hex outside `:root` or documented exceptions
- [ ] No raw `rgba()` — use `--tint-*` tokens
- [ ] No raw zIndex numbers — use `--z-*` tokens
- [ ] No new modal/backdrop CSS families — use `.modal-overlay` + `.modal-card-unified`
- [ ] Inline styles must be **truly runtime-dynamic** (static values → CSS class)
- [ ] New color added → update `:root` AND update this DESIGN.md

---

*Last updated: 2026-09-19 — Design Debt Batch #3, #4, #5, #7*
