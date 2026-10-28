import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { APP_DOWNLOAD_URL, IS_WEB_PAUSED } from '@/lib/app-download'

// Kode tautan pendek (8 karakter tanpa 0/O/1/l/I); ID ruang selalu berawalan grp_/sub_/dm_ sehingga tidak bisa tertukar.
const SHORT_CODE_PATTERN = /^[2-9a-hj-km-np-zA-HJ-NP-Z]{8}$/

// Terjemahkan kode pendek ke ID ruang lewat backend; null bila tidak dikenal atau backend tak terjangkau.
async function resolveShortCode(code: string): Promise<string | null> {
  const base = process.env.BACKEND_API_URL || process.env.BACKEND_URL || 'http://localhost:8080'
  try {
    // Teruskan IP pengunjung: tanpa ini backend melihat IP server web dan semua pengunjung berbagi satu jatah rate limit
    const incoming = await headers()
    const fwd: Record<string, string> = {}
    const xff = incoming.get('x-forwarded-for')
    if (xff) fwd['X-Forwarded-For'] = xff
    const res = await fetch(`${base}/api/links/${encodeURIComponent(code)}`, { cache: 'no-store', headers: fwd, signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null
    const data = (await res.json()) as { room_id?: string }
    return data.room_id || null
  } catch {
    return null
  }
}

// Landing deep link grup/room: web dijeda -> ajak buka di aplikasi, normal -> redirect ke web chat.
export default async function OpenInAppLanding({ scheme, roomId }: { scheme: 'g' | 'sub' | 'room'; roomId: string }) {
  let id = decodeURIComponent(roomId)
  if (SHORT_CODE_PATTERN.test(id)) {
    const resolved = await resolveShortCode(id)
    if (!resolved) {
      return (
        <main className="landing-page">
          <div className="landing-card" style={{ textAlign: 'center' }}>
            <div className="landing-logo-brand"></div>
            <h1 style={{ marginTop: 'var(--space-4)' }}>Tautan tidak ditemukan</h1>
            <p style={{ color: 'var(--text-muted)', marginTop: 'var(--space-2)' }}>
              Tautan grup ini tidak valid atau sudah tidak berlaku.
            </p>
          </div>
        </main>
      )
    }
    id = resolved
  }
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
