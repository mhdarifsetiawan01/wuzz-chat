'use client'

import { useState, useEffect, useRef } from 'react'
import QRCode from 'qrcode'
import { Html5Qrcode } from 'html5-qrcode'
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
  initialMode?: 'generate' | 'input' | 'scan'
  hideGenerate?: boolean
  currentUserId: string
  onClose: () => void
  onTransferSuccess?: () => void
}

export function DeviceTransferModal({
  isOpen,
  initialMode = 'generate',
  hideGenerate = false,
  currentUserId,
  onClose,
  onTransferSuccess,
}: DeviceTransferModalProps) {
  // Tentukan mode awal yang aman
  const getDefaultMode = (): 'generate' | 'input' | 'scan' => {
    if (hideGenerate) {
      return initialMode === 'generate' ? 'scan' : initialMode
    }
    return initialMode
  }

  const [mode, setMode] = useState<'generate' | 'input' | 'scan'>(getDefaultMode())
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

  // Scanner Mode state
  const [isScannerRunning, setIsScannerRunning] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const qrScannerRef = useRef<Html5Qrcode | null>(null)
  const isStoppingRef = useRef(false)

  const timerRef = useRef<NodeJS.Timeout | null>(null)

  useModalBackHandler(isOpen, onClose)

  const clearTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  const stopScanner = async () => {
    if (qrScannerRef.current && isScannerRunning && !isStoppingRef.current) {
      isStoppingRef.current = true
      try {
        await qrScannerRef.current.stop()
        qrScannerRef.current.clear()
      } catch (err) {
        console.warn('[DeviceTransferModal] Error stopping scanner:', err)
      } finally {
        qrScannerRef.current = null
        isStoppingRef.current = false
        setIsScannerRunning(false)
      }
    }
  }

  const startScanner = async () => {
    setCameraError('')
    setErrorMsg('')
    try {
      await stopScanner()
      const container = document.getElementById('qr-reader')
      if (!container) return

      const scanner = new Html5Qrcode('qr-reader')
      qrScannerRef.current = scanner

      const config = {
        fps: 10,
        qrbox: { width: 220, height: 220 },
        aspectRatio: 1.0,
      }

      await scanner.start(
        { facingMode: 'environment' },
        config,
        async (decodedText) => {
          let token = decodedText.trim()
          if (token.includes('token=')) {
            const match = token.match(/token=([a-f0-9]{64})/i)
            if (match) token = match[1]
          }

          if (/^[a-f0-9]{64}$/i.test(token)) {
            await stopScanner()
            await handleProcessToken(token)
          } else {
            setCameraError('QR Code tidak valid atau bukan sesi transfer Wuzz Chat.')
          }
        },
        () => {
          // Frame callback parsing
        }
      )
      setIsScannerRunning(true)
    } catch (err: any) {
      console.warn('[DeviceTransferModal] Gagal memulai scanner kamera:', err)
      setIsScannerRunning(false)
      setCameraError(
        err?.message?.includes('NotAllowedError') || err?.name === 'NotAllowedError'
          ? 'Izin kamera ditolak. Silakan izinkan akses kamera di browser atau gunakan tab "Masukkan Kode Manual".'
          : 'Kamera tidak dapat diakses di perangkat ini. Silakan gunakan tab "Masukkan Kode Manual".'
      )
    }
  }

  // Reset state when opening modal
  useEffect(() => {
    if (isOpen) {
      const resolvedMode = hideGenerate ? (initialMode === 'generate' ? 'scan' : initialMode) : initialMode
      setMode(resolvedMode)
      setErrorMsg('')
      setSuccessMsg('')
      setCopied(false)
      setInputToken('')
      setCameraError('')

      if (resolvedMode === 'generate' && !hideGenerate) {
        startGenerateFlow()
      } else if (resolvedMode === 'scan') {
        const timer = setTimeout(() => {
          startScanner()
        }, 300)
        return () => clearTimeout(timer)
      }
    } else {
      clearTimer()
      stopScanner()
    }
    return () => {
      clearTimer()
      stopScanner()
    }
  }, [isOpen, initialMode, hideGenerate])

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
      const keyPair = await getLocalUserKeyPair(currentUserId)
      if (!keyPair || !keyPair.privateKey) {
        throw new Error('Kunci keamanan lokal tidak ditemukan di perangkat ini.')
      }

      const privJWK = await exportPrivateKeyJWK(keyPair.privateKey)
      const pubJWK = keyPair.publicKeyJWK

      const token = generateTransferSessionToken()
      const encryptedBundle = await encryptKeyBundleForTransfer(privJWK, pubJWK, token)

      const { expires_in } = await uploadTransferSession(token, encryptedBundle)
      setSessionToken(token)
      setTimeLeft(expires_in)

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

  // Flow pemrosesan token transfer (dari scan maupun manual input)
  const handleProcessToken = async (cleanToken: string) => {
    setIsSubmitting(true)
    setErrorMsg('')
    setCameraError('')
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

  // Flow submit token manual di device baru
  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const cleanToken = inputToken.trim()
    if (!cleanToken) {
      setErrorMsg('Silakan masukkan kode token sesi transfer.')
      return
    }
    await handleProcessToken(cleanToken)
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
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {!hideGenerate && (
              <button
                type="button"
                onClick={() => {
                  stopScanner()
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
                📱 Buat QR (Perangkat Ini)
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setMode('scan')
                clearTimer()
                setErrorMsg('')
                setSuccessMsg('')
                setTimeout(() => startScanner(), 300)
              }}
              style={{
                background: mode === 'scan' ? 'var(--accent-500)' : 'var(--bg-tertiary)',
                color: mode === 'scan' ? '#ffffff' : 'var(--text-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                padding: '6px 12px',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              📷 Pindai QR (Kamera)
            </button>

            <button
              type="button"
              onClick={() => {
                stopScanner()
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
              🔑 Masukkan Kode (Manual)
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              stopScanner()
              onClose()
            }}
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
        {mode === 'generate' && !hideGenerate && (
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

        {/* MODE 2: SCAN QR VIA KAMERA */}
        {mode === 'scan' && (
          <div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '6px' }}>
              Pindai QR Code Perangkat Lama
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 'var(--space-4)', lineHeight: 1.5 }}>
              Arahkan kamera perangkat ini ke kode QR yang ditampilkan di perangkat lama Anda untuk memindahkan kunci enkripsi seketika.
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
            ) : isSubmitting ? (
              <div style={{ padding: 'var(--space-8) 0', color: 'var(--text-muted)' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>⏳</div>
                <p style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--accent-300)' }}>
                  Mengunduh & Memulihkan Kunci Keamanan...
                </p>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Mohon tunggu sebentar, sesi Anda sedang diaktifkan.
                </p>
              </div>
            ) : (
              <div>
                <div
                  style={{
                    position: 'relative',
                    width: '100%',
                    maxWidth: '320px',
                    margin: '0 auto var(--space-4)',
                    borderRadius: '16px',
                    overflow: 'hidden',
                    background: '#000000',
                    border: '2px solid var(--border-color)',
                    minHeight: '260px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <div id="qr-reader" style={{ width: '100%' }} />
                  {!isScannerRunning && !cameraError && (
                    <div style={{ padding: 'var(--space-4)', color: 'var(--text-muted)' }}>
                      <div style={{ fontSize: '2rem', marginBottom: '8px' }}>📷</div>
                      <p style={{ fontSize: '0.85rem' }}>Menyiapkan kamera...</p>
                    </div>
                  )}
                </div>

                {cameraError && (
                  <div
                    style={{
                      background: 'rgba(239, 68, 68, 0.1)',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      color: '#f87171',
                      padding: '10px 14px',
                      borderRadius: '10px',
                      fontSize: '0.825rem',
                      marginBottom: 'var(--space-4)',
                      textAlign: 'left',
                      lineHeight: 1.5,
                    }}
                  >
                    ⚠️ {cameraError}
                    <div style={{ marginTop: '8px' }}>
                      <button
                        type="button"
                        onClick={() => {
                          stopScanner()
                          setMode('input')
                        }}
                        className="btn btn-secondary"
                        style={{ fontSize: '0.8rem', padding: '6px 12px', width: '100%', justifyContent: 'center' }}
                      >
                        ⌨️ Beralih ke Masukkan Kode Manual
                      </button>
                    </div>
                  </div>
                )}

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
                    }}
                  >
                    {errorMsg}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* MODE 3: INPUT MANUAL TOKEN */}
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
            onClick={() => {
              stopScanner()
              onClose()
            }}
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
