'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { APP_DOWNLOAD_URL, IS_WEB_PAUSED, WEB_PAUSED_EXEMPT_PREFIXES } from '@/lib/app-download'

export default function WebPausedGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '/'
  // Tampilkan tautan pindah kunci hanya jika peramban ini masih punya sesi login
  const [hasSession, setHasSession] = useState(false)
  useEffect(() => {
    try {
      setHasSession(!!localStorage.getItem('wuzz_auth_token'))
    } catch {}
  }, [])
  const isExempt = WEB_PAUSED_EXEMPT_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))

  if (!IS_WEB_PAUSED || isExempt) return <>{children}</>

  // Aplikasi web tidak di-mount sama sekali: tidak ada sesi, WebSocket, atau request API.
  return (
    <div className="modal-backdrop z-modal-top" role="dialog" aria-modal="true" aria-labelledby="web-paused-title">
      <div className="landing-card" style={{ textAlign: 'center', maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="landing-logo-icon">📱</div>
        <h1 id="web-paused-title" style={{ marginTop: 'var(--space-4)' }}>Wuzz Chat Kini Hadir di Aplikasi</h1>
        <p style={{ color: 'var(--text-muted)', marginTop: 'var(--space-3)' }}>
          Versi web sedang dijeda sementara karena kami fokus menyempurnakan aplikasi mobile. Akun dan riwayat chat Anda
          tetap sama, cukup login di aplikasi.
        </p>
        <div
          role="note"
          style={{
            marginTop: 'var(--space-5)',
            padding: 'var(--space-3) var(--space-4)',
            textAlign: 'left',
            fontSize: '0.8125rem',
            lineHeight: 1.6,
            color: 'var(--text-secondary)',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-strong)',
            borderRadius: 'var(--radius-md, 12px)',
          }}
        >
          <strong>Sebelumnya memasang aplikasi dari file APK (bukan Play Store)?</strong> Versi itu tidak bisa diperbarui lewat
          Play Store karena tanda tangannya berbeda. <strong>Uninstall dulu</strong> sebelum memasang dari Play Store, dari semua
          profil pengguna di HP Anda (termasuk profil lain/Tamu bila ada). Riwayat chat lama di perangkat tidak ikut terbawa.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
          <a className="btn btn-primary" style={{ justifyContent: 'center' }} href={APP_DOWNLOAD_URL} rel="noopener noreferrer">
            ⬇️ Dapatkan di Google Play
          </a>
          {hasSession && (
            <Link className="btn btn-secondary" style={{ justifyContent: 'center' }} href="/transfer/share">
              🔑 Pindahkan Kunci Chat ke Aplikasi
            </Link>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginTop: 'var(--space-5)', textAlign: 'left', fontSize: '0.8125rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
          <details>
            <summary style={{ cursor: 'pointer', color: 'var(--text-secondary)', fontWeight: 600 }}>Tips keamanan</summary>
            <ul style={{ marginTop: 'var(--space-2)', paddingLeft: 'var(--space-5)' }}>
              <li>Pasang aplikasi <strong>hanya dari tombol di halaman ini</strong> atau dengan mencari “Wuzz Chat” di Google Play. Jangan pakai file APK Wuzz Chat dari link, grup, atau situs lain.</li>
              <li>Izin yang diminta hanya yang dipakai fitur chat: notifikasi, kamera (pindai QR), dan mikrofon (pesan suara/panggilan).</li>
              <li>Jangan pernah membagikan kode QR atau token transfer kunci kepada siapa pun.</li>
            </ul>
          </details>
          <details>
            <summary style={{ cursor: 'pointer', color: 'var(--text-secondary)', fontWeight: 600 }}>Cara instal</summary>
            <ol style={{ marginTop: 'var(--space-2)', paddingLeft: 'var(--space-5)' }}>
              <li>Jika sebelumnya memasang dari file APK, <strong>uninstall dulu</strong> aplikasi lama dari semua profil pengguna di HP Anda.</li>
              <li>Ketuk <strong>Dapatkan di Google Play</strong>, lalu ketuk <strong>Instal</strong> di halaman Play Store.</li>
              <li>Buka Wuzz Chat dan login dengan akun Anda. Jika muncul layar konflik kunci, pilih <strong>Reset Kunci</strong> dan masukkan kata sandi.</li>
            </ol>
          </details>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: 'var(--space-4)' }}>
          Saat ini tersedia untuk Android.
        </p>
      </div>
    </div>
  )
}
