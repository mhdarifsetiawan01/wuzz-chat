'use client'

import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useModalBackHandler } from '@/lib/useModalBackHandler'

interface ImageLightboxModalProps {
  isOpen: boolean
  imageUrl: string
  fileName?: string
  onClose: () => void
}

export const ImageLightboxModal: React.FC<ImageLightboxModalProps> = ({
  isOpen,
  imageUrl,
  fileName,
  onClose,
}) => {
  const [mounted, setMounted] = useState(false)
  const [scale, setScale] = useState(1)
  const [imageError, setImageError] = useState(false)

  const handleClose = useModalBackHandler(isOpen, onClose, 'image_lightbox')

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (isOpen) {
      setScale(1)
      setImageError(false)
    }
  }, [isOpen, imageUrl])

  if (!mounted || !isOpen || !imageUrl) return null

  const handleZoomIn = (e: React.MouseEvent) => {
    e.stopPropagation()
    setScale((prev) => Math.min(prev + 0.25, 3.0))
  }

  const handleZoomOut = (e: React.MouseEvent) => {
    e.stopPropagation()
    setScale((prev) => Math.max(prev - 0.25, 0.5))
  }

  const handleResetZoom = (e: React.MouseEvent) => {
    e.stopPropagation()
    setScale(1)
  }

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation()
    const link = document.createElement('a')
    link.href = imageUrl
    link.download = fileName || 'image.png'
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return createPortal(
    <div
      className="lightbox-overlay"
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-label="Image Preview Lightbox"
    >
      {/* Top Action Bar */}
      <div className="lightbox-header" onClick={(e) => e.stopPropagation()}>
        <div className="lightbox-title" title={fileName || 'Gambar'}>
          {fileName || 'Pratinjau Gambar'}
        </div>
        <div className="lightbox-controls">
          {!imageError && (
            <>
              <button
                type="button"
                className="lightbox-btn"
                onClick={handleZoomOut}
                title="Zoom Out (-)"
                disabled={scale <= 0.5}
              >
                🔍−
              </button>
              <button
                type="button"
                className="lightbox-btn"
                onClick={handleResetZoom}
                title="Reset Zoom (100%)"
              >
                {Math.round(scale * 100)}%
              </button>
              <button
                type="button"
                className="lightbox-btn"
                onClick={handleZoomIn}
                title="Zoom In (+)"
                disabled={scale >= 3.0}
              >
                🔍+
              </button>
              <button
                type="button"
                className="lightbox-btn"
                onClick={handleDownload}
                title="Download Gambar"
              >
                ⬇ Unduh
              </button>
            </>
          )}
          <button
            type="button"
            className="lightbox-btn lightbox-close-btn"
            onClick={handleClose}
            title="Tutup (Esc / Back)"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Image Content Area */}
      <div
        className="lightbox-body"
        onClick={(e) => {
          // Hanya tutup jika klik area kosong di luar gambar
          if (e.target === e.currentTarget) {
            handleClose()
          }
        }}
      >
        {imageError ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--wa-text-muted)',
              textAlign: 'center',
              padding: '2rem',
              maxWidth: '400px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <span style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</span>
            <h3 style={{ color: 'var(--wa-text-primary)', marginBottom: '0.5rem', fontSize: '1.1rem' }}>
              Gagal Memuat Pratinjau Gambar
            </h3>
            <p style={{ fontSize: '0.875rem', lineHeight: '1.5', marginBottom: '1.5rem' }}>
              Gambar mungkin sudah kedaluwarsa di server atau terjadi gangguan pada cache browser.
            </p>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleClose}
              style={{ fontSize: '0.875rem', padding: '8px 20px' }}
            >
              Tutup Pratinjau
            </button>
          </div>
        ) : (
          <img
            src={imageUrl}
            alt={fileName || 'Pratinjau Gambar'}
            className="lightbox-image"
            style={{
              transform: `scale(${scale})`,
              transition: 'transform 0.15s ease-out',
            }}
            onClick={(e) => e.stopPropagation()}
            onError={() => setImageError(true)}
          />
        )}
      </div>
    </div>,
    document.body
  )
}

