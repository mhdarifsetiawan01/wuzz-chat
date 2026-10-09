'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  ACTION_LABEL,
  ROLE_LABEL,
  UserDetail,
  deleteAccount,
  formatDate,
  getUser,
  revokeUserSessions,
  suspendAccount,
  unsuspendUser,
} from '@/lib/admin-api'
import { useAdminSession } from '../../AdminShell'

type Kind = 'suspend' | 'unsuspend' | 'revoke' | 'delete'

const MAX_NOTE = 500

const TITLE: Record<Kind, string> = {
  suspend: 'Tangguhkan akun?',
  unsuspend: 'Pulihkan akun?',
  revoke: 'Paksa keluar dari semua perangkat?',
  delete: 'Hapus akun permanen?',
}

const HINT: Record<Kind, string> = {
  suspend: 'Akun tidak bisa masuk dan koneksinya diputus. Data tidak dihapus dan bisa dipulihkan.',
  unsuspend: 'Akun bisa dipakai lagi. Token dan kunci enkripsi yang ada langsung berlaku.',
  revoke: 'Semua sesi dicabut dan koneksi diputus. Pemilik masih bisa masuk lagi dengan kredensialnya.',
  delete:
    'TIDAK DAPAT DIBATALKAN. Pesan, relasi, postingan, kredensial, dan sesi akun dihapus; username dibebaskan. Hanya gunakan bila memang perlu (mis. akun uji atau pelanggaran berat).',
}

export default function UserDetailPage() {
  const params = useParams<{ id: string }>()
  const id = params?.id || ''
  const { role, expire } = useAdminSession()
  const isAdmin = role === 'wuzz_admin'

  const [detail, setDetail] = useState<UserDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [pending, setPending] = useState<Kind | null>(null)
  const [note, setNote] = useState('')
  const [confirmName, setConfirmName] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const res = await getUser(id)
    setLoading(false)
    if (res.status === 401) return expire()
    if (res.status === 404) return setError('Pengguna tidak ditemukan.')
    if (!res.data) return setError(res.error || 'Gagal memuat akun.')
    setDetail(res.data)
  }, [id, expire])

  useEffect(() => {
    if (id) load()
  }, [id, load])

  const open = (k: Kind) => {
    setActionError('')
    setNote('')
    setConfirmName('')
    setPending(k)
  }

  const needsNote = pending !== null && pending !== 'unsuspend'
  const user = detail?.user
  const canSubmit =
    !busy && (!needsNote || note.trim() !== '') && (pending !== 'delete' || confirmName.trim().toLowerCase() === user?.username.toLowerCase())

  const submit = async () => {
    if (!pending || !user || !canSubmit) return
    setBusy(true)
    setActionError('')
    const n = note.trim()
    const res =
      pending === 'suspend' ? await suspendAccount(user.id, n)
      : pending === 'unsuspend' ? await unsuspendUser(user.id, n)
      : pending === 'revoke' ? await revokeUserSessions(user.id, n)
      : await deleteAccount(user.id, n, confirmName.trim())
    setBusy(false)
    if (res.status === 401) return expire()
    if (!res.data) {
      setActionError(res.error || 'Tindakan gagal.')
      return
    }
    setMessage(
      pending === 'suspend' ? 'Akun ditangguhkan.'
      : pending === 'unsuspend' ? 'Akun dipulihkan.'
      : pending === 'revoke' ? 'Semua sesi akun dicabut.'
      : 'Akun dihapus.',
    )
    setPending(null)
    await load()
  }

  const isStaff = user ? user.system_role in ROLE_LABEL : false
  const editable = !!user && !user.deleted && !isStaff

  return (
    <section aria-labelledby="adm-user-title">
      <Link href="/admin/users" className="adm-back">← Semua pengguna</Link>
      {loading && !detail && <p className="adm-muted adm-center-note">Memuat…</p>}
      {error && <div className="adm-alert adm-alert-error" role="alert">{error}</div>}
      {message && <div className="adm-alert adm-alert-ok" role="status">{message}</div>}

      {detail && user && (
        <>
          <div className="adm-toolbar">
            <h1 id="adm-user-title" className="adm-title">{user.display_name || user.username}</h1>
            <div className="adm-badges">
              {isStaff && <span className="adm-badge adm-badge-warn">{ROLE_LABEL[user.system_role]}</span>}
              {user.suspended && <span className="adm-badge adm-badge-danger">Ditangguhkan</span>}
              {user.deleted && <span className="adm-badge adm-badge-muted">Dihapus</span>}
            </div>
          </div>

          <div className="adm-card">
            <dl className="adm-meta">
              <dt>Username</dt><dd className="adm-mono adm-break">@{user.username}</dd>
              <dt>ID</dt><dd className="adm-mono adm-break">{user.id}</dd>
              <dt>Terdaftar</dt><dd>{formatDate(user.created_at)}</dd>
              <dt>Login</dt>
              <dd>{[user.has_password && 'Password', user.google_linked && 'Google'].filter(Boolean).join(' + ') || '-'}</dd>
              <dt>Laporan terhadap akun</dt><dd>{detail.reports_against} ({detail.open_reports} terbuka)</dd>
              <dt>Sesi aktif</dt><dd>{detail.active_sessions}</dd>
              {user.suspended && <><dt>Alasan tangguh</dt><dd className="adm-pre">{user.suspended_reason || '-'}</dd></>}
            </dl>
            {detail.devices.length > 0 && (
              <>
                <h2 className="adm-h2">Perangkat aktif</h2>
                <ul className="adm-list">
                  {detail.devices.map((d, i) => (
                    <li key={i} className="adm-muted">{d.name || 'Perangkat'} · {d.platform}{d.last_seen_at ? ` · terakhir ${formatDate(d.last_seen_at)}` : ''}</li>
                  ))}
                </ul>
              </>
            )}
          </div>

          <div className="adm-card">
            <h2 className="adm-h2">Tindakan</h2>
            {!editable && (
              <p className="adm-muted">
                {user.deleted ? 'Akun ini sudah dihapus.' : 'Akun staf tidak dapat ditindak dari sini. Ubah peran lewat menu Moderator.'}
              </p>
            )}
            {editable && (
              <div className="adm-actions">
                {user.suspended ? (
                  <button type="button" className="btn btn-secondary" onClick={() => open('unsuspend')}>Pulihkan akun</button>
                ) : (
                  <button type="button" className="btn adm-btn-danger" onClick={() => open('suspend')}>Tangguhkan</button>
                )}
                {isAdmin && <button type="button" className="btn btn-secondary" onClick={() => open('revoke')}>Paksa keluar</button>}
                {isAdmin && <button type="button" className="btn adm-btn-danger" onClick={() => open('delete')}>Hapus akun</button>}
              </div>
            )}
            {editable && !isAdmin && <p className="adm-muted">Paksa keluar dan hapus akun khusus admin.</p>}
          </div>

          <div className="adm-card">
            <h2 className="adm-h2">Riwayat tindakan</h2>
            {detail.history.length === 0 && <p className="adm-muted">Belum ada tindakan.</p>}
            {detail.history.map((h) => (
              <div key={h.id} className="adm-history">
                <span>{ACTION_LABEL[h.action] || h.action}</span>
                <span className="adm-muted">{formatDate(h.created_at)}</span>
                {h.note && <span className="adm-pre adm-muted">{h.note}</span>}
              </div>
            ))}
          </div>
        </>
      )}

      {pending && user && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="adm-user-confirm" onClick={(e) => e.target === e.currentTarget && !busy && setPending(null)}>
          <div className="modal-card-unified" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-unified">
              <h3 id="adm-user-confirm" className="modal-title-unified">{TITLE[pending]}</h3>
              <button type="button" className="modal-close-btn" onClick={() => !busy && setPending(null)} aria-label="Tutup" disabled={busy}>✕</button>
            </div>
            <div className="modal-body-unified">
              <p className="adm-pre"><strong>{user.display_name || user.username}</strong> (@{user.username})</p>
              <p className="adm-muted">{HINT[pending]}</p>
              {actionError && <div className="adm-alert adm-alert-error" role="alert">{actionError}</div>}
              <div className="form-group">
                <label className="form-label" htmlFor="adm-user-note">
                  {needsNote ? 'Alasan (wajib, tercatat di audit)' : 'Catatan (opsional, tercatat di audit)'}
                </label>
                <textarea id="adm-user-note" className="form-input adm-textarea" rows={2} maxLength={MAX_NOTE} value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
              {pending === 'delete' && (
                <div className="form-group">
                  <label className="form-label" htmlFor="adm-user-confirm-name">Ketik username <strong>{user.username}</strong> untuk konfirmasi</label>
                  <input id="adm-user-confirm-name" className="form-input" autoCapitalize="none" autoComplete="off" value={confirmName} onChange={(e) => setConfirmName(e.target.value)} />
                </div>
              )}
            </div>
            <div className="modal-footer-unified">
              <button type="button" className="btn btn-secondary" onClick={() => setPending(null)} disabled={busy}>Batal</button>
              <button type="button" className={pending === 'unsuspend' ? 'btn btn-primary' : 'btn adm-btn-danger'} onClick={submit} disabled={!canSubmit}>
                {busy ? 'Memproses…' : pending === 'delete' ? 'Hapus permanen' : pending === 'suspend' ? 'Tangguhkan' : pending === 'revoke' ? 'Paksa keluar' : 'Pulihkan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
