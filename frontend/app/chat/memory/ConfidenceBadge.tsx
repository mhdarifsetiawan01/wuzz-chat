'use client'

import React from 'react'
import { MemoryConfidence } from '@/lib/types'

interface ConfidenceBadgeProps {
  confidence: MemoryConfidence
  showLabel?: boolean
}

export function ConfidenceBadge({ confidence, showLabel = true }: ConfidenceBadgeProps) {
  switch (confidence) {
    case 'HIGH':
      return (
        <span
          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium"
          style={{
            backgroundColor: 'rgba(16, 185, 129, 0.15)',
            color: 'var(--color-success)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
          }}
          title="Tingkat keyakinan tinggi: Terdapat bukti eksplisit dalam pesan forum."
        >
          <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: 'var(--color-success)' }} />
          {showLabel && <span>Keyakinan Tinggi</span>}
        </span>
      )
    case 'MEDIUM':
      return (
        <span
          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium"
          style={{
            backgroundColor: 'rgba(251, 191, 36, 0.15)',
            color: 'var(--color-warning)',
            border: '1px solid rgba(251, 191, 36, 0.3)',
          }}
          title="Tingkat keyakinan sedang: Terimplikasi kuat namun disarankan diverifikasi."
        >
          <span
            className="w-2 h-2 rounded-full inline-block"
            style={{
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
          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium"
          style={{
            backgroundColor: 'rgba(239, 68, 68, 0.15)',
            color: 'var(--color-danger)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
          }}
          title="Tingkat keyakinan rendah: Harap periksa dan sunting dengan teliti."
        >
          <span
            className="w-2 h-2 rounded-full inline-block border"
            style={{ borderColor: 'var(--color-danger)', backgroundColor: 'transparent' }}
          />
          {showLabel && <span>Perlu Verifikasi Teliti</span>}
        </span>
      )
  }
}
