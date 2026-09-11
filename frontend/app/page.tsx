'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'

export default function LandingPage() {
  const router = useRouter()
  const [nickname, setNickname] = useState('')
  const [peerId, setPeerId] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const nicknameRef = useRef<HTMLInputElement>(null)

  const generateRandomNickname = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault()
      e.stopPropagation()
    }
    const adjectives = ['Happy', 'Swift', 'Silent', 'Clever', 'Brave', 'Cosmic', 'Chill', 'Wild', 'Super', 'Neon']
    const animals = ['Fox', 'Panda', 'Eagle', 'Otter', 'Wolf', 'Falcon', 'Tiger', 'Koala', 'Dragon', 'Cat']
    const randomNum = Math.floor(10 + Math.random() * 90)
    const randomName = `${adjectives[Math.floor(Math.random() * adjectives.length)]}${animals[Math.floor(Math.random() * animals.length)]}${randomNum}`
    
    setNickname(randomName)
    if (nicknameRef.current) {
      nicknameRef.current.value = randomName
      nicknameRef.current.focus()
    }
    setError('')
  }

  const handleConnect = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedNick = nickname.trim()
    if (!trimmedNick) {
      setError('⚠️ Silakan masukkan nickname kamu terlebih dahulu!')
      nicknameRef.current?.focus()
      return
    }

    setError('')
    setIsLoading(true)

    try {
      // Simpan nickname di sessionStorage
      sessionStorage.setItem('wuzz_nickname', trimmedNick)

      const query = peerId.trim() ? `?peer=${encodeURIComponent(peerId.trim())}` : ''
      const targetUrl = `/chat${query}`

      // Navigasi ke chat
      router.push(targetUrl)

      // Fallback navigation jika client-side router lambat
      setTimeout(() => {
        if (window.location.pathname !== '/chat') {
          window.location.href = targetUrl
        }
      }, 300)
    } catch (err) {
      console.error('Navigation error:', err)
      const query = peerId.trim() ? `?peer=${encodeURIComponent(peerId.trim())}` : ''
      window.location.href = `/chat${query}`
    }
  }

  return (
    <main className="landing-page">
      <div className="landing-card">
        {/* Logo */}
        <div className="landing-logo">
          <div className="landing-logo-icon">💬</div>
          <h1>Wuzz Chat</h1>
        </div>
        <p className="landing-subtitle">
          Chat real-time 1-on-1 menggunakan WebSocket. Masuk anonim, tidak ada akun diperlukan.
        </p>

        <form onSubmit={handleConnect} noValidate>
          {/* Nickname */}
          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label className="form-label" htmlFor="nickname">
                Nickname kamu <span style={{ color: 'var(--color-error)' }}>*</span>
              </label>
              <button
                type="button"
                onClick={generateRandomNickname}
                style={{
                  background: 'var(--accent-glow)',
                  border: '1px solid var(--accent-500)',
                  color: 'var(--accent-300)',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: '3px 8px',
                  borderRadius: 'var(--radius-sm)',
                  userSelect: 'none',
                }}
                title="Klik untuk mengisi nickname acak"
              >
                🎲 Buat Acak
              </button>
            </div>
            <input
              id="nickname"
              ref={nicknameRef}
              className={`form-input ${error ? 'input-error' : ''}`}
              type="text"
              placeholder="misal: Alice"
              value={nickname}
              onChange={e => {
                setNickname(e.target.value)
                if (error) setError('')
              }}
              maxLength={30}
              autoComplete="off"
              autoFocus
              required
            />
            {error && (
              <p style={{ color: 'var(--color-error)', fontSize: '0.8125rem', marginTop: '2px' }}>
                {error}
              </p>
            )}
          </div>

          {/* Peer ID (opsional) */}
          <div className="form-group">
            <label className="form-label" htmlFor="peerId">
              ID lawan chat <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(opsional)</span>
            </label>
            <input
              id="peerId"
              className="form-input"
              type="text"
              placeholder="UUID dari teman kamu"
              value={peerId}
              onChange={e => setPeerId(e.target.value)}
              autoComplete="off"
            />
            <p className="form-hint">
              Kosongkan jika belum punya. Kamu bisa share <code>ID Kamu</code> ke teman setelah connect.
            </p>
          </div>

          <button
            className="btn btn-primary"
            type="submit"
            id="connect-btn"
            disabled={isLoading}
            style={{ marginTop: 'var(--space-2)' }}
          >
            {isLoading ? 'Menghubungkan...' : 'Mulai Chat →'}
          </button>
        </form>
      </div>
    </main>
  )
}
