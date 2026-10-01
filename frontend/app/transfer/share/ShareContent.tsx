'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'

// Modal memuat qrcode & html5-qrcode: baru diunduh saat sesi valid, tidak masuk bundle awal
const DeviceTransferModal = dynamic(
  () => import('@/app/chat/DeviceTransferModal').then((m) => m.DeviceTransferModal),
  { ssr: false },
)

// Halaman standalone untuk memindahkan kunci E2EE dari sesi web/PWA ini ke aplikasi mobile
// saat web dijeda. Hanya mode pengirim (QR); tidak memuat UI chat, WebSocket, maupun impor kunci.
export default function ShareContent() {
  const { user, isLoading, logout } = useAuth()
  const [confirmLogout, setConfirmLogout] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  // logout() menghapus sesi lokal seketika, lalu memberi tahu server & melepas push (tidak ada notifikasi ganda)
  const handleLogoutBrowser = async () => {
    setIsLoggingOut(true)
    try {
      await logout()
    } finally {
      window.location.replace('/')
    }
  }

  if (isLoading) {
    return (
      <main className="landing-page">
        <div className="landing-card" style={{ textAlign: 'center', padding: 'var(--space-8)' }}>
          <p style={{ color: 'var(--text-muted)' }}>Memeriksa sesi akun...</p>
        </div>
      </main>
    )
  }

  if (!user) {
    return (
      <main className="landing-page">
        <div className="landing-card" style={{ textAlign: 'center' }}>
          <div className="landing-logo-icon">🔐</div>
          <h1 style={{ marginTop: 'var(--space-4)' }}>Sesi Tidak Ditemukan</h1>
          <p style={{ color: 'var(--text-muted)', marginTop: 'var(--space-3)' }}>
            Sesi akun di peramban ini sudah berakhir, sehingga kunci tidak bisa dipindahkan dari sini.
            Silakan login langsung di aplikasi WuzzChat.
          </p>
          <div style={{ marginTop: 'var(--space-6)' }}>
            <Link className="btn btn-secondary" style={{ justifyContent: 'center' }} href="/">Kembali</Link>
          </div>
        </div>
      </main>
    )
  }

  return (
    <DeviceTransferModal
      isOpen
      generateOnly
      disableBackHandler
      initialMode="generate"
      currentUserId={user.id}
      footerAction={
        <div style={{ marginTop: 'var(--space-4)', paddingTop: 'var(--space-4)', borderTop: '1px solid var(--border-default)' }}>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 'var(--space-2)', lineHeight: 1.5 }}>
            Setelah QR berhasil dipindai di aplikasi mobile, keluar dari peramban ini agar notifikasi tidak masuk ganda.
          </p>
          {confirmLogout ? (
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <button
                type="button"
                className="btn btn-primary"
                style={{ flex: 1, justifyContent: 'center', fontSize: '0.85rem' }}
                disabled={isLoggingOut}
                onClick={handleLogoutBrowser}
              >
                {isLoggingOut ? 'Keluar...' : 'Ya, sudah dipindai'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ flex: 1, justifyContent: 'center', fontSize: '0.85rem' }}
                disabled={isLoggingOut}
                onClick={() => setConfirmLogout(false)}
              >
                Batal
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-secondary"
              style={{ width: '100%', justifyContent: 'center', fontSize: '0.85rem' }}
              onClick={() => setConfirmLogout(true)}
            >
              Keluar dari peramban ini
            </button>
          )}
        </div>
      }
      onClose={() => window.location.replace('/')}
    />
  )
}
