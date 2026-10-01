'use client'

import { usePathname } from 'next/navigation'
import { APP_DOWNLOAD_URL, IS_WEB_PAUSED, WEB_PAUSED_EXEMPT_PREFIXES } from '@/lib/app-download'

export default function WebPausedGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '/'
  const isExempt = WEB_PAUSED_EXEMPT_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))

  if (!IS_WEB_PAUSED || isExempt) return <>{children}</>

  // Aplikasi web tidak di-mount sama sekali: tidak ada sesi, WebSocket, atau request API.
  return (
    <div className="modal-backdrop z-modal-top" role="dialog" aria-modal="true" aria-labelledby="web-paused-title">
      <div className="landing-card" style={{ textAlign: 'center' }}>
        <div className="landing-logo-icon">📱</div>
        <h1 id="web-paused-title" style={{ marginTop: 'var(--space-4)' }}>Gunakan Aplikasi Wuzz Chat</h1>
        <p style={{ color: 'var(--text-muted)', marginTop: 'var(--space-3)' }}>
          Versi web sedang dijeda sementara. Untuk pengalaman terbaik, silakan pakai aplikasi mobile Wuzz Chat.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginTop: 'var(--space-6)' }}>
          <a className="btn btn-primary" style={{ justifyContent: 'center' }} href={APP_DOWNLOAD_URL} rel="noopener noreferrer">
            ⬇️ Download Aplikasi Android
          </a>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', marginTop: 'var(--space-4)' }}>
          Setelah terunduh, buka file APK dan izinkan instal dari sumber tidak dikenal. Saat ini hanya tersedia untuk Android.
        </p>
      </div>
    </div>
  )
}
