'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  ROLE_LABEL,
  StaffMember,
  grantModerator,
  listStaff,
  lookupStaff,
  revokeModerator,
} from '@/lib/admin-api'
import { useAdminSession } from '../AdminShell'

type Pending = { kind: 'grant' | 'revoke'; user: StaffMember }

const MAX_NOTE = 500

export default function StaffPage() {
  const { role, expire } = useAdminSession()
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const [username, setUsername] = useState('')
  const [searching, setSearching] = useState(false)
  const [found, setFound] = useState<StaffMember | null>(null)
  const [searchError, setSearchError] = useState('')

  const [pending, setPending] = useState<Pending | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')

  const isAdmin = role === 'wuzz_admin'

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const res = await listStaff()
    setLoading(false)
    if (res.status === 401) return expire()
    if (res.status === 403) return setError('Halaman ini khusus admin.')
    if (!res.data) return setError(res.error || 'Gagal memuat daftar staf.')
    setStaff(res.data.staff)
  }, [expire])

  useEffect(() => {
    if (isAdmin) load()
    else setLoading(false)
  }, [isAdmin, load])

  const search = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim() || searching) return
    setSearching(true)
    setSearchError('')
    setFound(null)
    setMessage('')
    const res = await lookupStaff(username)
    setSearching(false)
    if (res.status === 401) return expire()
    if (res.status === 404) return setSearchError('Pengguna dengan username itu tidak ditemukan.')
    if (!res.data) return setSearchError(res.error || 'Pencarian gagal.')
    setFound(res.data.user)
  }

  const confirm = async () => {
    if (!pending || busy) return
    setBusy(true)
    setActionError('')
    const fn = pending.kind === 'grant' ? grantModerator : revokeModerator
    const res = await fn(pending.user.id, note.trim())
    setBusy(false)
    if (res.status === 401) return expire()
    if (!res.data) {
      setActionError(res.error || 'Tindakan gagal.')
      return
    }
    setMessage(
      pending.kind === 'grant'
        ? `@${pending.user.username} sekarang moderator. Orang itu perlu login ulang di /admin agar peran baru terbaca.`
        : `Peran moderator @${pending.user.username} dicabut. Berlaku dalam beberapa detik.`,
    )
    setPending(null)
    setNote('')
    setFound(null)
    setUsername('')
    await load()
  }

  if (!isAdmin) {
    return (
      <section>
        <h1 className="adm-title">Moderator</h1>
        <div className="adm-alert adm-alert-warn" role="alert">Halaman ini khusus admin.</div>
      </section>
    )
  }

  return (
    <section aria-labelledby="adm-staff-title">
      <h1 id="adm-staff-title" className="adm-title">Moderator</h1>
      <p className="adm-muted">
        Admin dapat mengangkat dan mencabut moderator. Peran admin hanya bisa diubah lewat database. Perubahan dicatat di
        riwayat tindakan.
      </p>

      {message && <div className="adm-alert adm-alert-ok" role="status">{message}</div>}

      <div className="adm-card">
        <h2 className="adm-h2">Angkat moderator baru</h2>
        <form className="adm-inline-form" onSubmit={search}>
          <input
            className="form-input"
            aria-label="Username pengguna"
            placeholder="Username (tanpa @)"
            autoCapitalize="none"
            autoComplete="off"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <button type="submit" className="btn btn-secondary" disabled={searching || !username.trim()}>
            {searching ? 'Mencari…' : 'Cari'}
          </button>
        </form>
        {searchError && <div className="adm-alert adm-alert-error" role="alert">{searchError}</div>}
        {found && <FoundCard user={found} onGrant={() => { setActionError(''); setNote(''); setPending({ kind: 'grant', user: found }) }} />}
      </div>

      <div className="adm-card">
        <h2 className="adm-h2">Staf saat ini</h2>
        {error && <div className="adm-alert adm-alert-error" role="alert">{error}</div>}
        {loading && <p className="adm-muted">Memuat…</p>}
        <ul className="adm-list">
          {staff.map((m) => (
            <li key={m.id} className="adm-row">
              <div className="adm-staff-main">
                <span className="adm-staff-name">{m.display_name || m.username}</span>
                <span className="adm-muted adm-mono">@{m.username}</span>
                {!m.has_password && (
                  <span className="adm-muted">Akun Google saja: belum bisa masuk ke halaman admin ini.</span>
                )}
              </div>
              <div className="adm-row-side">
                <span className={`adm-badge ${m.system_role === 'wuzz_admin' ? 'adm-badge-warn' : 'adm-badge-muted'}`}>
                  {ROLE_LABEL[m.system_role] || m.system_role}
                </span>
                {m.suspended && <span className="adm-badge adm-badge-danger">Ditangguhkan</span>}
                {m.system_role === 'wuzz_moderator' && (
                  <button
                    type="button"
                    className="btn adm-btn-danger"
                    onClick={() => { setActionError(''); setNote(''); setPending({ kind: 'revoke', user: m }) }}
                  >
                    Cabut
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>

      {pending && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="adm-staff-confirm" onClick={(e) => e.target === e.currentTarget && !busy && setPending(null)}>
          <div className="modal-card-unified" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-unified">
              <h3 id="adm-staff-confirm" className="modal-title-unified">
                {pending.kind === 'grant' ? 'Angkat jadi moderator?' : 'Cabut peran moderator?'}
              </h3>
              <button type="button" className="modal-close-btn" onClick={() => !busy && setPending(null)} aria-label="Tutup" disabled={busy}>✕</button>
            </div>
            <div className="modal-body-unified">
              <p className="adm-pre"><strong>{pending.user.display_name || pending.user.username}</strong> (@{pending.user.username})</p>
              <p className="adm-muted">
                {pending.kind === 'grant'
                  ? 'Moderator dapat membaca laporan, menghapus konten, dan menangguhkan akun pengguna. Mereka tidak bisa mengelola moderator lain.'
                  : 'Akses moderasinya berhenti dalam beberapa detik. Akun dan datanya tidak dihapus.'}
              </p>
              {pending.kind === 'grant' && !pending.user.has_password && (
                <div className="adm-alert adm-alert-warn">Akun ini hanya punya login Google, jadi belum bisa masuk ke halaman admin web.</div>
              )}
              {actionError && <div className="adm-alert adm-alert-error" role="alert">{actionError}</div>}
              <div className="form-group">
                <label className="form-label" htmlFor="adm-staff-note">Catatan (opsional, tercatat di audit)</label>
                <textarea id="adm-staff-note" className="form-input adm-textarea" rows={2} maxLength={MAX_NOTE} value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
            </div>
            <div className="modal-footer-unified">
              <button type="button" className="btn btn-secondary" onClick={() => setPending(null)} disabled={busy}>Batal</button>
              <button type="button" className={pending.kind === 'revoke' ? 'btn adm-btn-danger' : 'btn btn-primary'} onClick={confirm} disabled={busy}>
                {busy ? 'Memproses…' : pending.kind === 'grant' ? 'Angkat' : 'Cabut'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

function FoundCard({ user, onGrant }: { user: StaffMember; onGrant: () => void }) {
  const isStaff = user.system_role === 'wuzz_admin' || user.system_role === 'wuzz_moderator'
  const reason = isStaff
    ? `Sudah berperan ${ROLE_LABEL[user.system_role] || user.system_role}.`
    : user.suspended
      ? 'Akun ini sedang ditangguhkan dan tidak bisa diangkat.'
      : ''
  return (
    <div className="adm-row adm-row-static">
      <div className="adm-staff-main">
        <span className="adm-staff-name">{user.display_name || user.username}</span>
        <span className="adm-muted adm-mono">@{user.username}</span>
        {reason ? <span className="adm-muted">{reason}</span> : !user.has_password && <span className="adm-muted">Akun Google saja: belum bisa masuk ke halaman admin web.</span>}
      </div>
      <button type="button" className="btn btn-primary" onClick={onGrant} disabled={!!reason}>
        Angkat jadi moderator
      </button>
    </div>
  )
}
