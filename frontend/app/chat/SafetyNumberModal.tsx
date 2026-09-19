'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { generateSafetyNumber } from '@/lib/crypto/e2ee'
import { getLocalUserKeyPair } from '@/lib/crypto/keyStore'
import { useModalBackHandler } from '@/lib/useModalBackHandler'

interface SafetyNumberModalProps {
  isOpen: boolean
  onClose: () => void
  currentUserId: string
  peerNickname: string
  peerPublicKeyJWK?: string
}

export function SafetyNumberModal({
  isOpen,
  onClose,
  currentUserId,
  peerNickname,
  peerPublicKeyJWK,
}: SafetyNumberModalProps) {
  const [safetyNumber, setSafetyNumber] = useState<string>('Memuat nomor keamanan...')
  const [copied, setCopied] = useState(false)

  // Integrasi back button di HP (Mobile WhatsApp Single-Screen Flow)
  useModalBackHandler(isOpen, onClose)

  useEffect(() => {
    if (!isOpen) return

    let isMounted = true
    async function load() {
      try {
        const myKey = await getLocalUserKeyPair(currentUserId)
        if (!myKey || !peerPublicKeyJWK) {
          if (isMounted) setSafetyNumber('Nomor keamanan belum tersedia untuk kontak ini')
          return
        }

        const num = await generateSafetyNumber(myKey.publicKeyJWK, peerPublicKeyJWK)
        if (isMounted) setSafetyNumber(num)
      } catch (err) {
        if (isMounted) setSafetyNumber('Gagal memuat nomor keamanan')
      }
    }

    load()
    return () => {
      isMounted = false
    }
  }, [isOpen, currentUserId, peerPublicKeyJWK])

  if (!isOpen || typeof document === 'undefined') return null

  const handleCopy = () => {
    navigator.clipboard.writeText(safetyNumber)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return createPortal(
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 'var(--z-modal)' as any,
        padding: 'var(--space-4)',
      }}
    >
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '440px',
          padding: 'var(--space-6)',
          boxShadow: 'var(--shadow-xl)',
          color: 'var(--text-primary)',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: '2.5rem', marginBottom: 'var(--space-3)' }}>🔒</div>

        <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: 'var(--space-2)' }}>
          Verifikasi Kunci Keamanan E2EE
        </h3>

        <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: 'var(--space-4)', lineHeight: 1.5 }}>
          Obrolan dengan <strong style={{ color: 'var(--text-primary)' }}>{peerNickname}</strong> dilindungi oleh enkripsi ujung-ke-ujung (*End-to-End Encryption*). Bandingkan kode 30 digit ini dengan perangkat lawan bicara Anda untuk memastikan keamanan jalur komunikasi.
        </p>

        <div
          style={{
            background: 'var(--bg-primary)',
            padding: 'var(--space-4)',
            borderRadius: '12px',
            border: '1px dashed var(--border-color)',
            fontFamily: 'monospace',
            fontSize: '1.125rem',
            letterSpacing: '2px',
            color: 'var(--color-verified)',
            marginBottom: 'var(--space-5)',
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '8px',
            userSelect: 'all',
          }}
        >
          {safetyNumber.split(' ').map((chunk, idx) => (
            <span key={idx} style={{ padding: '4px 0' }}>
              {chunk}
            </span>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'center' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleCopy}
            style={{ minWidth: '120px' }}
          >
            {copied ? '✅ Disalin' : '📋 Salin Kode'}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onClose}
            style={{ minWidth: '100px' }}
          >
            Tutup
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
