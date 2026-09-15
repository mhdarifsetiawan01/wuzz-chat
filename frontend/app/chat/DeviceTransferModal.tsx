'use client'

import { useState, useEffect, useRef } from 'react'
import QRCode from 'qrcode'
import { useModalBackHandler } from '@/lib/useModalBackHandler'
import { getLocalUserKeyPair } from '@/lib/crypto/keyStore'
import { exportPrivateKeyJWK } from '@/lib/crypto/e2ee'
import {
  generateTransferSessionToken,
  encryptKeyBundleForTransfer,
  uploadTransferSession,
  consumeAndImportTransfer,
} from '@/lib/crypto/keyTransfer'

interface DeviceTransferModalProps {
  isOpen: boolean
  initialMode?: 'generate' | 'input'
  currentUserId: string
  onClose: () => void
  onTransferSuccess?: () => void
}

export function DeviceTransferModal({
  isOpen,
  initialMode = 'generate',
  currentUserId,
  onClose,
  onTransferSuccess,
}: DeviceTransferModalProps) {
  const [mode, setMode] = useState<'generate' | 'input'>(initialMode)
  const [isLoading, setIsLoading] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState<string>('')
  const [sessionToken, setSessionToken] = useState<string>('')
  const [timeLeft, setTimeLeft] = useState<number>(300)
  const [isExpired, setIsExpired] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [copied, setCopied] = useState(false)

  // Input Mode state
  const [inputToken, setInputToken] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')

  const timerRef = useRef<NodeJS.Timeout | null>(null)

  useModalBackHandler(isOpen, onClose)

  // Reset state when opening modal
  useEffect(() => {
    if (isOpen) {
      setMode(initialMode)
      setErrorMsg('')
      setSuccessMsg('')
      setCopied(false)
      setInputToken('')
      if (initialMode === 'generate') {
        startGenerateFlow()
      }
    } else {
      clearTimer()
    }
    return () => clearTimer()
  }, [isOpen, initialMode])

  const clearTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  // Flow membuat QR code di device lama
  const startGenerateFlow = async () => {
    setIsLoading(true)
    setErrorMsg('')
    setIsExpired(false)
    setQrDataUrl('')
    setSessionToken('')
    setTimeLeft(300)
    clearTimer()

    try {
      // 1. Ambil keypair lokal
      const keyPair = await getLocalUserKeyPair(currentUserId)
      if (!keyPair || !keyPair.privateKey) {
        throw new Error('Kunci keamanan lokal tidak ditemukan di perangkat ini.')
      }

      const privJWK = await exportPrivateKeyJWK(keyPair.privateKey)
      const pubJWK = keyPair.publicKeyJWK

      // 2. Generate token & enkripsi bundle
      const token = generateTransferSessionToken()
      const encryptedBundle = await encryptKeyBundleForTransfer(privJWK, pubJWK, token)

      // 3. Upload ke backend (TTL 5 menit)
      const { expires_in } = await uploadTransferSession(token, encryptedBundle)
      setSessionToken(token)
      setTimeLeft(expires_in)

      // 4. Generate QR code (mengarah ke URL deep link /transfer?token=...)
      const transferUrl = `${window.location.origin}/transfer?token=${token}`
      const qrUrl = await QRCode.toDataURL(transferUrl, {
        width: 260,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
      })
      setQrDataUrl(qrUrl)

      // 5. Mulai countdown timer
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearTimer()
            setIsExpired(true)
            return 0
          }
          return prev - 1
        })
      }, 1000)
    } catch (err: any) {
      console.error('[DeviceTransferModal] Error generate QR:', err)
      setErrorMsg(err.message || 'Gagal menyiapkan sesi transfer')
    } finally {
      setIsLoading(false)
    }
  }

  // Flow submit token manual di device baru
  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const cleanToken = inputToken.trim()
    if (!cleanToken) {
      setErrorMsg('Silakan masukkan kode token sesi transfer.')
      return
    }

    setIsSubmitting(true)
    setErrorMsg('')
    try {
      await consumeAndImportTransfer(currentUserId, cleanToken)
      setSuccessMsg('✅ Kunci keamanan berhasil dipindahkan! Sesi perangkat ini telah aktif.')
      setTimeout(() => {
        if (onTransferSuccess) {
          onTransferSuccess()
        } else {
          window.location.href = '/chat'
        }
      }, 1200)
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal memproses kode transfer')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCopyToken = () => {
    if (!sessionToken) return
    navigator.clipboard.writeText(sessionToken)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  if (!isOpen) return null

  return (
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
        zIndex: 160,
        padding: 'var(--space-4)',
      }}
    >
      <div
        className="modal-card"
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '480px',
          padding: 'var(--space-6)',
          boxShadow: 'var(--shadow-xl)',
          color: 'var(--text-primary)',
          textAlign: 'center',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
      >
        {/* Header Tabs */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={() => {
                setMode('generate')
                startGenerateFlow()
              }}
              style={{
                background: mode === 'generate' ? 'var(--accent-500)' : 'var(--bg-tertiary)',
                color: mode === 'generate' ? '#ffffff' : 'var(--text-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                padding: '6px 12px',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              📱 Buat QR (Perangkat Lama)
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('input')
                clearTimer()
                setErrorMsg('')
              }}
              style={{
                background: mode === 'input' ? 'var(--accent-500)' : 'var(--bg-tertiary)',
                color: mode === 'input' ? '#ffffff' : 'var(--text-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                padding: '6px 12px',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              🔑 Masukkan Kode (Perangkat Baru)
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: '1.25rem',
              cursor: 'pointer',
              padding: '4px',
            }}
          >
            ✕
          </button>
        </div>

        {/* MODE 1: GENERATE QR */}
        {mode === 'generate' && (
          <div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '6px' }}>
              Pindahkan Sesi ke Perangkat Baru
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 'var(--space-4)', lineHeight: 1.5 }}>
              Pindai kode QR ini menggunakan kamera di HP atau perangkat baru Anda untuk memindahkan kunci enkripsi tanpa merusak riwayat pesan.
            </p>

            {isLoading ? (
              <div style={{ padding: 'var(--space-8) 0', color: 'var(--text-muted)' }}>
                <div style={{ fontSize: '2rem', marginBottom: '8px' }}>⏳</div>
                <p style={{ fontSize: '0.9rem' }}>Menyiapkan enkripsi kunci keamanan...</p>
              </div>
            ) : isExpired ? (
              <div
                style={{
                  padding: 'var(--space-6)',
                  background: 'rgba(239, 68, 68, 0.08)',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  borderRadius: '12px',
                  marginBottom: 'var(--space-4)',
                }}
              >
                <div style={{ fontSize: '2rem', marginBottom: '8px' }}>⏱️</div>
                <div style={{ fontWeight: 600, color: '#f87171', marginBottom: '6px' }}>Sesi QR Telah Kedaluwarsa</div>
                <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', marginBottom: 'var(--space-4)' }}>
                  Demi keamanan Zero-Knowledge, sesi transfer hanya aktif selama 5 menit.
                </p>
                <button
                  type="button"
                  onClick={startGenerateFlow}
                  className="btn btn-primary"
                  style={{ width: '100%', padding: '10px' }}
                >
                  🔄 Buat QR Code Baru
                </button>
              </div>
            ) : qrDataUrl ? (
              <div>
                <div
                  style={{
                    background: '#ffffff',
                    padding: '12px',
                    borderRadius: '12px',
                    display: 'inline-block',
                    boxShadow: 'var(--shadow-md)',
                    marginBottom: 'var(--space-3)',
                  }}
                >
                  <img
                    src={qrDataUrl}
                    alt="QR Code Transfer Kunci"
                    style={{ width: '220px', height: '220px', display: 'block' }}
                  />
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    fontSize: '0.85rem',
                    color: timeLeft < 60 ? '#ef4444' : 'var(--text-muted)',
                    marginBottom: 'var(--space-4)',
                    fontWeight: 600,
                  }}
                >
                  <span>⏱️ Berlaku selama:</span>
                  <span
                    style={{
                      background: timeLeft < 60 ? 'rgba(239, 68, 68, 0.15)' : 'var(--bg-tertiary)',
                      padding: '2px 8px',
                      borderRadius: '6px',
                      fontFamily: 'monospace',
                    }}
                  >
                    {formatTimer(timeLeft)}
                  </span>
                </div>

                {/* Token Manual Copy Fallback */}
                <div
                  style={{
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '10px',
                    padding: '10px 12px',
                    textAlign: 'left',
                    marginBottom: 'var(--space-4)',
                  }}
                >
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                    Kamera tidak berfungsi? Salin kode manual ini ke perangkat baru:
                  </div>
                  <div
                    style={{
                      fontFamily: 'monospace',
                      fontSize: '0.75rem',
                      wordBreak: 'break-all',
                      color: 'var(--accent-300)',
                      marginBottom: '8px',
                    }}
                  >
                    {sessionToken}
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyToken}
                    className="btn btn-secondary"
                    style={{ width: '100%', fontSize: '0.8rem', padding: '6px 10px', justifyContent: 'center' }}
                  >
                    {copied ? '✅ Kode Berhasil Disalin!' : '📋 Salin Kode Manual'}
                  </button>
                </div>
              </div>
            ) : null}

            {errorMsg && (
              <div style={{ color: '#f87171', fontSize: '0.85rem', marginBottom: 'var(--space-3)' }}>
                {errorMsg}
              </div>
            )}
          </div>
        )}

        {/* MODE 2: INPUT MANUAL TOKEN */}
        {mode === 'input' && (
          <div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '6px' }}>
              Masukkan Kode Sesi Transfer
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 'var(--space-4)', lineHeight: 1.5 }}>
              Ketik atau tempelkan 64 karakter kode sesi transfer yang ditampilkan di perangkat lama Anda.
            </p>

            {successMsg ? (
              <div
                style={{
                  background: 'rgba(34, 197, 94, 0.1)',
                  border: '1px solid rgba(34, 197, 94, 0.3)',
                  color: '#22c55e',
                  padding: 'var(--space-4)',
                  borderRadius: '12px',
                  fontSize: '0.9rem',
                  marginBottom: 'var(--space-4)',
                }}
              >
                {successMsg}
              </div>
            ) : (
              <form onSubmit={handleManualSubmit}>
                <div style={{ marginBottom: 'var(--space-4)', textAlign: 'left' }}>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                    Kode Sesi Transfer (Hex):
                  </label>
                  <textarea
                    rows={3}
                    value={inputToken}
                    onChange={(e) => setInputToken(e.target.value)}
                    placeholder="Tempelkan 64 karakter kode sesi di sini..."
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      background: 'var(--bg-tertiary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '8px',
                      color: 'var(--text-primary)',
                      fontFamily: 'monospace',
                      fontSize: '0.8rem',
                      resize: 'none',
                    }}
                  />
                </div>

                {errorMsg && (
                  <div
                    style={{
                      background: 'rgba(239, 68, 68, 0.1)',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      color: '#f87171',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      fontSize: '0.825rem',
                      marginBottom: 'var(--space-4)',
                      textAlign: 'left',
                    }}
                  >
                    {errorMsg}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting || !inputToken.trim()}
                  className="btn btn-primary"
                  style={{ width: '100%', padding: '12px', fontSize: '0.95rem', justifyContent: 'center' }}
                >
                  {isSubmitting ? '⏳ Mengunduh & Memulihkan Kunci...' : '🔑 Sinkronkan Kunci & Masuk'}
                </button>
              </form>
            )}
          </div>
        )}

        <div style={{ marginTop: 'var(--space-4)' }}>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-secondary"
            style={{ width: '100%', padding: '8px', fontSize: '0.85rem', justifyContent: 'center' }}
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  )
}
