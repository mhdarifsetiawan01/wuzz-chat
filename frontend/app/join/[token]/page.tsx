import type { Metadata } from 'next'
import { APP_DOWNLOAD_URL } from '@/lib/app-download'

// Token undangan grup privat: 16 karakter dari alfabet tautan pendek (tanpa 0/O/1/l/I).
const INVITE_TOKEN_PATTERN = /^[2-9a-km-np-zA-HJ-NP-Z]{16}$/

// Token adalah rahasia: jangan diindeks, dan jangan bocor lewat header Referer saat pengunjung mengetuk tautan unduh.
export const metadata: Metadata = {
  title: 'Undangan Grup — WuzzChat',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

// Landing tautan undangan grup privat (https://chat.wuzzhub.id/join/<token>, V2 Tahap 1).
// Sengaja tanpa pratinjau dan tanpa panggilan ke backend: nama grup hanya ditampilkan di aplikasi untuk pengguna yang
// sudah login (keputusan D2), dan halaman ini tidak boleh membedakan token yang berlaku dari yang tidak.
// Undangan hanya bisa diproses di aplikasi, jadi halaman ini juga tidak mengarah ke web chat saat web tidak dijeda.
export default async function JoinInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token: raw } = await params
  const token = decodeURIComponent(raw).trim()

  if (!INVITE_TOKEN_PATTERN.test(token)) {
    return (
      <main className="landing-page">
        <div className="landing-card" style={{ textAlign: 'center' }}>
          <div className="landing-logo-brand"></div>
          <h1 style={{ marginTop: 'var(--space-4)' }}>Tautan undangan tidak valid</h1>
          <p style={{ color: 'var(--text-muted)', marginTop: 'var(--space-2)' }}>
            Tautan ini tidak lengkap atau rusak. Minta tautan baru kepada admin grup.
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="landing-page">
      <div className="landing-card" style={{ textAlign: 'center' }}>
        <div className="landing-logo-brand"></div>
        <h1 style={{ marginTop: 'var(--space-4)' }}>Anda diundang ke grup privat</h1>
        <p style={{ color: 'var(--text-muted)', marginTop: 'var(--space-2)' }}>
          Buka tautan ini di aplikasi WuzzChat untuk melihat grupnya dan mengajukan bergabung. Admin grup akan meninjau
          permohonan Anda.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginTop: 'var(--space-6)' }}>
          <a className="btn-primary" href={`wuzzchat://join/${encodeURIComponent(token)}`}>Buka di Aplikasi WuzzChat</a>
          <a className="btn-secondary" href={APP_DOWNLOAD_URL} rel="noopener noreferrer">Belum punya aplikasi? Download</a>
        </div>
        <p className="u-text-sm" style={{ color: 'var(--text-muted)', marginTop: 'var(--space-4)' }}>
          Sudah memasang aplikasi tetapi tautan tidak terbuka? Perbarui WuzzChat ke versi terbaru dari Google Play.
        </p>
      </div>
    </main>
  )
}
