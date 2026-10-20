'use client'

import { useState } from 'react'
import {
  EntitlementLookup,
  applyGrandfather,
  formatDate,
  lookupEntitlement,
  previewGrandfather,
  revokePlan,
  setProPlan,
} from '@/lib/admin-api'
import {
  GrandfatherPreview,
  enforcementNote,
  grandfatherPreviewText,
  parseDaysInput,
  planSummary,
} from '@/lib/adminPlans'
import { useAdminSession } from '../AdminShell'

type Pending =
  | { kind: 'grant' }
  | { kind: 'revoke' }
  | { kind: 'grandfather'; days: number; preview: GrandfatherPreview }

const MAX_NOTE = 500
const MAX_PRO_DAYS = 3650
const MAX_GRANDFATHER_DAYS = 365

export default function PlansPage() {
  const { role, expire } = useAdminSession()
  const isAdmin = role === 'wuzz_admin'

  const [message, setMessage] = useState('')

  // Cari akun
  const [username, setUsername] = useState('')
  const [searching, setSearching] = useState(false)
  const [found, setFound] = useState<EntitlementLookup | null>(null)
  const [searchError, setSearchError] = useState('')

  // Grandfather
  const [gfDays, setGfDays] = useState('60')
  const [gfLoading, setGfLoading] = useState(false)
  const [gfPreview, setGfPreview] = useState<{ days: number; data: GrandfatherPreview } | null>(null)
  const [gfError, setGfError] = useState('')

  // Konfirmasi
  const [pending, setPending] = useState<Pending | null>(null)
  const [proDays, setProDays] = useState('30')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')

  const search = async (e?: React.FormEvent, name = username) => {
    e?.preventDefault()
    if (!name.trim() || searching) return
    setSearching(true)
    setSearchError('')
    const res = await lookupEntitlement(name)
    setSearching(false)
    if (res.status === 401) return expire()
    if (res.status === 404) {
      setFound(null)
      return setSearchError('Pengguna dengan username itu tidak ditemukan.')
    }
    if (!res.data) {
      setFound(null)
      return setSearchError(res.error || 'Pencarian gagal.')
    }
    setFound(res.data)
  }

  const openGrant = () => {
    setActionError('')
    setNote('')
    setProDays('30')
    setPending({ kind: 'grant' })
  }

  const openRevoke = () => {
    setActionError('')
    setNote('')
    setPending({ kind: 'revoke' })
  }

  const preview = async () => {
    const days = parseDaysInput(gfDays, { allowZero: false, max: MAX_GRANDFATHER_DAYS })
    if (days === null) return setGfError(`Isi jumlah hari 1-${MAX_GRANDFATHER_DAYS}.`)
    if (gfLoading) return
    setGfLoading(true)
    setGfError('')
    setGfPreview(null)
    setMessage('')
    const res = await previewGrandfather(days)
    setGfLoading(false)
    if (res.status === 401) return expire()
    if (res.status === 403) return setGfError('Tindakan ini khusus admin.')
    if (res.status === 400) return setGfError(res.error || 'Hanya berlaku untuk tenant default.')
    if (!res.data) return setGfError(res.error || 'Gagal memuat pratinjau.')
    setGfPreview({ days, data: res.data })
  }

  const openGrandfather = () => {
    if (!gfPreview || gfPreview.data.eligible === 0) return
    setActionError('')
    setNote('')
    setPending({ kind: 'grandfather', days: gfPreview.days, preview: gfPreview.data })
  }

  const confirm = async () => {
    if (!pending || busy) return
    setActionError('')

    if (pending.kind === 'grant') {
      const days = parseDaysInput(proDays, { allowZero: true, max: MAX_PRO_DAYS })
      if (days === null || !found) return setActionError(`Isi jumlah hari 0-${MAX_PRO_DAYS} (0 = tanpa batas waktu).`)
      setBusy(true)
      const res = await setProPlan(found.user.id, days, note.trim())
      setBusy(false)
      if (res.status === 401) return expire()
      if (!res.data) return setActionError(res.error || 'Tindakan gagal.')
      setMessage(`@${found.user.username} sekarang Pro ${days === 0 ? 'tanpa batas waktu' : `selama ${days} hari`}.`)
    } else if (pending.kind === 'revoke') {
      if (!found) return
      setBusy(true)
      const res = await revokePlan(found.user.id, note.trim())
      setBusy(false)
      if (res.status === 401) return expire()
      if (!res.data) return setActionError(res.error || 'Tindakan gagal.')
      setMessage(`Paket @${found.user.username} dicabut. Forum dan memori yang ada tidak dihapus.`)
    } else {
      setBusy(true)
      const res = await applyGrandfather(pending.days, pending.preview.eligible, note.trim())
      setBusy(false)
      if (res.status === 401) return expire()
      if (res.status === 409) {
        setPending(null)
        setGfPreview(null)
        return setGfError('Jumlah akun yang memenuhi syarat berubah sejak pratinjau. Lihat pratinjau lagi, lalu konfirmasi ulang.')
      }
      if (!res.data) return setActionError(res.error || 'Tindakan gagal.')
      setMessage(`Pro sementara diberikan kepada ${res.data.applied} akun selama ${pending.days} hari.`)
      setGfPreview(null)
    }

    setPending(null)
    setNote('')
    if (found) await search(undefined, found.user.username)
  }

  if (!isAdmin) {
    return (
      <section>
        <h1 className="adm-title">Paket</h1>
        <div className="adm-alert adm-alert-warn" role="alert">Halaman ini khusus admin.</div>
      </section>
    )
  }

  const summary = found ? planSummary(found.status, found.entitlement, formatDate) : null

  return (
    <section aria-labelledby="adm-plans-title">
      <h1 id="adm-plans-title" className="adm-title">Paket</h1>
      <p className="adm-muted">
        Beri atau cabut paket Pro secara manual. Pencabutan tidak menghapus forum atau memori; hanya pembuatan forum dan
        ringkasan AI berikutnya yang mengikuti paket Gratis. Setiap perubahan dicatat dengan nama admin.
      </p>

      {message && <div className="adm-alert adm-alert-ok" role="status">{message}</div>}

      <div className="adm-card">
        <h2 className="adm-h2">Cari akun</h2>
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

        {found && summary && (
          <div className="adm-block">
            <div className="adm-row adm-row-static">
              <div className="adm-staff-main">
                <span className="adm-staff-name">{found.user.display_name || found.user.username}</span>
                <span className="adm-muted adm-mono">@{found.user.username}</span>
                <span className="adm-muted">{summary.detail}</span>
              </div>
              <div className="adm-row-side">
                <span className={`adm-badge ${summary.tone === 'pro' ? 'adm-badge-warn' : 'adm-badge-muted'}`}>{summary.headline}</span>
              </div>
            </div>
            <p className="adm-muted">
              Forum aktif: {found.status.forums.active} dari {found.status.forums.limit}
              {' · '}Ringkasan AI bulan ini: {found.status.ai.used} dari {found.status.ai.limit}
            </p>
            <p className="adm-muted">{enforcementNote(found.status)}</p>
            <div className="adm-actions">
              <button type="button" className="btn btn-primary" onClick={openGrant}>
                {found.status.plan === 'pro' ? 'Ubah masa Pro' : 'Beri Pro'}
              </button>
              {found.entitlement && found.entitlement.status === 'active' && (
                <button type="button" className="btn adm-btn-danger" onClick={openRevoke}>Cabut paket</button>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="adm-card">
        <h2 className="adm-h2">Pro sementara untuk pengguna lama</h2>
        <p className="adm-muted">
          Untuk admin dan pembuat grup yang sudah ada sebelum batas paket berlaku. Jalankan tepat sebelum batas diaktifkan di
          server: masa Pro dihitung sejak tombol Terapkan ditekan. Akun yang sudah punya paket (termasuk yang sengaja
          dicabut) dilewati, dan aman dijalankan ulang.
        </p>
        <form className="adm-inline-form" onSubmit={(e) => { e.preventDefault(); preview() }}>
          <input
            className="form-input"
            aria-label="Lama Pro (hari)"
            inputMode="numeric"
            placeholder="Hari"
            value={gfDays}
            onChange={(e) => { setGfDays(e.target.value); setGfPreview(null) }}
          />
          <button type="submit" className="btn btn-secondary" disabled={gfLoading}>
            {gfLoading ? 'Memuat…' : 'Lihat pratinjau'}
          </button>
        </form>
        {gfError && <div className="adm-alert adm-alert-error" role="alert">{gfError}</div>}
        {gfPreview && (
          <div className="adm-block">
            <p className="adm-pre">{grandfatherPreviewText(gfPreview.data)}</p>
            {gfPreview.data.eligible > 0 && (
              <div className="adm-actions">
                <button type="button" className="btn btn-primary" onClick={openGrandfather}>
                  Terapkan ke {gfPreview.data.eligible} akun
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {pending && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="adm-plans-confirm" onClick={(e) => e.target === e.currentTarget && !busy && setPending(null)}>
          <div className="modal-card-unified" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-unified">
              <h3 id="adm-plans-confirm" className="modal-title-unified">
                {pending.kind === 'grant' ? 'Beri paket Pro?' : pending.kind === 'revoke' ? 'Cabut paket?' : 'Terapkan Pro sementara?'}
              </h3>
              <button type="button" className="modal-close-btn" onClick={() => !busy && setPending(null)} aria-label="Tutup" disabled={busy}>✕</button>
            </div>
            <div className="modal-body-unified">
              {pending.kind === 'grandfather' ? (
                <p className="adm-pre">
                  <strong>{pending.preview.eligible} akun</strong> akan mendapat Pro selama <strong>{pending.days} hari</strong> mulai
                  sekarang. Tindakan ini tidak dapat dibatalkan sekaligus; paket tiap akun dapat dicabut satu per satu.
                </p>
              ) : (
                found && <p className="adm-pre"><strong>{found.user.display_name || found.user.username}</strong> (@{found.user.username})</p>
              )}
              {pending.kind === 'grant' && (
                <div className="form-group">
                  <label className="form-label" htmlFor="adm-plans-days">Lama Pro (hari; 0 = tanpa batas waktu)</label>
                  <input id="adm-plans-days" className="form-input" inputMode="numeric" value={proDays} onChange={(e) => setProDays(e.target.value)} />
                </div>
              )}
              {pending.kind === 'revoke' && (
                <p className="adm-muted">Akun kembali ke paket Gratis. Forum aktif tetap berjalan sampai selesai; hanya pembuatan baru yang mengikuti batas Gratis.</p>
              )}
              {actionError && <div className="adm-alert adm-alert-error" role="alert">{actionError}</div>}
              <div className="form-group">
                <label className="form-label" htmlFor="adm-plans-note">Catatan (opsional, tercatat di audit)</label>
                <textarea id="adm-plans-note" className="form-input adm-textarea" rows={2} maxLength={MAX_NOTE} value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
            </div>
            <div className="modal-footer-unified">
              <button type="button" className="btn btn-secondary" onClick={() => setPending(null)} disabled={busy}>Batal</button>
              <button type="button" className={pending.kind === 'revoke' ? 'btn adm-btn-danger' : 'btn btn-primary'} onClick={confirm} disabled={busy}>
                {busy ? 'Memproses…' : pending.kind === 'revoke' ? 'Cabut' : pending.kind === 'grant' ? 'Simpan' : 'Terapkan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
