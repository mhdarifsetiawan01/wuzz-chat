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
          <strong>Sudah pernah memasang aplikasi sebelumnya?</strong> Jika versinya di bawah <strong>1.13.0 (Build 19)</strong>,
          Anda <strong>wajib uninstall dulu</strong> sebelum memasang versi ini. Tanpa itu, instalasi akan gagal dengan pesan
          “Aplikasi tidak terpasang” (App not installed). Cek versi di <strong>Pengaturan</strong>, bagian bawah halaman.
          Riwayat chat lama di perangkat tidak ikut terbawa.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
          <a className="btn btn-primary" style={{ justifyContent: 'center' }} href={APP_DOWNLOAD_URL} rel="noopener noreferrer">
            ⬇️ Download Aplikasi Android
          </a>
          {hasSession && (
            <Link className="btn btn-secondary" style={{ justifyContent: 'center' }} href="/transfer/share">
              🔑 Pindahkan Kunci Chat ke Aplikasi
            </Link>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginTop: 'var(--space-5)', textAlign: 'left', fontSize: '0.8125rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
          <details>
            <summary style={{ cursor: 'pointer', color: 'var(--text-secondary)', fontWeight: 600 }}>Kenapa tidak lewat Play Store?</summary>
            <p style={{ marginTop: 'var(--space-2)' }}>
              Aplikasi masih tahap uji coba dan belum dirilis di Play Store. Karena itu, untuk sementara file instalasi (APK)
              dibagikan langsung. Saat sudah tersedia di Play Store, tombol ini akan kami arahkan ke sana.
            </p>
          </details>
          <details>
            <summary style={{ cursor: 'pointer', color: 'var(--text-secondary)', fontWeight: 600 }}>Apakah aman? Tips mengunduh APK</summary>
            <ul style={{ marginTop: 'var(--space-2)', paddingLeft: 'var(--space-5)' }}>
              <li>Unduh <strong>hanya dari tombol di halaman ini</strong> (chat.wuzzhub.id). Jangan pakai APK Wuzz Chat dari link, grup, atau situs lain.</li>
              <li>Android akan menampilkan peringatan standar untuk semua aplikasi di luar Play Store. Itu normal, bukan berarti file berbahaya.</li>
              <li>Izin yang diminta hanya yang dipakai fitur chat: notifikasi, kamera (pindai QR), dan mikrofon (pesan suara/panggilan).</li>
              <li>Jangan pernah membagikan kode QR atau token transfer kunci kepada siapa pun.</li>
            </ul>
          </details>
          <details>
            <summary style={{ cursor: 'pointer', color: 'var(--text-secondary)', fontWeight: 600 }}>Cara instal</summary>
            <ol style={{ marginTop: 'var(--space-2)', paddingLeft: 'var(--space-5)' }}>
              <li>Jika sebelumnya sudah ada WuzzChat versi di bawah 1.13.0 (Build 19), <strong>uninstall dulu</strong> dari semua profil pengguna di HP Anda (termasuk profil lain/Tamu bila ada).</li>
              <li>Ketuk <strong>Download Aplikasi Android</strong>, lalu buka file yang terunduh.</li>
              <li>Jika diminta, aktifkan <strong>Izinkan dari sumber ini</strong> untuk browser Anda.</li>
              <li>Ketuk <strong>Instal</strong>. Jika Play Protect menampilkan peringatan, pilih <strong>Tetap instal</strong>.</li>
              <li>Buka WuzzChat dan login dengan akun Anda. Jika muncul layar konflik kunci, pilih <strong>Reset Kunci</strong> dan masukkan kata sandi.</li>
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
