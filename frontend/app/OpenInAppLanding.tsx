import { redirect } from 'next/navigation'
import { APP_DOWNLOAD_URL, IS_WEB_PAUSED } from '@/lib/app-download'

// Landing deep link grup/room: web dijeda -> ajak buka di aplikasi, normal -> redirect ke web chat.
export default function OpenInAppLanding({ scheme, roomId }: { scheme: 'g' | 'sub' | 'room'; roomId: string }) {
  const id = decodeURIComponent(roomId)
  if (!IS_WEB_PAUSED) redirect(`/chat?room=${encodeURIComponent(id)}`)

  return (
    <main className="landing-page">
      <div className="landing-card" style={{ textAlign: 'center' }}>
        <div className="landing-logo-brand"></div>
        <h1 style={{ marginTop: 'var(--space-4)' }}>Anda diundang ke WuzzChat</h1>
        <p style={{ color: 'var(--text-muted)', marginTop: 'var(--space-2)' }}>
          Buka tautan ini di aplikasi WuzzChat untuk bergabung ke obrolan.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginTop: 'var(--space-6)' }}>
          <a className="btn-primary" href={`wuzzchat://${scheme}/${encodeURIComponent(id)}`}>Buka di Aplikasi WuzzChat</a>
          <a className="btn-secondary" href={APP_DOWNLOAD_URL} rel="noopener noreferrer">Belum punya aplikasi? Download</a>
        </div>
      </div>
    </main>
  )
}
