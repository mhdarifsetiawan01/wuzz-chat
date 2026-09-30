/**
 * WuzzChat Mobile Theme - Colors
 * Single Source of Truth: frontend/DESIGN.md & app/globals.css
 */

export const colors = {
  // Background & Surface (Clean Soft-Blue Modern - Image Reference)
  bgBase: '#f4f7fb',          // Soft Ice-Blue clean canvas
  bgSurface: '#ffffff',       // Pure clean white cards & list rows
  bgSurfaceHover: '#edf2f7',  // Pressed row state
  bgElevated: '#ffffff',      // Header, modals, floating tab bar
  bgOverlay: 'rgba(15, 23, 42, 0.45)',
  bgCard: '#ffffff',          // Pure white card surfaces
  bgCardSolid: '#ffffff',
  bgInput: '#eef2f6',         // Soft pill input background
  bgInputFocused: '#e2e8f0',

  // Border & Dividers
  borderSubtle: '#f1f5f9',    // Ultra-subtle hairline dividers
  borderDefault: '#e2e8f0',   // Clean separator line
  borderStrong: '#cbd5e1',
  borderFocus: '#30AFFF',

  // Text Hierarchy
  textPrimary: '#0f172a',     // Deep Slate Black (crisp typography)
  textSecondary: '#64748b',   // Muted Slate (message snippet, timestamps)
  textMuted: '#94a3b8',       // Section labels, placeholders
  textInverse: '#ffffff',
  textOnAccent: '#ffffff',

  // Accent & Tints (Wuzz Soft Azure / Cobalt - #30AFFF)
  accentPrimary: '#30AFFF',   // Vibrant Identity Blue (#30AFFF)
  accentHover: '#169de8',
  tintAccent10: 'rgba(48, 175, 255, 0.08)',
  tintAccent20: 'rgba(48, 175, 255, 0.16)',
  tintAccent30: 'rgba(48, 175, 255, 0.24)',
  tintError10: 'rgba(239, 68, 68, 0.08)',
  tintError20: 'rgba(239, 68, 68, 0.16)',
  tintSuccess10: 'rgba(16, 185, 129, 0.08)',
  tintWarning10: 'rgba(245, 158, 11, 0.08)',

  // Status & Semantic
  colorOnline: '#10b981',     // Vibrant Emerald green dot
  colorError: '#ef4444',
  colorWarning: '#f59e0b',
  colorSuccess: '#10b981',
  colorDanger: '#ef4444',
  colorVerified: '#30AFFF',
  colorCyanNeon: '#0ea5e9',

  // Compatibility & Key Accents
  monoAmber: '#f59e0b',
  monoAmberDark: '#d97706',
  monoIceCyan: '#0ea5e9',
  monoSteelBlue: '#e2e8f0',

  // Unread badge on avatar (Vibrant Soft-Blue / Violet badge)
  unreadBadgeBg: '#30AFFF',
  unreadBadgeText: '#ffffff',
} as const;

export type ColorTokens = typeof colors;
