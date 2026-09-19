import React from 'react'

interface VerifiedBadgeProps {
  size?: number
  className?: string
  style?: React.CSSProperties
  title?: string
  showLabel?: boolean
}

/**
 * Komponen Vektor SVG Verified Badge (Centang Biru Rosette / Starburst)
 * Standar Telegram / Instagram / Twitter dengan aksen Electric Neon Cyan & Soft Azure khas Wuzz Chat.
 */
export function VerifiedBadge({
  size = 16,
  className = '',
  style = {},
  title = 'Akun Terverifikasi Wuzz',
  showLabel = false,
}: VerifiedBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        verticalAlign: 'middle',
        flexShrink: 0,
        ...style,
      }}
      title={title}
      aria-label={title}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{
          filter: 'drop-shadow(0 1px 3px rgba(59, 130, 246, 0.45))',
          overflow: 'visible',
        }}
      >
        <defs>
          <linearGradient id="wuzzVerifiedGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#00f2fe" />
            <stop offset="100%" stopColor="#3b82f6" />
          </linearGradient>
        </defs>

        {/* 12-point smooth scalloped badge rosette */}
        <path
          d="M22.5 12.5c0-1.58-.875-2.95-2.148-3.6.438-1.54-.043-3.23-1.258-4.22-1.215-.99-2.906-1.12-4.246-.33A4.246 4.246 0 0012 2.5c-1.117 0-2.14.44-2.848 1.15-1.34-.79-3.03-.66-4.246.33-1.215.99-1.696 2.68-1.258 4.22C2.375 8.85 1.5 10.22 1.5 12.5s.875 3.65 2.148 4.3c-.438 1.54.043 3.23 1.258 4.22 1.215.99 2.906 1.12 4.246.33.708.71 1.731 1.15 2.848 1.15 1.117 0 2.14-.44 2.848-1.15 1.34.79 3.03.66 4.246-.33 1.215-.99 1.696-2.68 1.258-4.22 1.273-.65 2.148-2.02 2.148-4.3z"
          fill="url(#wuzzVerifiedGrad)"
        />

        {/* Crisp Pure White Checkmark */}
        <path
          d="M7.8 12.2l2.9 3 6.1-6.4"
          stroke="var(--text-on-accent)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      {showLabel && (
        <span
          style={{
            fontSize: '0.75rem',
            fontWeight: 600,
            color: 'var(--color-verified)',
            letterSpacing: '0.01em',
            marginLeft: '2px',
          }}
        >
          Terverifikasi
        </span>
      )}
    </span>
  )
}
