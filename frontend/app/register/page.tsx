'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { apiRequest } from '@/lib/api'

export default function RegisterPage() {
  const router = useRouter()
  const { user, isLoading: isAuthLoading, login } = useAuth()
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  // Redirect ke /chat jika sudah login
  useEffect(() => {
    if (!isAuthLoading && user) {
      router.replace('/chat')
    }
  }, [user, isAuthLoading, router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !password) {
      setError('Username dan password wajib diisi')
      return
    }

    if (username.length < 3) {
      setError('Username minimal 3 karakter')
      return
    }

    if (password.length < 4) {
      setError('Password minimal 4 karakter')
      return
    }

    setError('')
    setIsLoading(true)

    const { data, error: err } = await apiRequest<{ token: string; user: any }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        username: username.trim(),
        display_name: displayName.trim() || username.trim(),
        password,
      }),
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
          Buat Akun Baru
        </h2>
        <p className="landing-subtitle" style={{ marginBottom: 'var(--space-6)' }}>
          Daftar akun gratis untuk menyimpan kontak dan obrolan permanen.
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
              Username <span style={{ color: 'var(--color-error)' }}>*</span>
            </label>
            <input
              id="username"
              className="form-input"
              type="text"
              placeholder="misal: alice99"
              value={username}
              onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
              autoComplete="username"
              required
              autoFocus
            />
            <p className="form-hint">Hanya huruf kecil, angka, dan underscore.</p>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="displayName">
              Nama Tampilan (Display Name)
            </label>
            <input
              id="displayName"
              className="form-input"
              type="text"
              placeholder="misal: Alice Wonder"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              autoComplete="name"
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="password">
              Password <span style={{ color: 'var(--color-error)' }}>*</span>
            </label>
            <input
              id="password"
              className="form-input"
              type="password"
              placeholder="minimal 4 karakter"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>

          <button
            className="btn btn-primary"
            type="submit"
            disabled={isLoading}
            style={{ marginTop: 'var(--space-4)', width: '100%' }}
          >
            {isLoading ? 'Mendaftarkan...' : 'Daftar Akun →'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 'var(--space-6)', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
          Sudah punya akun?{' '}
          <Link href="/login" style={{ color: 'var(--accent-400)', fontWeight: 500 }}>
            Masuk di sini
          </Link>
        </div>
      </div>
    </main>
  )
}
