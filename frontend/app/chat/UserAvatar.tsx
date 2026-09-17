'use client'

import React from 'react'
import { getAvatarStyleWithOverride } from '@/lib/avatarColor'

interface UserAvatarProps {
  avatarUrl?: string
  name?: string
  id?: string
  size?: number
  fontSize?: string | number
  className?: string
  style?: React.CSSProperties
  isOnline?: boolean
  showOnlineRing?: boolean
}

/**
 * Komponen Reusable UserAvatar untuk Wuzz Chat
 * Mendukung:
 * 1. Foto Asli (WebP/JPEG Data URL atau Remote URL)
 * 2. Karakter Emoji Preset ('💬', '🦊', dll.)
 * 3. Inisial Nama Otomatis dengan Palet Gradien Wuzz Chat
 */
export function UserAvatar({
  avatarUrl = '',
  name = 'User',
  id = '',
  size = 40,
  fontSize,
  className = '',
  style = {},
  isOnline,
  showOnlineRing = false,
}: UserAvatarProps) {
  const isImage = avatarUrl.startsWith('data:image/') || avatarUrl.startsWith('http')
  const isGradient = avatarUrl.startsWith('gradient:')
  const isEmoji = !isImage && !isGradient && avatarUrl.trim().length > 0

  const initialChar = (name.trim() || 'U')[0].toUpperCase()
  const avatarStyle = getAvatarStyleWithOverride(name || id, avatarUrl)

  const computedFontSize = fontSize || (size >= 64 ? '2rem' : size >= 48 ? '1.4rem' : size >= 36 ? '1rem' : '0.85rem')

  return (
    <div
      className={`user-avatar-container ${className}`}
      style={{
        position: 'relative',
        width: `${size}px`,
        height: `${size}px`,
        flexShrink: 0,
        ...style,
      }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          borderRadius: '50%',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          userSelect: 'none',
          ...(isImage
            ? {
                background: 'var(--bg-tertiary)',
                border: showOnlineRing ? '2px solid var(--color-online)' : '1.5px solid var(--border-default)',
              }
            : isEmoji
            ? {
                background: 'var(--accent-glow)',
                border: showOnlineRing ? '2px solid var(--color-online)' : '1.5px solid var(--accent-500)',
                fontSize: computedFontSize,
              }
            : {
                background: avatarStyle.background,
                color: avatarStyle.color,
                border: showOnlineRing ? '2px solid var(--color-online)' : avatarStyle.border,
                boxShadow: avatarStyle.boxShadow,
                fontSize: computedFontSize,
                fontWeight: 700,
              }),
        }}
      >
        {isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt={name}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
            }}
          />
        ) : isEmoji ? (
          <span>{avatarUrl}</span>
        ) : (
          <span>{initialChar}</span>
        )}
      </div>

      {isOnline !== undefined && (
        <span
          style={{
            position: 'absolute',
            bottom: size >= 48 ? '2px' : '0px',
            right: size >= 48 ? '2px' : '0px',
            width: size >= 48 ? '12px' : '9px',
            height: size >= 48 ? '12px' : '9px',
            borderRadius: '50%',
            background: isOnline ? 'var(--color-online)' : 'var(--color-offline)',
            border: '2px solid var(--bg-base)',
            boxShadow: isOnline ? '0 0 6px var(--color-online)' : 'none',
          }}
        />
      )}
    </div>
  )
}
