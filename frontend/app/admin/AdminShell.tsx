'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  adminLogin,
  adminLogout,
  clearAdminToken,
  decodeClaims,
  getAdminToken,
  isStaffToken,
  setAdminToken,
} from '@/lib/admin-api'

interface AdminSession {
  username: string
  role: string
  // Dipanggil halaman saat API menjawab 401 (sesi habis atau dicabut).
  expire: () => void
}

const AdminSessionContext = createContext<AdminSession | null>(null)

export function useAdminSession(): AdminSession {
  const ctx = useContext(AdminSessionContext)
  if (!ctx) throw new Error('useAdminSession harus dipakai di dalam AdminShell')
  return ctx
}

type Phase = 'loading' | 'anon' | 'ready'

// Kerangka seluruh /admin: masuk khusus moderator, lalu header + isi halaman. Tidak memakai sesi chat sama sekali.
export default function AdminShell({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<Phase>('loading')
  const [username, setUsername] = useState('')
  const [role, setRole] = useState('')
  const [notice, setNotice] = useState('')
  const pathname = usePathname() || ''

  useEffect(() => {
    const token = getAdminToken()
    if (token && isStaffToken(token)) {
      const c = decodeClaims(token)
      setUsername(c?.username || '')
      setRole(c?.system_role || '')
      setPhase('ready')
    } else {
      if (token) clearAdminToken()
      setPhase('anon')
    }
  }, [])

  const expire = useCallback(() => {
    clearAdminToken()
    setNotice('Sesi berakhir, silakan masuk lagi.')
    setPhase('anon')
  }, [])

  const onLoggedIn = (token: string) => {
    const c = decodeClaims(token)
    setAdminToken(token)
    setUsername(c?.username || '')
    setRole(c?.system_role || '')
    setNotice('')
    setPhase('ready')
  }

  const logout = async () => {
    await adminLogout()
    setNotice('')
    setPhase('anon')
  }

  if (phase === 'loading') {
    return (
      <div className="adm-page">
        <p className="adm-muted adm-center-note">Memuat…</p>
      </div>
    )
  }

  if (phase === 'anon') {
    return (
      <div className="adm-page">
        <LoginCard notice={notice} onLoggedIn={onLoggedIn} />
      </div>
    )
  }

  return (
    <AdminSessionContext.Provider value={{ username, role, expire }}>
      <div className="adm-page">
        <header className="adm-header">
          <Link href="/admin/reports" className="adm-brand">
            Wuzz Chat <span className="adm-brand-sub">Moderasi</span>
          </Link>
          <div className="adm-header-user">
            <span className="adm-muted">
              {username} · {role === 'wuzz_admin' ? 'Admin' : 'Moderator'}
            </span>
            <button type="button" className="btn adm-link-btn" onClick={logout}>
              Keluar
            </button>
          </div>
        </header>
        <nav className="adm-nav" aria-label="Menu moderasi">
          <Link href="/admin/reports" className={pathname.startsWith('/admin/reports') ? 'is-active' : ''}>Laporan</Link>
          {/* Hanya tampilan; backend menolak non-admin di /api/admin/staff. */}
          {role === 'wuzz_admin' && (
            <Link href="/admin/staff" className={pathname.startsWith('/admin/staff') ? 'is-active' : ''}>Moderator</Link>
          )}
        </nav>
        <main className="adm-main">{children}</main>
      </div>
    </AdminSessionContext.Provider>
  )
}

function LoginCard({ notice, onLoggedIn }: { notice: string; onLoggedIn: (token: string) => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy || !username.trim() || !password) return
    setBusy(true)
    setError('')
    const res = await adminLogin(username, password)
    setBusy(false)
    if (res.status === 401) {
      setError('Username atau password salah.')
      return
    }
    if (res.status === 403) {
      setError(res.code === 'ACCOUNT_SUSPENDED' ? 'Akun ini ditangguhkan.' : 'Akun ini belum bisa dipakai. Selesaikan penautan Google di aplikasi.')
      return
    }
    if (!res.data?.token) {
      setError(res.error || 'Gagal masuk, coba lagi.')
      return
    }
    // Pemeriksaan di sini hanya agar pesan jelas; backend tetap menolak non-staf di setiap endpoint.
    if (!isStaffToken(res.data.token)) {
      setError('Akun ini bukan moderator.')
      return
    }
    onLoggedIn(res.data.token)
  }

  return (
    <form className="adm-login-card" onSubmit={submit} aria-labelledby="adm-login-title">
      <h1 id="adm-login-title" className="adm-title">Masuk Moderator</h1>
      <p className="adm-muted">Khusus staf Wuzz Chat. Sesi ini terpisah dari aplikasi chat dan berakhir saat tab ditutup.</p>
      {notice && <div className="adm-alert adm-alert-warn" role="status">{notice}</div>}
      {error && <div className="adm-alert adm-alert-error" role="alert">{error}</div>}
      <div className="form-group">
        <label className="form-label" htmlFor="adm-username">Username</label>
        <input
          id="adm-username"
          className="form-input"
          autoComplete="username"
          autoCapitalize="none"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="adm-password">Password</label>
        <input
          id="adm-password"
          className="form-input"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <button type="submit" className="btn btn-primary adm-block" disabled={busy || !username.trim() || !password}>
        {busy ? 'Memeriksa…' : 'Masuk'}
      </button>
    </form>
  )
}
