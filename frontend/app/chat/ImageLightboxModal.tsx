'use client'

import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

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

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (isOpen) {
      setScale(1)
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          onClose()
        }
      }
      window.addEventListener('keydown', handleKeyDown)
      return () => window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

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
      onClick={onClose}
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
          <button
            type="button"
            className="lightbox-btn lightbox-close-btn"
            onClick={onClose}
            title="Tutup (Esc)"
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
            onClose()
          }
        }}
      >
        <img
          src={imageUrl}
          alt={fileName || 'Pratinjau Gambar'}
          className="lightbox-image"
          style={{
            transform: `scale(${scale})`,
            transition: 'transform 0.15s ease-out',
          }}
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    </div>,
    document.body
  )
}
