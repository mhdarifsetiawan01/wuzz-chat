'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import QRCode from 'qrcode'
import { Html5Qrcode } from 'html5-qrcode'
import { useAuth } from '@/lib/auth-context'
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
  disableBackHandler?: boolean
  onClose: () => void
  onTransferSuccess?: () => void
}

export function DeviceTransferModal({
  isOpen,
  initialMode = 'generate',
  hideGenerate = false,
  currentUserId,
  disableBackHandler = false,
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

  const { logout } = useAuth()
  const [mode, setMode] = useState<'generate' | 'input' | 'scan'>(getDefaultMode())
  const [isLoading, setIsLoading] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState<string>('')
  const [sessionToken, setSessionToken] = useState<string>('')
  const [timeLeft, setTimeLeft] = useState<number>(300)
  const [isExpired, setIsExpired] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [copied, setCopied] = useState(false)
  const [isTransferredOut, setIsTransferredOut] = useState(false)

  // Input Mode state
  const [inputToken, setInputToken] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')

  // Scanner Mode state
  const [isScannerRunning, setIsScannerRunning] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const qrScannerRef = useRef<Html5Qrcode | null>(null)
  const isStoppingRef = useRef(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  // Ref untuk membuka kamera native HP langsung via capture="environment" (100% bypass WebRTC permission PWA)
  const nativeCameraInputRef = useRef<HTMLInputElement | null>(null)
  // Ref untuk menyimpan pre-warm MediaStream (Android PWA gesture token fix)
  const mediaStreamRef = useRef<MediaStream | null>(null)

  // Deteksi lingkungan mobile / PWA standalone
  const [isMobileOrPWA, setIsMobileOrPWA] = useState(false)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const isStandalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true
      const isMobile = /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent)
      setIsMobileOrPWA(isStandalone || isMobile)
    }
  }, [])

  const timerRef = useRef<NodeJS.Timeout | null>(null)

  useModalBackHandler(!disableBackHandler && isOpen, onClose, 'device_transfer')

  const clearTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  const stopScanner = async () => {
    // Cleanup pre-warm MediaStream jika masih ada
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop())
      mediaStreamRef.current = null
    }
    if (qrScannerRef.current && !isStoppingRef.current) {
      isStoppingRef.current = true
      try {
        if (isScannerRunning) {
          await qrScannerRef.current.stop()
        }
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

    // ✅ ANDROID PWA FIX — Pre-Warm Permission Strategy
    // Cek ketersediaan mediaDevices (hanya tersedia di HTTPS / localhost)
    if (!navigator?.mediaDevices?.getUserMedia) {
      setCameraError(
        'Kamera tidak tersedia. Pastikan aplikasi diakses melalui HTTPS, atau gunakan tombol unggah foto / kode manual.'
      )
      return
    }

    // ✅ LANGKAH 1: Panggil getUserMedia() LANGSUNG di sini — masih dalam 1 tick user gesture.
    // Ini WAJIB dilakukan sebelum await apapun agar Android Chrome menampilkan dialog permission.
    // Tanpa ini, chain async yang panjang memutus "gesture token" dan dialog tidak pernah muncul.
    let preWarmStream: MediaStream | null = null
    let targetDeviceId: string | null = null
    try {
      preWarmStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
      })
      mediaStreamRef.current = preWarmStream
      // Extract deviceId dari track yang berhasil dibuka
      const track = preWarmStream.getVideoTracks()[0]
      if (track) {
        const settings = track.getSettings()
        targetDeviceId = settings.deviceId || null
      }
    } catch (permErr: any) {
      // Permission ditolak atau kamera tidak ditemukan — tampilkan error dan hentikan
      console.warn('[DeviceTransferModal] Pre-warm getUserMedia gagal:', permErr)
      const permName = permErr?.name || ''
      if (permName === 'NotAllowedError' || permName === 'PermissionDeniedError' || permErr?.message?.includes('Permission denied')) {
        setCameraError('Izin kamera ditolak. Silakan izinkan akses kamera di setelan browser HP Anda, atau gunakan unggah foto / kode manual.')
      } else if (permName === 'NotFoundError' || permName === 'DevicesNotFoundError') {
        setCameraError('Kamera tidak ditemukan pada perangkat ini. Silakan gunakan unggah foto atau kode manual.')
      } else {
        setCameraError(`Kamera tidak dapat diakses (${permErr?.message || 'Device busy'}). Silakan gunakan unggah foto atau kode manual.`)
      }
      return
    }

    // ✅ LANGKAH 2: Setelah permission diberikan, baru jalankan proses Html5Qrcode
    try {
      await stopScanner()
      const container = document.getElementById('qr-reader')
      if (!container) return

      const scanner = new Html5Qrcode('qr-reader')
      qrScannerRef.current = scanner

      // Konfigurasi dinamis tanpa memaksakan aspectRatio 1:1 yang sering ditolak driver kamera HP
      const config = {
        fps: 10,
        qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
          const edge = Math.min(viewfinderWidth, viewfinderHeight)
          const size = Math.max(160, Math.floor(edge * 0.75))
          return { width: size, height: size }
        },
      }

      const onScanSuccess = async (decodedText: string) => {
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
      }

      // ✅ LANGKAH 3: Stop pre-warm stream SEBELUM Html5Qrcode mulai
      // (Html5Qrcode akan membuka stream baru sendiri; tidak boleh double-grab kamera)
      if (preWarmStream) {
        preWarmStream.getTracks().forEach((t) => t.stop())
        mediaStreamRef.current = null
        preWarmStream = null
      }

      // ✅ LANGKAH 4: Start Html5Qrcode — permission sudah pasti granted karena pre-warm sukses
      // Prioritas: gunakan deviceId yang sudah terbukti bisa dibuka
      let cameraStarted = false

      if (targetDeviceId) {
        try {
          await scanner.start(targetDeviceId, config, onScanSuccess, () => {})
          cameraStarted = true
        } catch (idErr) {
          console.warn('[DeviceTransferModal] start dengan deviceId gagal, mencoba facingMode fallback:', idErr)
        }
      }

      // Fallback ke facingMode environment jika deviceId gagal
      if (!cameraStarted) {
        try {
          await scanner.start({ facingMode: 'environment' }, config, onScanSuccess, () => {})
          cameraStarted = true
        } catch (envErr) {
          console.warn('[DeviceTransferModal] environment facingMode gagal, mencoba user/any:', envErr)
          // Last resort: kamera default/front
          await scanner.start({ facingMode: 'user' }, config, onScanSuccess, () => {})
          cameraStarted = true
        }
      }

      setIsScannerRunning(true)
    } catch (err: any) {
      console.warn('[DeviceTransferModal] Gagal memulai Html5Qrcode scanner:', err)
      setIsScannerRunning(false)
      const msg = err?.message || String(err)
      if (err?.name === 'NotAllowedError' || msg.includes('NotAllowedError') || msg.includes('Permission denied')) {
        setCameraError('Izin kamera ditolak. Silakan izinkan akses kamera di setelan browser HP Anda, atau gunakan unggah foto / kode manual.')
      } else if (err?.name === 'NotFoundError' || msg.includes('NotFoundError') || msg.includes('Requested device not found')) {
        setCameraError('Kamera tidak ditemukan pada perangkat ini. Silakan gunakan unggah foto atau kode manual.')
      } else {
        setCameraError(`Kamera tidak dapat diakses (${msg || 'Device busy'}). Silakan coba tombol "Buka Kamera Sekarang", unggah foto QR, atau masukkan kode manual.`)
      }
    }
  }

  // Helper kompresi dan downscale gambar kamera HP beresolusi tinggi (12MP - 50MP)
  // agar tidak crash memori canvas dan mudah dibaca oleh algoritma binarizer ZXing
  const downscaleImageFile = async (rawFile: File, maxDimension: number = 1200): Promise<File> => {
    if (!rawFile.type.startsWith('image/') || rawFile.size < 200 * 1024) {
      return rawFile
    }

    return new Promise((resolve) => {
      const img = new Image()
      const url = URL.createObjectURL(rawFile)
      img.onload = () => {
        URL.revokeObjectURL(url)
        let { width, height } = img
        if (width <= maxDimension && height <= maxDimension) {
          resolve(rawFile)
          return
        }

        if (width > height) {
          height = Math.round((height * maxDimension) / width)
          width = maxDimension
        } else {
          width = Math.round((width * maxDimension) / height)
          height = maxDimension
        }

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve(rawFile)
          return
        }

        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(img, 0, 0, width, height)

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(rawFile)
              return
            }
            const processed = new File([blob], rawFile.name || 'qr_photo.jpg', {
              type: 'image/jpeg',
              lastModified: Date.now(),
            })
            resolve(processed)
          },
          'image/jpeg',
          0.92
        )
      }

      img.onerror = () => {
        URL.revokeObjectURL(url)
        resolve(rawFile)
      }

      img.src = url
    })
  }

  // Fallback scan langsung dari file gambar / screenshot / tangkapan kamera native HP
  const handleFileScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawFile = e.target.files?.[0]
    if (!rawFile) return
    setErrorMsg('')
    setCameraError('')
    setIsLoading(true)

    try {
      await stopScanner()

      // Pastikan ada container off-screen mandiri di DOM yang tidak terpengaruh unmount state
      let container = document.getElementById('qr-file-scanner-box')
      if (!container) {
        container = document.createElement('div')
        container.id = 'qr-file-scanner-box'
        container.style.position = 'fixed'
        container.style.top = '-9999px'
        container.style.left = '-9999px'
        container.style.width = '300px'
        container.style.height = '300px'
        container.style.opacity = '0'
        container.style.pointerEvents = 'none'
        document.body.appendChild(container)
      }

      // Optimasi gambar kamera HP: downscale ke 1200px agar ZXing barcode reader cepat & presisi
      const optimizedFile = await downscaleImageFile(rawFile, 1200)

      const fileScanner = new Html5Qrcode('qr-file-scanner-box')
      let decodedText = ''
      try {
        decodedText = await fileScanner.scanFile(optimizedFile, false)
      } catch (scanErr) {
        // Fallback coba skala 800px jika 1200px masih gagal
        console.warn('[DeviceTransferModal] Percobaan 1200px gagal, mencoba fallback skala 800px...', scanErr)
        try {
          const fallbackFile = await downscaleImageFile(rawFile, 800)
          decodedText = await fileScanner.scanFile(fallbackFile, false)
        } catch (_) {
          // Percobaan terakhir: coba file raw asli
          decodedText = await fileScanner.scanFile(rawFile, false)
        }
      } finally {
        try {
          fileScanner.clear()
        } catch (_) {}
      }

      let token = decodedText.trim()
      if (token.includes('token=')) {
        const match = token.match(/token=([a-f0-9]{64})/i)
        if (match) token = match[1]
      }

      if (/^[a-f0-9]{64}$/i.test(token)) {
        setIsLoading(false)
        await handleProcessToken(token)
      } else {
        throw new Error('Gambar tidak mengandung QR Code sesi transfer Wuzz Chat yang valid.')
      }
    } catch (err: any) {
      console.warn('[DeviceTransferModal] Gagal memindai gambar QR:', err)
      setIsLoading(false)
      const errStr = err?.message || String(err)
      if (errStr.includes('No MultiFormat Readers') || errStr.includes('No barcode') || errStr.includes('not found')) {
        setErrorMsg('QR Code tidak terdeteksi pada gambar. Pastikan gambar QR Code jelas, fokus, dan tidak terpotong.')
      } else {
        setErrorMsg(errStr)
      }
    } finally {
      setIsLoading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      if (nativeCameraInputRef.current) {
        nativeCameraInputRef.current.value = ''
      }
    }
  }

  // Reset state when opening modal
  useEffect(() => {
    if (isOpen) {
      setIsTransferredOut(false)
      const resolvedMode = hideGenerate ? (initialMode === 'generate' ? 'scan' : initialMode) : initialMode
      setMode(resolvedMode)
      setErrorMsg('')
      setSuccessMsg('')
      setCopied(false)
      setInputToken('')
      setCameraError('')

      if (resolvedMode === 'generate' && !hideGenerate) {
        startGenerateFlow()
      }
      // Catatan PWA: Jangan auto-start kamera di background timer agar tidak memicu NotAllowedError
      // Kamera dimulai murni melalui klik tombol "Buka Kamera Sekarang" (direct user gesture)
    } else {
      clearTimer()
      stopScanner()
      if (typeof window !== 'undefined') {
        window.scrollTo(0, 0)
      }
    }
    return () => {
      clearTimer()
      stopScanner()
      if (typeof window !== 'undefined') {
        window.scrollTo(0, 0)
      }
    }
  }, [isOpen, initialMode, hideGenerate])

  // Listener event pergantian sesi saat QR berhasil dikonsumsi di perangkat baru
  useEffect(() => {
    const handleSessionReplaced = () => {
      if (mode === 'generate' && isOpen) {
        setIsTransferredOut(true)
        clearTimer()
        setTimeout(async () => {
          try {
            await logout()
          } catch {}
          onClose()
          if (typeof window !== 'undefined') {
            window.location.replace('/login?logout=1')
          }
        }, 1500)
      }
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('wuzz:session_replaced', handleSessionReplaced)
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('wuzz:session_replaced', handleSessionReplaced)
      }
    }
  }, [mode, isOpen, onClose])

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
        if (typeof window !== 'undefined') {
          window.scrollTo(0, 0)
        }
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
    } else {
      await handleProcessToken(cleanToken)
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

  if (!isOpen || typeof document === 'undefined') return null

  return createPortal(
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
        zIndex: 'var(--z-modal-top)' as any,
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
          maxWidth: '480px',
          padding: 'var(--space-6)',
          boxShadow: '0 25px 50px rgba(0,0,0,0.7), 0 0 30px rgba(59, 130, 246, 0.1)',
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
                  color: mode === 'generate' ? 'var(--text-on-accent)' : 'var(--text-secondary)',
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
                color: mode === 'scan' ? 'var(--text-on-accent)' : 'var(--text-secondary)',
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
                color: mode === 'input' ? 'var(--text-on-accent)' : 'var(--text-secondary)',
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
            {isTransferredOut ? (
              <div
                style={{
                  padding: 'var(--space-6)',
                  background: 'var(--tint-accent-10)',
                  border: '1px solid var(--accent-500)',
                  borderRadius: '12px',
                  marginBottom: 'var(--space-4)',
                }}
              >
                <div style={{ fontSize: '3rem', marginBottom: '8px' }}>✅</div>
                <div style={{ fontWeight: 600, color: 'var(--color-verified)', fontSize: '1.1rem', marginBottom: '6px' }}>
                  Kunci Keamanan Berhasil Dipindahkan!
                </div>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  Sesi enkripsi akun Anda telah aktif di perangkat baru. Sesi di peramban ini dinonaktifkan demi melindungi pesan Anda.
                </p>
              </div>
            ) : (
              <>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '6px' }}>
                  Sinkronkan Kunci ke Perangkat Lain
                </h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 'var(--space-4)', lineHeight: 1.5 }}>
                  Pindai kode QR ini menggunakan kamera di HP atau laptop Anda untuk menyinkronkan kunci enkripsi sehingga kedua perangkat dapat digunakan bersamaan tanpa merusak riwayat pesan.
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
                      background: 'var(--tint-error-08)',
                      border: '1px solid rgba(239, 68, 68, 0.25)',
                      borderRadius: '12px',
                      marginBottom: 'var(--space-4)',
                    }}
                  >
                    <div style={{ fontSize: '2rem', marginBottom: '8px' }}>⏱️</div>
                    <div style={{ fontWeight: 600, color: 'var(--color-error)', marginBottom: '6px' }}>Sesi QR Telah Kedaluwarsa</div>
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
                        background: 'var(--text-on-accent)',
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
                        color: timeLeft < 60 ? 'var(--color-error)' : 'var(--text-muted)',
                        marginBottom: 'var(--space-4)',
                        fontWeight: 600,
                      }}
                    >
                      <span>⏱️ Berlaku selama:</span>
                      <span
                        style={{
                          background: timeLeft < 60 ? 'var(--tint-error-15)' : 'var(--bg-tertiary)',
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
                  <div style={{ color: 'var(--color-error)', fontSize: '0.85rem', marginBottom: 'var(--space-3)' }}>
                    {errorMsg}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* MODE 2: SCAN QR VIA KAMERA */}
        {mode === 'scan' && (
          <div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '6px' }}>
              Pindai QR Code Perangkat Aktif
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 'var(--space-4)', lineHeight: 1.5 }}>
              Arahkan kamera perangkat ini ke kode QR yang ditampilkan di perangkat Anda yang lain untuk menyinkronkan kunci enkripsi seketika.
            </p>

            {successMsg ? (
              <div
                style={{
                  background: 'rgba(34, 197, 94, 0.1)',
                  border: '1px solid rgba(34, 197, 94, 0.3)',
                  color: 'var(--color-success)',
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
                    <div style={{ padding: 'var(--space-6) var(--space-4)', color: 'var(--text-muted)' }}>
                      <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>📷</div>
                      <p style={{ fontSize: '0.85rem', marginBottom: '14px', color: 'var(--text-secondary)' }}>
                        {isMobileOrPWA
                          ? 'Pilih metode pemindaian untuk perangkat HP Anda:'
                          : 'Ketuk tombol di bawah untuk menyalakan kamera'}
                      </p>

                      {isMobileOrPWA ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}>
                          <button
                            type="button"
                            onClick={() => nativeCameraInputRef.current?.click()}
                            className="btn btn-primary"
                            style={{
                              fontSize: '0.925rem',
                              padding: '12px 18px',
                              fontWeight: 700,
                              width: '100%',
                              justifyContent: 'center',
                              background: 'var(--accent-gradient)',
                              border: 'none',
                              boxShadow: '0 4px 14px rgba(59, 130, 246, 0.35)',
                            }}
                          >
                            📸 Buka Kamera HP (Foto QR)
                          </button>
                          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '-4px 0 4px', lineHeight: 1.4 }}>
                            ✨ Langsung membuka kamera sistem HP Anda tanpa kendala izin browser/PWA.
                          </p>

                          <button
                            type="button"
                            onClick={() => startScanner()}
                            className="btn btn-secondary"
                            style={{
                              fontSize: '0.825rem',
                              padding: '9px 14px',
                              width: '100%',
                              justifyContent: 'center',
                            }}
                          >
                            🎥 Atau Coba Pemindai Kamera Langsung
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startScanner()}
                          className="btn btn-primary"
                          style={{ fontSize: '0.85rem', padding: '10px 18px', margin: '0 auto', fontWeight: 600 }}
                        >
                          📷 Buka Kamera Sekarang
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {cameraError && (
                  <div
                    style={{
                      background: 'var(--tint-error-10)',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      color: 'var(--color-error)',
                      padding: '14px 16px',
                      borderRadius: '12px',
                      fontSize: '0.825rem',
                      marginBottom: 'var(--space-4)',
                      textAlign: 'left',
                      lineHeight: 1.5,
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '6px' }}>
                        ⚠️ Kamera Live Browser Dibatasi
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--color-error)', lineHeight: 1.45 }}>
                        Sistem Android WebAPK PWA membatasi izin live streaming kamera di browser. Gunakan tombol kamera native di bawah ini untuk mengambil foto QR langsung melalui kamera sistem HP Anda.
                      </div>
                    </div>
                    <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={() => nativeCameraInputRef.current?.click()}
                        className="btn btn-primary"
                        style={{
                          fontSize: '0.9rem',
                          padding: '12px 14px',
                          width: '100%',
                          justifyContent: 'center',
                          background: 'var(--accent-gradient)',
                          color: 'var(--text-on-accent)',
                          border: 'none',
                          fontWeight: 700,
                          boxShadow: '0 4px 12px rgba(59, 130, 246, 0.35)',
                        }}
                      >
                        📸 Buka Kamera HP (Foto QR Sekarang)
                      </button>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="btn btn-secondary"
                        style={{
                          fontSize: '0.85rem',
                          padding: '9px 12px',
                          width: '100%',
                          justifyContent: 'center',
                          background: 'var(--tint-accent-15)',
                          color: 'var(--accent-300)',
                          borderColor: 'var(--tint-accent-35)',
                          fontWeight: 600,
                        }}
                      >
                        📁 Pilih dari Galeri / Screenshot
                      </button>
                      <button
                        type="button"
                        onClick={() => startScanner()}
                        className="btn btn-secondary"
                        style={{ fontSize: '0.8rem', padding: '8px 12px', width: '100%', justifyContent: 'center' }}
                      >
                        🔄 Coba Live Stream Lagi
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          stopScanner()
                          setMode('input')
                        }}
                        className="btn btn-secondary"
                        style={{ fontSize: '0.8rem', padding: '8px 12px', width: '100%', justifyContent: 'center' }}
                      >
                        ⌨️ Beralih ke Masukkan Kode Manual
                      </button>
                    </div>
                  </div>
                )}

                {/* Alternatif Input Kamera Native & File Upload */}
                <div style={{ marginTop: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
                  {/* Input khusus kamera native Android / iOS via intent */}
                  <input
                    type="file"
                    ref={nativeCameraInputRef}
                    accept="image/*"
                    capture="environment"
                    onChange={handleFileScan}
                    style={{ display: 'none' }}
                  />
                  {/* Input khusus galeri / file selector */}
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/*"
                    onChange={handleFileScan}
                    style={{ display: 'none' }}
                  />
                  {!cameraError && (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="btn btn-secondary"
                      style={{
                        width: '100%',
                        fontSize: '0.8rem',
                        padding: '8px 12px',
                        justifyContent: 'center',
                        background: 'var(--bg-tertiary)',
                        border: '1px dashed var(--border-color)',
                      }}
                    >
                      📁 Atau Pindai dari File Gambar / Galeri HP
                    </button>
                  )}
                </div>

                {errorMsg && (
                  <div
                    style={{
                      background: 'var(--tint-error-10)',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      color: 'var(--color-error)',
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
                  color: 'var(--color-success)',
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
                      background: 'var(--tint-error-10)',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      color: 'var(--color-error)',
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
    </div>,
    document.body
  )
}
