/**
 * Utility Modular Generator Warna & Gradien Avatar Kontak
 * Menghasilkan warna soft/pastel berkelas yang deterministik berdasarkan nama/ID
 */

export interface AvatarColorStyle {
  background: string
  color: string
  border: string
  boxShadow: string
}

const AVATAR_PALETTES: AvatarColorStyle[] = [
  // 1. Soft Azure / Sky
  {
    background: 'linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%)',
    color: '#ffffff',
    border: '1.5px solid rgba(147, 197, 253, 0.4)',
    boxShadow: '0 2px 8px rgba(59, 130, 246, 0.3)',
  },
  // 2. Soft Lavender / Violet
  {
    background: 'linear-gradient(135deg, #818cf8 0%, #a78bfa 100%)',
    color: '#ffffff',
    border: '1.5px solid rgba(196, 181, 253, 0.4)',
    boxShadow: '0 2px 8px rgba(129, 140, 248, 0.3)',
  },
  // 3. Soft Rose / Coral
  {
    background: 'linear-gradient(135deg, #f472b6 0%, #fb7185 100%)',
    color: '#ffffff',
    border: '1.5px solid rgba(254, 205, 211, 0.4)',
    boxShadow: '0 2px 8px rgba(244, 114, 182, 0.3)',
  },
  // 4. Soft Mint / Jade
  {
    background: 'linear-gradient(135deg, #10b981 0%, #34d399 100%)',
    color: '#ffffff',
    border: '1.5px solid rgba(167, 243, 208, 0.4)',
    boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)',
  },
  // 5. Soft Sunset / Amber
  {
    background: 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)',
    color: '#ffffff',
    border: '1.5px solid rgba(253, 230, 138, 0.4)',
    boxShadow: '0 2px 8px rgba(245, 158, 11, 0.3)',
  },
  // 6. Soft Teal / Cyan
  {
    background: 'linear-gradient(135deg, #06b6d4 0%, #38bdf8 100%)',
    color: '#ffffff',
    border: '1.5px solid rgba(186, 230, 253, 0.4)',
    boxShadow: '0 2px 8px rgba(6, 182, 212, 0.3)',
  },
  // 7. Soft Orchid / Fuchsia
  {
    background: 'linear-gradient(135deg, #c084fc 0%, #e879f9 100%)',
    color: '#ffffff',
    border: '1.5px solid rgba(245, 208, 254, 0.4)',
    boxShadow: '0 2px 8px rgba(192, 132, 252, 0.3)',
  },
  // 8. Soft Indigo / Deep Blue
  {
    background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
    color: '#ffffff',
    border: '1.5px solid rgba(199, 210, 254, 0.4)',
    boxShadow: '0 2px 8px rgba(79, 70, 229, 0.3)',
  },
]

/**
 * Menghasilkan gaya avatar dinamis yang konsisten untuk sebuah nama atau user ID
 */
export function getAvatarStyle(nameOrId: string = ''): AvatarColorStyle {
  if (!nameOrId || !nameOrId.trim()) {
    return AVATAR_PALETTES[0]
  }

  let hash = 0
  const clean = nameOrId.trim().toLowerCase()
  for (let i = 0; i < clean.length; i++) {
    hash = (hash << 5) - hash + clean.charCodeAt(i)
    hash |= 0
  }

  const index = Math.abs(hash) % AVATAR_PALETTES.length
  return AVATAR_PALETTES[index]
}
