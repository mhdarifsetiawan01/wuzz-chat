'use client'

import { useState, useRef, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'

function LandingPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const defaultRoom = searchParams.get('room') || searchParams.get('peer') || ''
  const { user, isLoading: isAuthLoading } = useAuth()

  // Jika sudah login, langsung alihkan ke /chat
  useEffect(() => {
    if (!isAuthLoading && user) {
      router.replace(defaultRoom ? `/chat?room=${encodeURIComponent(defaultRoom)}` : '/chat')
    }
  }, [user, isAuthLoading, router, defaultRoom])

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

  const loginUrl = defaultRoom ? `/login?room=${encodeURIComponent(defaultRoom)}` : '/login'
  const registerUrl = defaultRoom ? `/register?room=${encodeURIComponent(defaultRoom)}` : '/register'

  return (
    <main className="landing-page">
      <div className="landing-card">
        {/* Logo */}
        <div className="landing-logo">
          <div className="landing-logo-icon">💬</div>
          <h1>Wuzz Chat</h1>
        </div>
        <p className="landing-subtitle" style={{ marginBottom: 'var(--space-6)' }}>
          Aplikasi perpesanan instan real-time dengan enkripsi cepat, status tanda terima pesan lengkap, dan sinkronisasi cloud.
        </p>

        {defaultRoom && (
          <div style={{
            background: 'var(--accent-glow)',
            border: '1px solid var(--accent-500)',
            color: 'var(--text-primary)',
            padding: 'var(--space-3)',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.875rem',
            marginBottom: 'var(--space-5)',
            textAlign: 'center',
          }}>
            📨 Anda diundang untuk bergabung ke obrolan: <strong>{defaultRoom}</strong>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <button
            type="button"
            onClick={() => router.push(loginUrl)}
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center' }}
          >
            🔑 Masuk ke Akun →
          </button>
          <button
            type="button"
            onClick={() => router.push(registerUrl)}
            className="btn btn-secondary"
            style={{ width: '100%', justifyContent: 'center' }}
          >
            ✨ Buat Akun Baru
          </button>
        </div>

        <div style={{ marginTop: 'var(--space-6)', textAlign: 'center', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
          Wuzz Chat Platform • Real-time • Safe & Fast
        </div>
      </div>
    </main>
  )
}

export default function LandingPage() {
  return (
    <Suspense fallback={
      <main className="landing-page">
        <div className="landing-card" style={{ textAlign: 'center', padding: 'var(--space-8)' }}>
          <div className="landing-logo-icon" style={{ animation: 'spin 1.5s linear infinite' }}>💬</div>
          <p style={{ color: 'var(--text-muted)', marginTop: 'var(--space-4)' }}>Memuat...</p>
        </div>
      </main>
    }>
      <LandingPageContent />
    </Suspense>
  )
}

