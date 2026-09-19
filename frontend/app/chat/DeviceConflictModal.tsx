'use client'

import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useModalBackHandler } from '@/lib/useModalBackHandler'
import { DeviceTransferModal } from './DeviceTransferModal'

interface DeviceConflictModalProps {
  isOpen: boolean
  isRotated?: boolean
  keyVersion?: number
  currentUserId?: string
  onClose: () => void
  onConfirmReset: () => Promise<void>
  onLogout: () => void
  onTransferSuccess?: () => void
}

export function DeviceConflictModal({
  isOpen,
  isRotated,
  keyVersion = 1,
  currentUserId = '',
  onClose,
  onConfirmReset,
  onLogout,
  onTransferSuccess,
}: DeviceConflictModalProps) {
  const [isResetting, setIsResetting] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [isTransferOpen, setIsTransferOpen] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const isTransferOpenRef = useRef(isTransferOpen)
  isTransferOpenRef.current = isTransferOpen

  const handleLogoutAction = async () => {
    if (isLoggingOut || isResetting) return
    setIsLoggingOut(true)
    setErrorMsg('')
    try {
      await onLogout()
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal memproses logout')
      setIsLoggingOut(false)
    }
  }

  // Menangani tombol back di browser HP:
  // Jika transfer modal sedang terbuka, tutup transfer modal dulu.
  // Jika sudah di modal konflik, baru lakukan logout.
  useModalBackHandler(isOpen, () => {
    if (isTransferOpenRef.current) {
      setIsTransferOpen(false)
    } else {
      handleLogoutAction()
    }
  }, 'device_conflict')

  if (!isOpen || typeof document === 'undefined') return null

  const handleReset = async () => {
    if (isResetting || isLoggingOut) return
    setIsResetting(true)
    setErrorMsg('')
    try {
      await onConfirmReset()
      onClose()
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal mereset kunci keamanan')
      setIsResetting(false)
    }
  }

  return createPortal(
    <>
      <div
        className="modal-backdrop"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.85)',
          backdropFilter: 'blur(10px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 'var(--z-modal)' as any,
          padding: 'var(--space-4)',
        }}
      >
        <div
          className="modal-card"
          onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-overlay)',
          backdropFilter: 'var(--glass-blur)',
          WebkitBackdropFilter: 'var(--glass-blur)',
          border: '1px solid var(--border-default)',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '460px',
          padding: 'var(--space-6)',
          boxShadow: '0 25px 50px rgba(0,0,0,0.7), 0 0 30px rgba(59, 130, 246, 0.1)',
          color: 'var(--text-primary)',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: '3rem', marginBottom: 'var(--space-3)' }}>
          {isRotated ? '⚠️' : '🔐'}
        </div>

        <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: 'var(--space-2)' }}>
          {isRotated ? 'Kunci Keamanan Telah Diperbarui' : 'Perangkat Lain Sedang Aktif'}
        </h3>

        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: 'var(--space-4)', lineHeight: 1.6 }}>
          {isRotated ? (
            <>
              Kunci enkripsi akun Anda telah di-reset dari perangkat lain (Versi {keyVersion}). Sesi keamanan di perangkat ini telah dinonaktifkan demi melindungi integritas pesan End-to-End Encryption Anda.
            </>
          ) : (
            <>
              Akun Anda saat ini memiliki sesi enkripsi aktif di perangkat lain. Demi keamanan <em>End-to-End Encryption (E2EE)</em>, Wuzz Chat membatasi 1 perangkat aktif per akun.
            </>
          )}
        </p>

        {!isRotated && (
          <div
            style={{
              background: 'var(--tint-error-08)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              borderRadius: '10px',
              padding: 'var(--space-3)',
              marginBottom: 'var(--space-5)',
              fontSize: '0.825rem',
              color: 'var(--color-error)',
              textAlign: 'left',
              lineHeight: 1.5,
            }}
          >
            ℹ️ <strong>Perhatian:</strong> Mengaktifkan obrolan di perangkat ini akan mereset kunci keamanan ke Versi {keyVersion + 1}. Perangkat Anda sebelumnya tidak akan dapat mendekripsi pesan baru.
          </div>
        )}

        {errorMsg && (
          <div style={{ color: 'var(--color-error)', fontSize: '0.85rem', marginBottom: 'var(--space-3)' }}>
            {errorMsg}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {isRotated ? (
            <>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setIsTransferOpen(true)}
                style={{
                  width: '100%',
                  padding: '12px',
                  fontSize: '0.95rem',
                  background: 'var(--accent-gradient)',
                  color: 'var(--text-on-accent)',
                  border: 'none',
                  fontWeight: 600,
                  boxShadow: '0 4px 14px rgba(59, 130, 246, 0.35)',
                }}
              >
                📲 Ambil Alih Sesi Kembali ke Perangkat Ini via QR
              </button>

              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleLogoutAction}
                disabled={isLoggingOut || isResetting}
                style={{ width: '100%', padding: '10px', fontSize: '0.9rem', opacity: isLoggingOut ? 0.7 : 1 }}
              >
                {isLoggingOut ? '⏳ Memproses Keluar...' : '🔄 Atau Keluar & Masuk Ulang Akun'}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleReset}
                disabled={isResetting || isLoggingOut}
                style={{ width: '100%', padding: '12px', fontSize: '0.95rem' }}
              >
                {isResetting ? '⏳ Mengaktifkan Perangkat...' : '🔑 Reset & Masuk di Perangkat Ini'}
              </button>

              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setIsTransferOpen(true)}
                disabled={isResetting || isLoggingOut}
                style={{
                  width: '100%',
                  padding: '10px',
                  fontSize: '0.9rem',
                  background: 'var(--tint-accent-10)',
                  color: 'var(--accent-300)',
                  border: '1px solid rgba(59, 130, 246, 0.3)',
                }}
              >
                📲 Pindah Kunci via QR Code / Kode
              </button>

              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleLogoutAction}
                disabled={isResetting || isLoggingOut}
                style={{ width: '100%', padding: '10px', fontSize: '0.9rem', opacity: isLoggingOut ? 0.7 : 1 }}
              >
                {isLoggingOut ? '⏳ Memproses Keluar...' : 'Batalkan & Keluar'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>

    {/* Device Transfer Modal (Scan/Input Mode untuk Perangkat Baru) - Dipisah ke level root agar tidak terganggu stacking context flex backdrop parent */}
      <DeviceTransferModal
        isOpen={isTransferOpen}
        initialMode="scan"
        hideGenerate={true}
        currentUserId={currentUserId}
        disableBackHandler={true}
        onClose={() => setIsTransferOpen(false)}
        onTransferSuccess={() => {
          setIsTransferOpen(false)
          onClose()
          if (onTransferSuccess) {
            onTransferSuccess()
          } else {
            window.location.reload()
          }
        }}
      />
    </>,
    document.body
  )
}
