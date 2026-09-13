'use client'

import React, { useState, useEffect } from 'react'
import type { LinkPreview } from '@/lib/types'
import { fetchLinkPreview } from '@/lib/api'

interface LinkPreviewCardProps {
  url: string
}

export function LinkPreviewCard({ url }: LinkPreviewCardProps) {
  const [preview, setPreview] = useState<LinkPreview | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [imgError, setImgError] = useState<boolean>(false)

  useEffect(() => {
    let isMounted = true
    setLoading(true)

    fetchLinkPreview(url)
      .then((data) => {
        if (isMounted && data) {
          setPreview(data)
        }
      })
      .catch(() => {
        // Silent catch: if link preview fails, card simply won't render
      })
      .finally(() => {
        if (isMounted) setLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [url])

  if (loading) {
    return (
      <div className="link-preview-skeleton" aria-hidden="true">
        <div className="link-preview-skeleton-img" />
        <div className="link-preview-skeleton-content">
          <div className="link-preview-skeleton-title" />
          <div className="link-preview-skeleton-desc" />
        </div>
      </div>
    )
  }

  if (!preview || !preview.title) {
    return null
  }

  // Ambil nama host untuk fallback site_name
  let hostname = preview.site_name
  if (!hostname) {
    try {
      hostname = new URL(url).hostname.replace(/^www\./, '')
    } catch {
      hostname = url
    }
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="link-preview-card"
      title={`Buka ${url}`}
    >
      {preview.image && !imgError && (
        <div className="link-preview-image-wrap">
          <img
            src={preview.image}
            alt={preview.title}
            className="link-preview-image"
            onError={() => setImgError(true)}
            loading="lazy"
          />
        </div>
      )}
      <div className="link-preview-content">
        <div className="link-preview-header">
          {preview.favicon && (
            <img
              src={preview.favicon}
              alt=""
              className="link-preview-favicon"
              onError={(e) => {
                ;(e.target as HTMLElement).style.display = 'none'
              }}
            />
          )}
          <span className="link-preview-site">{hostname}</span>
        </div>
        <h4 className="link-preview-title">{preview.title}</h4>
        {preview.description && (
          <p className="link-preview-description">{preview.description}</p>
        )}
      </div>
    </a>
  )
}
