'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { apiRequest } from '@/lib/api'

function LoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const isExpired = searchParams.get('expired') === '1'
  const redirectRoom = searchParams.get('room') || ''
  const redirectUrl = searchParams.get('redirect') || ''

  const { user, isLoading: isAuthLoading, login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(isExpired ? '⚠️ Sesi Anda telah berakhir. Silakan masuk kembali.' : '')
  const [isLoading, setIsLoading] = useState(false)

  // Redirect ke /chat (atau URL tujuan) jika sudah terautentikasi
  useEffect(() => {
    if (!isAuthLoading && user) {
      if (redirectUrl) {
        router.replace(redirectUrl)
      } else {
        router.replace(redirectRoom ? `/chat?room=${encodeURIComponent(redirectRoom)}` : '/chat')
      }
    }
  }, [user, isAuthLoading, router, redirectRoom, redirectUrl])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !password) {
      setError('Username dan password wajib diisi')
      return
    }

    setError('')
    setIsLoading(true)

    const { data, error: err } = await apiRequest<{ token: string; user: any }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: username.trim(), password }),
    })

    setIsLoading(false)

    if (err) {
      setError(err)
      return
    }

    if (data?.token && data?.user) {
      login(data.token, data.user)
      if (redirectUrl) {
        router.push(redirectUrl)
      } else {
        router.push(redirectRoom ? `/chat?room=${encodeURIComponent(redirectRoom)}` : '/chat')
      }
    }
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
      <div className="landing-card">
        <div className="landing-logo">
          <div className="landing-logo-icon">💬</div>
          <h1>Wuzz Chat</h1>
        </div>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '4px', color: 'var(--text-primary)' }}>
          Masuk ke Akun
        </h2>
        <p className="landing-subtitle" style={{ marginBottom: 'var(--space-6)' }}>
          Lanjutkan obrolan kamu dengan kontak & grup di Wuzz Chat.
        </p>

        {error && (
          <div style={{
            background: 'var(--tint-error-10)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: 'var(--color-error)',
            padding: 'var(--space-3)',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.875rem',
            marginBottom: 'var(--space-4)',
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div className="form-group">
            <label className="form-label" htmlFor="username">
              Username
            </label>
            <input
              id="username"
              className="form-input"
              type="text"
              placeholder="masukkan username kamu"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoComplete="username"
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              className="form-input"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          <button
            className="btn btn-primary"
            type="submit"
            disabled={isLoading}
            style={{ marginTop: 'var(--space-4)', width: '100%' }}
          >
            {isLoading ? 'Memproses...' : 'Masuk Sekarang →'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 'var(--space-6)', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
          Belum punya akun?{' '}
          <Link href="/register" style={{ color: 'var(--accent-400)', fontWeight: 500 }}>
            Daftar di sini
          </Link>
        </div>
      </div>
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <main className="landing-page">
        <div className="landing-card" style={{ textAlign: 'center', padding: 'var(--space-8)' }}>
          <div className="landing-logo-icon" style={{ animation: 'spin 1.5s linear infinite' }}>💬</div>
          <p style={{ color: 'var(--text-muted)', marginTop: 'var(--space-4)' }}>Memuat...</p>
        </div>
      </main>
    }>
      <LoginContent />
    </Suspense>
  )
}

