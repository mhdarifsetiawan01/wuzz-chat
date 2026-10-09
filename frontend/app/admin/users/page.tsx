'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { UserStatusFilter, UserSummary, ROLE_LABEL, formatDate, listUsers } from '@/lib/admin-api'
import { useAdminSession } from '../AdminShell'

const PAGE = 30

const STATUS_TABS: { value: UserStatusFilter; label: string }[] = [
  { value: '', label: 'Semua' },
  { value: 'active', label: 'Aktif' },
  { value: 'suspended', label: 'Ditangguhkan' },
  { value: 'deleted', label: 'Dihapus' },
]

export default function UsersPage() {
  const { expire } = useAdminSession()
  const [users, setUsers] = useState<UserSummary[]>([])
  const [status, setStatus] = useState<UserStatusFilter>('')
  const [input, setInput] = useState('')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [more, setMore] = useState(false)
  const [error, setError] = useState('')
  const seq = useRef(0)

  const load = useCallback(
    async (offset: number) => {
      const my = ++seq.current
      setLoading(true)
      setError('')
      const res = await listUsers({ q: query, status, offset, limit: PAGE })
      if (my !== seq.current) return // jawaban basi dari filter sebelumnya
      setLoading(false)
      if (res.status === 401) return expire()
      if (!res.data) return setError(res.error || 'Gagal memuat daftar pengguna.')
      setUsers((prev) => (offset === 0 ? res.data!.users : [...prev, ...res.data!.users]))
      setMore(res.data.users.length === PAGE)
    },
    [query, status, expire],
  )

  useEffect(() => {
    load(0)
  }, [load])

  const search = (e: React.FormEvent) => {
    e.preventDefault()
    setQuery(input)
  }

  return (
    <section aria-labelledby="adm-users-title">
      <h1 id="adm-users-title" className="adm-title">Pengguna</h1>
      <p className="adm-muted">Cari akun untuk ditinjau, ditangguhkan, atau (khusus admin) dihapus. Setiap tindakan tercatat di audit.</p>

      <form className="adm-inline-form" onSubmit={search}>
        <input
          className="form-input"
          aria-label="Cari username atau nama"
          placeholder="Cari username atau nama"
          autoCapitalize="none"
          autoComplete="off"
          maxLength={64}
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button type="submit" className="btn btn-secondary">Cari</button>
      </form>

      <div className="adm-tabs" role="tablist" aria-label="Status akun">
        {STATUS_TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={status === t.value}
            className={`adm-tab ${status === t.value ? 'is-active' : ''}`}
            onClick={() => setStatus(t.value)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <div className="adm-alert adm-alert-error" role="alert">{error}</div>}
      {!loading && !error && users.length === 0 && <p className="adm-muted adm-center-note">Tidak ada akun yang cocok.</p>}

      <ul className="adm-list">
        {users.map((u) => (
          <li key={u.id}>
            <Link href={`/admin/users/${encodeURIComponent(u.id)}`} className="adm-row">
              <div className="adm-staff-main">
                <span className="adm-staff-name">{u.display_name || u.username}</span>
                <span className="adm-muted adm-mono">@{u.username}</span>
                <span className="adm-muted">Terdaftar {formatDate(u.created_at)}</span>
              </div>
              <div className="adm-row-side">
                <div className="adm-badges">
                  {u.system_role in ROLE_LABEL && <span className="adm-badge adm-badge-warn">{ROLE_LABEL[u.system_role]}</span>}
                  {u.suspended && <span className="adm-badge adm-badge-danger">Ditangguhkan</span>}
                  {u.deleted && <span className="adm-badge adm-badge-muted">Dihapus</span>}
                  {u.google_linked && <span className="adm-badge adm-badge-muted">Google</span>}
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {loading && <p className="adm-muted adm-center-note">Memuat…</p>}
      {!loading && more && (
        <button type="button" className="btn btn-secondary" onClick={() => load(users.length)}>Muat lebih banyak</button>
      )}
    </section>
  )
}
