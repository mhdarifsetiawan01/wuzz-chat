'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { apiRequest } from '@/lib/api'
import type { User } from '@/lib/types'
import { APP_DOWNLOAD_URL } from '@/lib/app-download'

function ProfileLinkContent() {
  const router = useRouter()
  const params = useParams<{ username: string }>()
  const username = decodeURIComponent(params.username || '').replace(/^@/, '').trim()
  const { user, isLoading: isAuthLoading } = useAuth()

  const [profile, setProfile] = useState<User | null>(null)
  const [error, setError] = useState('')
  const [isStarting, setIsStarting] = useState(false)

  const appLink = `wuzzchat://u/${encodeURIComponent(username)}`
  const nextPath = `/u/${encodeURIComponent(username)}`

  // Ambil profil publik hanya jika sudah login (endpoint profil membutuhkan JWT)
  useEffect(() => {
    if (isAuthLoading || !user || !username) return
    let cancelled = false
    apiRequest<User>(`/api/users/profile?username=${encodeURIComponent(username)}`).then((res) => {
      if (cancelled) return
      if (res.data) setProfile(res.data)
      else setError(res.status === 404 ? 'Pengguna tidak ditemukan.' : 'Gagal memuat profil. Coba lagi.')
    })
    return () => {
      cancelled = true
    }
  }, [user, isAuthLoading, username])

  const startChat = async () => {
    if (!profile) return
    if (profile.id === user?.id) {
      router.push('/chat')
      return
    }
    setIsStarting(true)
    const res = await apiRequest<{ room_id: string }>('/api/conversations', {
      method: 'POST',
      body: JSON.stringify({ target_user_id: profile.id }),
    })
    setIsStarting(false)
    if (res.data?.room_id) router.push(`/chat?room=${encodeURIComponent(res.data.room_id)}`)
    else setError('Gagal memulai obrolan. Coba lagi.')
  }

  if (isAuthLoading) {
    return (
      <main className="landing-page">
        <div className="landing-card" style={{ textAlign: 'center', padding: 'var(--space-8)' }}>
          <div className="landing-logo-icon" style={{ animation: 'spin 1.5s linear infinite' }}>💬</div>
          <p style={{ color: 'var(--text-muted)', marginTop: 'var(--space-4)' }}>Memeriksa sesi akun...</p>
        </div>
      </main>
    )
  }

  return (
    <main className="landing-page">
      <div className="landing-card" style={{ textAlign: 'center' }}>
        <div className="landing-logo-icon">💬</div>
        <h1 style={{ marginTop: 'var(--space-4)' }}>
          {profile?.display_name || `@${username}`}
        </h1>
        <p style={{ color: 'var(--text-muted)', marginTop: 'var(--space-2)' }}>
          {profile ? `@${profile.username}` : 'mengundang Anda mengobrol di WuzzChat'}
        </p>
        {profile?.status_message && (
          <p style={{ marginTop: 'var(--space-2)' }}>{profile.status_message}</p>
        )}
        {error && (
          <p role="alert" style={{ color: 'var(--text-muted)', marginTop: 'var(--space-4)' }}>{error}</p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginTop: 'var(--space-6)' }}>
          {user ? (
            <button className="btn-primary" onClick={startChat} disabled={!profile || isStarting}>
              {isStarting ? 'Membuka obrolan...' : 'Mulai Obrolan'}
            </button>
          ) : (
            <>
              <Link className="btn-primary" href={`/login?redirect=${encodeURIComponent(nextPath)}`}>
                Masuk untuk Mengobrol
              </Link>
              <Link className="btn-secondary" href={`/register?redirect=${encodeURIComponent(nextPath)}`}>
                Buat Akun Baru
              </Link>
            </>
          )}
          <a className="btn-secondary" href={appLink}>Buka di Aplikasi WuzzChat</a>
          <a className="btn-secondary" href={APP_DOWNLOAD_URL} rel="noopener noreferrer">Belum punya aplikasi? Download</a>
        </div>
      </div>
    </main>
  )
}

export default function ProfileLinkPage() {
  return (
    <Suspense fallback={null}>
      <ProfileLinkContent />
    </Suspense>
  )
}
