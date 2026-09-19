'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { consumeAndImportTransfer } from '@/lib/crypto/keyTransfer'

function TransferContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token') || ''

  const { user, isLoading: isAuthLoading } = useAuth()
  const [status, setStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle')
  const [statusText, setStatusText] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [manualToken, setManualToken] = useState(token)

  useEffect(() => {
    if (token) {
      setManualToken(token)
    }
  }, [token])

  useEffect(() => {
    if (isAuthLoading) return

    // Jika user belum login, simpan token sementara dan arahkan ke login
    if (!user && token) {
      sessionStorage.setItem('wuzz_pending_transfer_token', token)
      router.replace(`/login?redirect=${encodeURIComponent(`/transfer?token=${token}`)}`)
      return
    }

    // Jika user sudah login dan ada token di URL, jalankan auto-transfer
    if (user && token && status === 'idle') {
      executeTransfer(token)
    }
  }, [user, isAuthLoading, token])

  const executeTransfer = async (sessionToken: string) => {
    if (!user) return
    setStatus('processing')
    setStatusText('Mengunduh paket enkripsi dari server...')
    setErrorMessage('')

    try {
      setStatusText('Mendekripsi kunci keamanan secara lokal (Zero-Knowledge)...')
      await consumeAndImportTransfer(user.id, sessionToken.trim())

      setStatus('success')
      setStatusText('Kunci keamanan berhasil disinkronkan! Mengalihkan ke obrolan...')
      sessionStorage.removeItem('wuzz_pending_transfer_token')

      setTimeout(() => {
        window.location.href = '/chat'
      }, 1500)
    } catch (err: any) {
      setStatus('error')
      setErrorMessage(err.message || 'Gagal memproses transfer kunci keamanan')
    }
  }

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!manualToken.trim()) {
      setErrorMessage('Silakan masukkan token sesi transfer')
      return
    }
    executeTransfer(manualToken)
  }

  if (isAuthLoading) {
    return (
      <main className="landing-page">
        <div className="landing-card" style={{ textAlign: 'center', padding: 'var(--space-8)' }}>
          <div className="landing-logo-icon" style={{ animation: 'spin 1.5s linear infinite' }}>⏳</div>
          <p style={{ marginTop: '16px', color: 'var(--text-secondary)' }}>Memeriksa status sesi...</p>
        </div>
      </main>
    )
  }

  return (
    <main className="landing-page">
      <div className="landing-card" style={{ maxWidth: '480px', width: '100%', textAlign: 'center', padding: 'var(--space-6)' }}>
        <div className="landing-logo-icon" style={{ margin: '0 auto 16px auto', fontSize: '2.5rem' }}>
          {status === 'success' ? '✅' : status === 'error' ? '⚠️' : '🔐'}
        </div>

        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '8px', color: 'var(--text-primary)' }}>
          Transfer Kunci End-to-End
        </h1>

        <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: 'var(--space-5)', lineHeight: 1.5 }}>
          Sinkronisasi identitas kriptografi antar perangkat tanpa merusak riwayat pesan.
        </p>

        {status === 'processing' && (
          <div style={{ padding: 'var(--space-6) 0' }}>
            <div style={{ fontSize: '2rem', marginBottom: '12px', animation: 'spin 2s linear infinite' }}>⏳</div>
            <p style={{ fontSize: '0.9rem', color: 'var(--accent-300)', fontWeight: 500 }}>
              {statusText}
            </p>
          </div>
        )}

        {status === 'success' && (
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
            {statusText}
          </div>
        )}

        {status === 'error' && (
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <div
              style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: 'var(--color-error)',
                padding: 'var(--space-4)',
                borderRadius: '12px',
                fontSize: '0.875rem',
                marginBottom: 'var(--space-4)',
                textAlign: 'left',
                lineHeight: 1.5,
              }}
            >
              <strong>Gagal Memindahkan Kunci:</strong>
              <div style={{ marginTop: '4px' }}>{errorMessage}</div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setStatus('idle')}
                className="btn btn-primary"
                style={{ width: '100%', justifyContent: 'center' }}
              >
                Coba Masukkan Kode Lagi
              </button>
              <Link
                href="/chat"
                className="btn btn-secondary"
                style={{ width: '100%', justifyContent: 'center', textDecoration: 'none' }}
              >
                Kembali ke Ruang Obrolan
              </Link>
            </div>
          </div>
        )}

        {status === 'idle' && (
          <form onSubmit={handleManualSubmit}>
            <div style={{ marginBottom: 'var(--space-4)', textAlign: 'left' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                Kode Sesi Transfer (Hex):
              </label>
              <textarea
                rows={3}
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value)}
                placeholder="Tempelkan 64 karakter kode sesi transfer di sini..."
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

            <button
              type="submit"
              disabled={!manualToken.trim()}
              className="btn btn-primary"
              style={{ width: '100%', padding: '12px', fontSize: '0.95rem', justifyContent: 'center', marginBottom: '12px' }}
            >
              🔑 Sinkronkan Kunci & Masuk
            </button>

            <Link
              href="/chat"
              style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textDecoration: 'none' }}
            >
              Lewati & Masuk ke Chat
            </Link>
          </form>
        )}
      </div>
    </main>
  )
}

export default function TransferPage() {
  return (
    <Suspense
      fallback={
        <main className="landing-page">
          <div className="landing-card" style={{ textAlign: 'center', padding: 'var(--space-8)' }}>
            <div className="landing-logo-icon" style={{ animation: 'spin 1.5s linear infinite' }}>⏳</div>
            <p style={{ marginTop: '16px', color: 'var(--text-secondary)' }}>Memuat halaman transfer...</p>
          </div>
        </main>
      }
    >
      <TransferContent />
    </Suspense>
  )
}
