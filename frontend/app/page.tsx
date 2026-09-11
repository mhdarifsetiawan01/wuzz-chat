'use client'

import { useState, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

function LandingPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const defaultRoom = searchParams.get('room') || searchParams.get('peer') || ''

  const [nickname, setNickname] = useState('')
  const [roomId, setRoomId] = useState(defaultRoom)
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

  const generateRandomRoom = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault()
      e.stopPropagation()
    }
    const topics = ['kopi', 'santai', 'project', 'gaming', 'diskusi', 'secret', 'room']
    const randomNum = Math.floor(1000 + Math.random() * 9000)
    const newRoom = `${topics[Math.floor(Math.random() * topics.length)]}-${randomNum}`
    setRoomId(newRoom)
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

    // Bersihkan jika user mem-paste link URL penuh
    let cleanRoom = roomId.trim()
    if (cleanRoom.includes('room=') || cleanRoom.includes('peer=')) {
      try {
        const parsed = new URL(cleanRoom.startsWith('http') ? cleanRoom : `http://localhost/${cleanRoom}`)
        cleanRoom = parsed.searchParams.get('room') || parsed.searchParams.get('peer') || cleanRoom
      } catch {}
    } else if (cleanRoom.startsWith('http')) {
      try {
        const parsed = new URL(cleanRoom)
        cleanRoom = parsed.searchParams.get('room') || parsed.searchParams.get('peer') || cleanRoom
      } catch {}
    }

    const activeRoom = cleanRoom || `room-${Math.floor(1000 + Math.random() * 9000)}`

    try {
      sessionStorage.setItem('wuzz_nickname', trimmedNick)
      const targetUrl = `/chat?room=${encodeURIComponent(activeRoom)}`

      router.push(targetUrl)

      setTimeout(() => {
        if (window.location.pathname !== '/chat') {
          window.location.href = targetUrl
        }
      }, 300)
    } catch (err) {
      console.error('Navigation error:', err)
      const targetUrl = `/chat?room=${encodeURIComponent(activeRoom)}`
      window.location.href = targetUrl
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
          Chat real-time berbasis WebSocket & Supabase. Riwayat chat otomatis tersimpan di cloud.
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

          {/* Kode Room / Obrolan */}
          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label className="form-label" htmlFor="roomId">
                Kode Room / Obrolan <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(opsional)</span>
              </label>
              <button
                type="button"
                onClick={generateRandomRoom}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--accent-400)',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  padding: '2px 4px',
                }}
                title="Buat kode room baru"
              >
                🔄 Kode Baru
              </button>
            </div>
            <input
              id="roomId"
              className="form-input"
              type="text"
              placeholder="misal: room-kopi atau biarkan kosong"
              value={roomId}
              onChange={e => setRoomId(e.target.value)}
              autoComplete="off"
            />
            <p className="form-hint">
              Kosongkan untuk membuat room baru otomatis, atau masukkan kode room temanmu untuk bergabung.
            </p>
          </div>

          <button
            className="btn btn-primary"
            type="submit"
            id="connect-btn"
            disabled={isLoading}
            style={{ marginTop: 'var(--space-2)' }}
          >
            {isLoading ? 'Menghubungkan...' : 'Mulai Chat sebagai Tamu →'}
          </button>
        </form>

        <div className="form-divider">atau</div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            onClick={() => router.push('/login')}
            className="btn btn-secondary"
            style={{ flex: 1, padding: 'var(--space-2) var(--space-3)', fontSize: '0.875rem' }}
          >
            🔑 Masuk Akun
          </button>
          <button
            type="button"
            onClick={() => router.push('/register')}
            className="btn btn-secondary"
            style={{ flex: 1, padding: 'var(--space-2) var(--space-3)', fontSize: '0.875rem' }}
          >
            ✨ Daftar Baru
          </button>
        </div>
      </div>
    </main>
  )
}

export default function LandingPage() {
  return (
    <Suspense fallback={<div className="landing-page">Memuat...</div>}>
      <LandingPageContent />
    </Suspense>
  )
}
