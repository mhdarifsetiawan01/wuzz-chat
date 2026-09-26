/**
 * WuzzChat Mobile Theme - Colors
 * Single Source of Truth: frontend/DESIGN.md & app/globals.css
 */

export const colors = {
  // Background & Surface
  bgBase: '#090d16',
  bgSurface: 'rgba(15, 23, 42, 0.72)',
  bgSurfaceHover: 'rgba(30, 41, 59, 0.8)',
  bgElevated: 'rgba(30, 41, 59, 0.65)',
  bgOverlay: 'rgba(15, 23, 42, 0.85)',
  bgCard: 'rgba(30, 41, 59, 0.95)',
  bgCardSolid: '#1e293b',
  bgInput: 'rgba(15, 23, 42, 0.6)',
  bgInputFocused: 'rgba(15, 23, 42, 0.85)',

  // Border & Glass
  borderSubtle: 'rgba(255, 255, 255, 0.07)',
  borderDefault: 'rgba(255, 255, 255, 0.12)',
  borderStrong: 'rgba(147, 197, 253, 0.25)',
  borderFocus: 'rgba(59, 130, 246, 0.5)',

  // Text
  textPrimary: '#f8fafc',
  textSecondary: '#94a3b8',
  textMuted: '#64748b',
  textInverse: '#090d16',
  textOnAccent: '#ffffff',

  // Accent & Tints
  accentPrimary: '#3b82f6',
  accentHover: '#2563eb',
  tintAccent10: 'rgba(59, 130, 246, 0.10)',
  tintAccent20: 'rgba(59, 130, 246, 0.20)',
  tintAccent30: 'rgba(59, 130, 246, 0.30)',
  tintError10: 'rgba(239, 68, 68, 0.10)',
  tintError20: 'rgba(239, 68, 68, 0.20)',
  tintSuccess10: 'rgba(16, 185, 129, 0.10)',
  tintWarning10: 'rgba(251, 191, 36, 0.10)',

  // Status & Semantic
  colorOnline: '#34d399',
  colorError: '#f87171',
  colorWarning: '#fbbf24',
  colorSuccess: '#10b981',
  colorDanger: '#ef4444',
  colorVerified: '#38bdf8',
  colorCyanNeon: '#00f2fe',

  // Unread badge & notifications
  unreadBadgeBg: '#2563eb',
  unreadBadgeText: '#ffffff',
} as const;

export type ColorTokens = typeof colors;
