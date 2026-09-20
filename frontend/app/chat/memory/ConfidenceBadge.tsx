'use client'

import React from 'react'
import { MemoryConfidence } from '@/lib/types'

interface ConfidenceBadgeProps {
  confidence: MemoryConfidence
  showLabel?: boolean
}

export function ConfidenceBadge({ confidence, showLabel = true }: ConfidenceBadgeProps) {
  const containerBase: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '3px 9px',
    borderRadius: '9999px',
    fontSize: '0.72rem',
    fontWeight: 600,
    lineHeight: 1.2,
    flexShrink: 0,
  }

  const dotBase: React.CSSProperties = {
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    display: 'inline-block',
    flexShrink: 0,
  }

  switch (confidence) {
    case 'HIGH':
      return (
        <span
          style={{
            ...containerBase,
            backgroundColor: 'rgba(16, 185, 129, 0.15)',
            color: 'var(--color-success)',
            border: '1px solid rgba(16, 185, 129, 0.35)',
          }}
          title="Tingkat keyakinan tinggi: Terdapat bukti eksplisit dalam pesan forum."
        >
          <span style={{ ...dotBase, backgroundColor: 'var(--color-success)' }} />
          {showLabel && <span>Keyakinan Tinggi</span>}
        </span>
      )
    case 'MEDIUM':
      return (
        <span
          style={{
            ...containerBase,
            backgroundColor: 'rgba(251, 191, 36, 0.15)',
            color: 'var(--color-warning)',
            border: '1px solid rgba(251, 191, 36, 0.35)',
          }}
          title="Tingkat keyakinan sedang: Terimplikasi kuat namun disarankan diverifikasi."
        >
          <span
            style={{
              ...dotBase,
              background: 'linear-gradient(90deg, var(--color-warning) 50%, transparent 50%)',
              border: '1px solid var(--color-warning)',
            }}
          />
          {showLabel && <span>Keyakinan Sedang</span>}
        </span>
      )
    case 'LOW':
    default:
      return (
        <span
          style={{
            ...containerBase,
            backgroundColor: 'rgba(239, 68, 68, 0.15)',
            color: 'var(--color-danger)',
            border: '1px solid rgba(239, 68, 68, 0.35)',
          }}
          title="Tingkat keyakinan rendah: Harap periksa dan sunting dengan teliti."
        >
          <span
            style={{
              ...dotBase,
              border: '1px solid var(--color-danger)',
              backgroundColor: 'transparent',
            }}
          />
          {showLabel && <span>Perlu Verifikasi Teliti</span>}
        </span>
      )
  }
}
