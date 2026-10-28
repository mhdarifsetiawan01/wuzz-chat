import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { APP_DOWNLOAD_URL, IS_WEB_PAUSED } from '@/lib/app-download'

// Kode tautan pendek (8 karakter tanpa 0/O/1/l/I); ID ruang selalu berawalan grp_/sub_/dm_ sehingga tidak bisa tertukar.
const SHORT_CODE_PATTERN = /^[2-9a-hj-km-np-zA-HJ-NP-Z]{8}$/

interface LinkPreview {
  title: string
  avatar_url: string
}

// Terjemahkan kode pendek ke ID ruang lewat backend; null bila tidak dikenal atau backend tak terjangkau.
// preview (nama + avatar) hanya ada untuk grup publik.
async function resolveShortCode(code: string): Promise<{ roomId: string; preview: LinkPreview | null } | null> {
  const base = process.env.BACKEND_API_URL || process.env.BACKEND_URL || 'http://localhost:8080'
  try {
    // Teruskan IP pengunjung: tanpa ini backend melihat IP server web dan semua pengunjung berbagi satu jatah rate limit
    const incoming = await headers()
    const fwd: Record<string, string> = {}
    const xff = incoming.get('x-forwarded-for')
    if (xff) fwd['X-Forwarded-For'] = xff
    const res = await fetch(`${base}/api/links/${encodeURIComponent(code)}`, { cache: 'no-store', headers: fwd, signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null
    const data = (await res.json()) as { room_id?: string; preview?: LinkPreview }
    return data.room_id ? { roomId: data.room_id, preview: data.preview ?? null } : null
  } catch {
    return null
  }
}

// Avatar grup: emoji (`emoji:🔥`), foto (hanya https atau path relatif; skema lain diabaikan), atau inisial.
function GroupAvatar({ title, avatarUrl }: { title: string; avatarUrl: string }) {
  const size = 88
  const base = {
    width: size,
    height: size,
    borderRadius: '50%',
    margin: '0 auto',
  } as const
  if (avatarUrl.startsWith('https://') || (avatarUrl.startsWith('/') && !avatarUrl.startsWith('//'))) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={avatarUrl} alt={title} style={{ ...base, display: 'block', objectFit: 'cover' }} />
  }
  const glyph = avatarUrl.startsWith('emoji:') ? avatarUrl.slice('emoji:'.length) : Array.from(title.trim())[0]?.toUpperCase() || '👥'
  return (
    <div
      aria-label={title}
      style={{ ...base, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem', background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)' }}
    >
      {glyph}
    </div>
  )
}

// Landing deep link grup/room: web dijeda -> ajak buka di aplikasi, normal -> redirect ke web chat.
export default async function OpenInAppLanding({ scheme, roomId }: { scheme: 'g' | 'sub' | 'room'; roomId: string }) {
  let id = decodeURIComponent(roomId)
  let preview: LinkPreview | null = null
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
    id = resolved.roomId
    preview = resolved.preview
  }
  if (!IS_WEB_PAUSED) redirect(`/chat?room=${encodeURIComponent(id)}`)

  return (
    <main className="landing-page">
      <div className="landing-card" style={{ textAlign: 'center' }}>
        {preview ? <GroupAvatar title={preview.title} avatarUrl={preview.avatar_url} /> : <div className="landing-logo-brand"></div>}
        <h1 style={{ marginTop: 'var(--space-4)' }}>{preview?.title ? preview.title : 'Anda diundang ke WuzzChat'}</h1>
        <p style={{ color: 'var(--text-muted)', marginTop: 'var(--space-2)' }}>
          {preview?.title
            ? 'Anda diundang bergabung ke grup ini di WuzzChat. Buka tautan ini di aplikasi untuk bergabung.'
            : 'Buka tautan ini di aplikasi WuzzChat untuk bergabung ke obrolan.'}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginTop: 'var(--space-6)' }}>
          <a className="btn-primary" href={`wuzzchat://${scheme}/${encodeURIComponent(id)}`}>Buka di Aplikasi WuzzChat</a>
          <a className="btn-secondary" href={APP_DOWNLOAD_URL} rel="noopener noreferrer">Belum punya aplikasi? Download</a>
        </div>
      </div>
    </main>
  )
}
