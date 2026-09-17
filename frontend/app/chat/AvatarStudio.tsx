'use client'

import React, { useState, useRef } from 'react'
import { compressAvatarToDataUrl } from '@/lib/imageCompressor'
import { AVATAR_PALETTES } from '@/lib/avatarColor'

export interface AvatarStudioProps {
  currentAvatar: string
  displayName: string
  onSelectAvatar: (avatar: string) => void
  onClose: () => void
}

// 10 Karakter Starter Gratis (Simetris 2 baris x 5 kolom)
export const STARTER_AVATARS = ['💬', '🦊', '🐱', '🐼', '🐯', '🦁', '🚀', '☕', '⚡', '✨']

// Preview Koleksi Premium (Tier Berbayar / Eksklusif Masa Depan)
export const PREMIUM_AVATARS = [
  { emoji: '👑', name: 'Royal Crown' },
  { emoji: '💎', name: 'Diamond Glow' },
  { emoji: '🦄', name: 'Mystic Unicorn' },
  { emoji: '🐉', name: 'Ancient Dragon' },
  { emoji: '🔮', name: 'Crystal Orb' },
  { emoji: '🪐', name: 'Cosmic Ring' },
]

export function AvatarStudio({
  currentAvatar,
  displayName,
  onSelectAvatar,
  onClose,
}: AvatarStudioProps) {
  const [studioTab, setStudioTab] = useState<'free' | 'initials' | 'upload' | 'premium'>('free')
  const [isProcessingImg, setIsProcessingImg] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const initialChar = (displayName || 'User')[0].toUpperCase()

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setUploadError('Harap pilih file gambar (JPG, PNG, WebP)')
      return
    }

    setIsProcessingImg(true)
    setUploadError('')

    try {
      const compressedDataUrl = await compressAvatarToDataUrl(file, 160, 0.85)
      onSelectAvatar(compressedDataUrl)
    } catch (err) {
      console.error('[AvatarStudio] Gagal mengompresi gambar avatar:', err)
      setUploadError('Gagal memproses gambar. Coba gambar lain.')
    } finally {
      setIsProcessingImg(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const isImageAvatar = currentAvatar.startsWith('data:image/') || currentAvatar.startsWith('http')
  const isGradientAvatar = currentAvatar.startsWith('gradient:')

  return (
    <div
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-strong)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-4)',
        boxShadow: '0 12px 36px rgba(0, 0, 0, 0.55), 0 0 20px rgba(59, 130, 246, 0.15)',
        animation: 'fadeIn 0.2s ease',
        marginTop: 'var(--space-3)',
      }}
    >
      {/* Studio Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 'var(--space-3)',
          paddingBottom: 'var(--space-2)',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '1.1rem' }}>🎨</span>
          <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
            Avatar Studio
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            fontSize: '1rem',
            cursor: 'pointer',
            padding: '2px 6px',
            borderRadius: 'var(--radius-sm)',
          }}
          title="Tutup Avatar Studio"
        >
          ✕
        </button>
      </div>

      {/* Segmented Tab Selector */}
      <div
        style={{
          display: 'flex',
          background: 'rgba(15, 23, 42, 0.6)',
          borderRadius: 'var(--radius-md)',
          padding: '3px',
          gap: '2px',
          marginBottom: 'var(--space-4)',
        }}
      >
        <button
          type="button"
          onClick={() => setStudioTab('free')}
          style={{
            flex: 1,
            padding: '6px 4px',
            fontSize: '0.75rem',
            fontWeight: studioTab === 'free' ? 600 : 400,
            borderRadius: 'var(--radius-sm)',
            border: 'none',
            background: studioTab === 'free' ? 'var(--accent-500)' : 'transparent',
            color: studioTab === 'free' ? '#fff' : 'var(--text-secondary)',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          Karakter
        </button>
        <button
          type="button"
          onClick={() => setStudioTab('initials')}
          style={{
            flex: 1,
            padding: '6px 4px',
            fontSize: '0.75rem',
            fontWeight: studioTab === 'initials' ? 600 : 400,
            borderRadius: 'var(--radius-sm)',
            border: 'none',
            background: studioTab === 'initials' ? 'var(--accent-500)' : 'transparent',
            color: studioTab === 'initials' ? '#fff' : 'var(--text-secondary)',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          Inisial
        </button>
        <button
          type="button"
          onClick={() => setStudioTab('upload')}
          style={{
            flex: 1,
            padding: '6px 4px',
            fontSize: '0.75rem',
            fontWeight: studioTab === 'upload' ? 600 : 400,
            borderRadius: 'var(--radius-sm)',
            border: 'none',
            background: studioTab === 'upload' ? 'var(--accent-500)' : 'transparent',
            color: studioTab === 'upload' ? '#fff' : 'var(--text-secondary)',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          Foto Asli
        </button>
        <button
          type="button"
          onClick={() => setStudioTab('premium')}
          style={{
            flex: 1,
            padding: '6px 4px',
            fontSize: '0.75rem',
            fontWeight: studioTab === 'premium' ? 600 : 400,
            borderRadius: 'var(--radius-sm)',
            border: 'none',
            background: studioTab === 'premium' ? 'rgba(244, 114, 182, 0.25)' : 'transparent',
            color: studioTab === 'premium' ? 'var(--accent-tertiary)' : 'var(--text-muted)',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '3px',
          }}
        >
          <span>💎</span> Premium
        </button>
      </div>

      {/* Tab 1: Karakter Starter Gratis */}
      {studioTab === 'free' && (
        <div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '10px',
              fontSize: '0.75rem',
              color: 'var(--text-muted)',
            }}
          >
            <span>Pilih salah satu karakter gratis:</span>
            <span
              style={{
                color: '#34d399',
                background: 'rgba(52, 211, 153, 0.12)',
                padding: '2px 6px',
                borderRadius: 'var(--radius-full)',
                fontWeight: 500,
              }}
            >
              ✓ Free Tier
            </span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(5, 1fr)',
              gap: '10px',
              justifyItems: 'center',
            }}
          >
            {STARTER_AVATARS.map((item) => {
              const isSelected = currentAvatar === item
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => onSelectAvatar(item)}
                  style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '50%',
                    background: isSelected ? 'var(--accent-500)' : 'var(--bg-tertiary)',
                    border: isSelected
                      ? '2.5px solid #93c5fd'
                      : '1px solid var(--border-default)',
                    fontSize: '1.35rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
                    boxShadow: isSelected ? '0 0 14px var(--accent-glow)' : 'none',
                    transform: isSelected ? 'scale(1.08)' : 'scale(1)',
                  }}
                  onMouseOver={(e) => {
                    if (!isSelected) e.currentTarget.style.transform = 'scale(1.08)'
                  }}
                  onMouseOut={(e) => {
                    if (!isSelected) e.currentTarget.style.transform = 'scale(1)'
                  }}
                >
                  {item}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Tab 2: Inisial Gradien Dinamis */}
      {studioTab === 'initials' && (
        <div>
          <div
            style={{
              fontSize: '0.75rem',
              color: 'var(--text-muted)',
              marginBottom: '10px',
            }}
          >
            Pilih palet gradien inisial nama Anda:
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '10px',
              justifyItems: 'center',
            }}
          >
            {AVATAR_PALETTES.map((palette, index) => {
              const gradientKey = `gradient:${index}`
              const isSelected = currentAvatar === gradientKey || (currentAvatar === '' && index === 0)
              return (
                <button
                  key={index}
                  type="button"
                  onClick={() => onSelectAvatar(index === 0 ? '' : gradientKey)}
                  style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '50%',
                    background: palette.background,
                    border: isSelected ? '2.5px solid #ffffff' : '1px solid var(--border-subtle)',
                    color: '#ffffff',
                    fontWeight: 700,
                    fontSize: '1.1rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: isSelected ? '0 0 16px rgba(255, 255, 255, 0.4)' : palette.boxShadow,
                    transform: isSelected ? 'scale(1.1)' : 'scale(1)',
                    transition: 'all 0.15s ease',
                  }}
                  title={`Tema Gradien #${index + 1}`}
                >
                  {initialChar}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Tab 3: Unggah Foto Asli (Custom Photo) */}
      {studioTab === 'upload' && (
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png, image/jpeg, image/webp"
            onChange={handleFileUpload}
            style={{ display: 'none' }}
          />

          <div
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: '2px dashed var(--accent-400)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-4)',
              textAlign: 'center',
              cursor: 'pointer',
              background: 'rgba(59, 130, 246, 0.05)',
              transition: 'all 0.2s ease',
            }}
            onMouseOver={(e) => (e.currentTarget.style.background = 'rgba(59, 130, 246, 0.12)')}
            onMouseOut={(e) => (e.currentTarget.style.background = 'rgba(59, 130, 246, 0.05)')}
          >
            {isProcessingImg ? (
              <div style={{ color: 'var(--accent-300)', fontSize: '0.85rem' }}>
                <div style={{ fontSize: '1.4rem', animation: 'spin 1.2s linear infinite' }}>⏳</div>
                Mengompresi & memotong foto...
              </div>
            ) : isImageAvatar ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={currentAvatar}
                  alt="Custom Avatar"
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '50%',
                    objectFit: 'cover',
                    border: '2px solid var(--accent-400)',
                  }}
                />
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: '0.825rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Foto Terpasang
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--accent-300)' }}>
                    Klik untuk ganti foto baru
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: '1.5rem', marginBottom: '4px' }}>📸</div>
                <div style={{ fontSize: '0.825rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Pilih Foto dari Galeri / Kamera
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Otomatis dipotong 1:1 & dikompresi ke WebP ringan (&lt; 15 KB)
                </div>
              </div>
            )}
          </div>

          {uploadError && (
            <div style={{ fontSize: '0.75rem', color: 'var(--color-error)', marginTop: '6px' }}>
              {uploadError}
            </div>
          )}

          {isImageAvatar && (
            <div style={{ textAlign: 'center', marginTop: '8px' }}>
              <button
                type="button"
                onClick={() => onSelectAvatar('💬')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-error)',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                }}
              >
                Hapus Foto & Gunakan Emoji
              </button>
            </div>
          )}
        </div>
      )}

      {/* Tab 4: Koleksi Premium (Tier Eksklusif Masa Depan) */}
      {studioTab === 'premium' && (
        <div>
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(244, 114, 182, 0.12) 0%, rgba(129, 140, 248, 0.12) 100%)',
              border: '1px solid rgba(244, 114, 182, 0.25)',
              borderRadius: 'var(--radius-md)',
              padding: '10px 12px',
              marginBottom: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
              <span style={{ fontSize: '0.9rem' }}>💎</span>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--accent-tertiary)' }}>
                Koleksi Eksklusif & Berbayar
              </span>
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
              Avatar animasi 3D, badge status eksklusif, dan karakter edisi terbatas akan hadir di pembaruan berikutnya!
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '10px',
            }}
          >
            {PREMIUM_AVATARS.map((item) => (
              <div
                key={item.name}
                style={{
                  background: 'rgba(30, 41, 59, 0.6)',
                  border: '1px dashed rgba(244, 114, 182, 0.3)',
                  borderRadius: 'var(--radius-md)',
                  padding: '8px 4px',
                  textAlign: 'center',
                  position: 'relative',
                  opacity: 0.85,
                }}
              >
                <div style={{ fontSize: '1.5rem', marginBottom: '2px', filter: 'grayscale(20%)' }}>
                  {item.emoji}
                </div>
                <div style={{ fontSize: '0.675rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {item.name}
                </div>
                <div
                  style={{
                    position: 'absolute',
                    top: '3px',
                    right: '3px',
                    fontSize: '0.6rem',
                    background: 'rgba(244, 114, 182, 0.2)',
                    color: 'var(--accent-tertiary)',
                    padding: '1px 4px',
                    borderRadius: '4px',
                    fontWeight: 600,
                  }}
                >
                  🔒 Kunci
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Done Button */}
      <div style={{ marginTop: 'var(--space-4)', textAlign: 'right' }}>
        <button
          type="button"
          onClick={onClose}
          className="btn btn-primary"
          style={{
            fontSize: '0.78rem',
            padding: '4px 14px',
            borderRadius: 'var(--radius-full)',
          }}
        >
          ✓ Selesai Memilih
        </button>
      </div>
    </div>
  )
}
