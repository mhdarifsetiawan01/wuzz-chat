'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  ACTION_LABEL,
  AdminReport,
  ModAction,
  REASON_LABEL,
  ReportDetail,
  STATUS_LABEL,
  TARGET_LABEL,
  applyAction,
  formatDate,
  getReport,
  isHighPriority,
  ownerOf,
  unsuspendUser,
} from '@/lib/admin-api'
import { useAdminSession } from '../../AdminShell'

type Pending = { kind: 'delete_content' | 'suspend_user' | 'unsuspend' }

const MAX_NOTE = 500
const CONTENT_ACTION_TARGETS = ['post', 'comment', 'message']

// Hanya tautan http(s) yang dijadikan tautan; tidak pernah dimuat otomatis (bisa berisi konten berbahaya).
function parseMediaUrls(raw?: string): string[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x !== '') : []
  } catch {
    return []
  }
}

export default function ReportDetailPage() {
  const params = useParams<{ id: string }>()
  const id = decodeURIComponent(params.id)
  const { expire } = useAdminSession()

  const [detail, setDetail] = useState<ReportDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [pending, setPending] = useState<Pending | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [actionError, setActionError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const res = await getReport(id)
    setLoading(false)
    if (res.status === 401) return expire()
    if (res.status === 404) return setError('Laporan tidak ditemukan.')
    if (res.status === 403) return setError('Anda tidak punya akses moderator.')
    if (!res.data) return setError(res.error || 'Gagal memuat laporan.')
    setDetail(res.data)
  }, [id, expire])

  useEffect(() => {
    load()
  }, [load])

  const owner = useMemo(() => (detail ? ownerOf(detail) : ''), [detail])
  const mediaUrls = useMemo(() => parseMediaUrls(detail?.content.media_urls), [detail])
  const noteTrim = note.trim()

  const run = async (kind: ModAction | 'unsuspend') => {
    if (!detail || busy) return
    setBusy(true)
    setActionError('')
    setMessage('')
    const res = kind === 'unsuspend' ? await unsuspendUser(owner, noteTrim) : await applyAction(detail.report.id, kind, noteTrim)
    setBusy(false)
    setPending(null)
    if (res.status === 401) return expire()
    if (res.status < 200 || res.status >= 300) {
      setActionError(res.error || 'Tindakan gagal.')
      return
    }
    const gone = kind === 'delete_content' && (res.data as { content_already_gone?: boolean } | undefined)?.content_already_gone
    setMessage(gone ? 'Konten memang sudah tidak ada; laporan ditutup.' : 'Tindakan berhasil dicatat.')
    setNote('')
    await load()
  }

  if (loading && !detail) return <p className="adm-muted adm-center-note">Memuat…</p>
  if (error) {
    return (
      <section>
        <Link href="/admin/reports" className="adm-back">← Kembali ke daftar</Link>
        <div className="adm-alert adm-alert-error" role="alert">{error}</div>
      </section>
    )
  }
  if (!detail) return null

  const r = detail.report
  const isOpen = r.status === 'open'
  const canDelete = CONTENT_ACTION_TARGETS.includes(r.target_type)
  const needNote = noteTrim === ''

  return (
    <section aria-labelledby="adm-detail-title">
      <Link href="/admin/reports" className="adm-back">← Kembali ke daftar</Link>

      <div className="adm-toolbar">
        <h1 id="adm-detail-title" className="adm-title">
          {TARGET_LABEL[r.target_type] || r.target_type} · {REASON_LABEL[r.reason] || r.reason}
        </h1>
        <div className="adm-badges">
          {isHighPriority(r.reason) && isOpen && <span className="adm-badge adm-badge-danger">Prioritas</span>}
          <span className={`adm-badge ${isOpen ? 'adm-badge-warn' : 'adm-badge-muted'}`}>{STATUS_LABEL[r.status]}</span>
          {detail.target_user_suspended && <span className="adm-badge adm-badge-danger">Pemilik ditangguhkan</span>}
          {r.evidence_hold && <span className="adm-badge adm-badge-warn">Bukti ditahan</span>}
        </div>
      </div>

      {message && <div className="adm-alert adm-alert-ok" role="status">{message}</div>}

      <div className="adm-card">
        <h2 className="adm-h2">Isi yang dilaporkan</h2>
        {detail.content.available ? (
          <>
            <pre className="adm-content">{detail.content.text || '(tanpa teks)'}</pre>
            {mediaUrls.length > 0 && (
              <div>
                <p className="adm-muted">Lampiran (tidak dimuat otomatis):</p>
                <ul className="adm-links">
                  {mediaUrls.map((u) => (
                    <li key={u} className="adm-mono adm-break">
                      {/^https?:\/\//i.test(u) ? (
                        <a href={u} target="_blank" rel="noopener noreferrer nofollow">{u}</a>
                      ) : (
                        u
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : (
          <div className="adm-alert adm-alert-info">{detail.content.note || 'Isi tidak tersedia.'}</div>
        )}
        <dl className="adm-meta">
          <dt>ID target</dt><dd className="adm-mono adm-break">{r.target_id}</dd>
          <dt>Pemilik</dt><dd className="adm-mono adm-break">{owner || '-'}</dd>
          <dt>Dilaporkan</dt><dd>{formatDate(r.created_at)}</dd>
        </dl>
      </div>

      <div className="adm-card">
        <h2 className="adm-h2">Dari pelapor</h2>
        <dl className="adm-meta">
          <dt>Rincian</dt><dd className="adm-pre">{r.details || '-'}</dd>
          <dt>Bukti</dt><dd className="adm-pre">{r.evidence || '-'}</dd>
        </dl>
        {r.evidence_purged_at && (
          <div className="adm-alert adm-alert-info">
            Bukti dan rincian pelapor dihapus otomatis pada {formatDate(r.evidence_purged_at)} sesuai kebijakan retensi.
            Metadata laporan dan riwayat tindakan tetap tersimpan.
          </div>
        )}
        {r.evidence_hold && !r.evidence_purged_at && (
          <div className="adm-alert adm-alert-warn">Bukti ditahan: tidak akan dihapus otomatis sampai tahanan dilepas.</div>
        )}
        {detail.evidence_expires_at && (
          <p className="adm-muted">Bukti akan dihapus otomatis pada {formatDate(detail.evidence_expires_at)}. Gunakan &ldquo;Tahan bukti&rdquo; bila perlu disimpan lebih lama.</p>
        )}
        {r.target_type === 'message' && !detail.content.available && (
          <p className="adm-muted">Untuk pesan terenkripsi, bukti dari pelapor adalah satu-satunya rujukan dan tidak dapat diverifikasi server.</p>
        )}
      </div>

      {detail.related.length > 0 && (
        <div className="adm-card">
          <h2 className="adm-h2">Laporan lain pada target ini ({detail.related.length})</h2>
          <ul className="adm-list">
            {detail.related.map((x: AdminReport) => (
              <li key={x.id} className="adm-row adm-row-static">
                <span>{REASON_LABEL[x.reason] || x.reason} · {STATUS_LABEL[x.status]}</span>
                <span className="adm-muted">{formatDate(x.created_at)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="adm-card">
        <h2 className="adm-h2">Tindakan</h2>
        {actionError && <div className="adm-alert adm-alert-error" role="alert">{actionError}</div>}
        <div className="form-group">
          <label className="form-label" htmlFor="adm-note">
            Catatan keputusan (wajib untuk hapus, tangguhkan, pulihkan, dan tahan bukti)
          </label>
          <textarea
            id="adm-note"
            className="form-input adm-textarea"
            maxLength={MAX_NOTE}
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Alasan keputusan, tercatat di jejak audit"
          />
          <span className="form-hint">{note.length}/{MAX_NOTE}</span>
        </div>
        <div className="adm-actions">
          {isOpen ? (
            <>
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => run('dismiss')}>Tolak laporan</button>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => run('resolve')}>Tandai selesai</button>
            </>
          ) : (
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => run('reopen')}>Buka kembali</button>
          )}
          {canDelete && (
            <button type="button" className="btn adm-btn-danger" disabled={busy || needNote} onClick={() => setPending({ kind: 'delete_content' })}>
              Hapus konten
            </button>
          )}
          {owner && !detail.target_user_suspended && (
            <button type="button" className="btn adm-btn-danger" disabled={busy || needNote} onClick={() => setPending({ kind: 'suspend_user' })}>
              Tangguhkan akun
            </button>
          )}
          {!r.evidence_purged_at && (r.evidence || r.details || r.evidence_hold) && (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy || needNote}
              onClick={() => run(r.evidence_hold ? 'release_evidence' : 'hold_evidence')}
            >
              {r.evidence_hold ? 'Lepas tahanan bukti' : 'Tahan bukti'}
            </button>
          )}
          {owner && detail.target_user_suspended && (
            <button type="button" className="btn btn-secondary" disabled={busy || needNote} onClick={() => setPending({ kind: 'unsuspend' })}>
              Pulihkan akun
            </button>
          )}
        </div>
      </div>

      <div className="adm-card">
        <h2 className="adm-h2">Riwayat tindakan</h2>
        {detail.history.length === 0 ? (
          <p className="adm-muted">Belum ada tindakan.</p>
        ) : (
          <ul className="adm-list">
            {detail.history.map((h) => (
              <li key={h.id} className="adm-history">
                <div className="adm-row-static adm-row">
                  <strong>{ACTION_LABEL[h.action] || h.action}</strong>
                  <span className="adm-muted">{formatDate(h.created_at)}</span>
                </div>
                {h.note && <p className="adm-pre">{h.note}</p>}
                <span className="adm-muted adm-mono">oleh {h.moderator_id}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {pending && (
        <ConfirmModal
          pending={pending}
          note={noteTrim}
          busy={busy}
          onCancel={() => !busy && setPending(null)}
          onConfirm={() => run(pending.kind)}
        />
      )}
    </section>
  )
}

const CONFIRM_COPY: Record<Pending['kind'], { title: string; body: string; cta: string; danger: boolean }> = {
  delete_content: {
    title: 'Hapus konten ini?',
    body: 'Konten dihapus permanen dan laporan ditutup. Tindakan ini tidak bisa dibatalkan.',
    cta: 'Hapus konten',
    danger: true,
  },
  suspend_user: {
    title: 'Tangguhkan akun pemilik?',
    body: 'Pemilik langsung keluar dari semua perangkat dan tidak bisa masuk. Data tidak dihapus dan akun bisa dipulihkan.',
    cta: 'Tangguhkan',
    danger: true,
  },
  unsuspend: {
    title: 'Pulihkan akun pemilik?',
    body: 'Pemilik bisa masuk kembali dan memakai Wuzz Chat seperti biasa.',
    cta: 'Pulihkan',
    danger: false,
  },
}

function ConfirmModal({
  pending,
  note,
  busy,
  onCancel,
  onConfirm,
}: {
  pending: Pending
  note: string
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const c = CONFIRM_COPY[pending.kind]
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="adm-confirm-title" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal-card-unified" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header-unified">
          <h3 id="adm-confirm-title" className="modal-title-unified">{c.title}</h3>
          <button type="button" className="modal-close-btn" onClick={onCancel} aria-label="Tutup" disabled={busy}>✕</button>
        </div>
        <div className="modal-body-unified">
          <p className="adm-muted">{c.body}</p>
          <p className="adm-muted">Catatan Anda:</p>
          <p className="adm-pre">{note}</p>
        </div>
        <div className="modal-footer-unified">
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>Batal</button>
          <button type="button" className={c.danger ? 'btn adm-btn-danger' : 'btn btn-primary'} onClick={onConfirm} disabled={busy}>
            {busy ? 'Memproses…' : c.cta}
          </button>
        </div>
      </div>
    </div>
  )
}
