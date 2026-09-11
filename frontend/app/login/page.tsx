'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { apiRequest } from '@/lib/api'

export default function LoginPage() {
  const router = useRouter()
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

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
      router.push('/chat')
    }
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
            background: 'rgba(239, 68, 68, 0.1)',
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
          <div style={{ marginTop: 'var(--space-2)' }}>
            <Link href="/" style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>
              ← Masuk sebagai Tamu Anonim
            </Link>
          </div>
        </div>
      </div>
    </main>
  )
}
