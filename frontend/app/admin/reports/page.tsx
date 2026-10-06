'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  AdminReport,
  REASON_LABEL,
  ReportStatus,
  STATUS_LABEL,
  TARGET_LABEL,
  formatDate,
  NotifyTestResult,
  isHighPriority,
  listReports,
  testNotify,
} from '@/lib/admin-api'
import { useAdminSession } from '../AdminShell'

const PAGE_SIZE = 30
const STATUSES: ReportStatus[] = ['open', 'resolved', 'dismissed']

export default function ReportsPage() {
  const { expire } = useAdminSession()
  const [status, setStatus] = useState<ReportStatus>('open')
  const [targetType, setTargetType] = useState('')
  const [reason, setReason] = useState('')
  const [reports, setReports] = useState<AdminReport[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ channels?: NotifyTestResult[]; error?: string } | null>(null)

  const runNotifyTest = async () => {
    setTesting(true)
    setTestResult(null)
    const res = await testNotify()
    setTesting(false)
    if (res.status === 401) return expire()
    setTestResult(res.data ? { channels: res.data.channels } : { error: res.error || 'Tes notifikasi gagal.' })
  }

  const load = useCallback(
    async (offset: number) => {
      setLoading(true)
      setError('')
      const res = await listReports({ status, targetType, reason, offset, limit: PAGE_SIZE })
      setLoading(false)
      if (res.status === 401) return expire()
      if (res.status === 403) return setError('Anda tidak punya akses moderator.')
      if (!res.data) return setError(res.error || 'Gagal memuat laporan.')
      const rows = res.data.reports
      setReports((prev) => (offset === 0 ? rows : [...prev, ...rows]))
      setHasMore(rows.length === PAGE_SIZE)
    },
    [status, targetType, reason, expire],
  )

  useEffect(() => {
    load(0)
  }, [load])

  return (
    <section aria-labelledby="adm-reports-title">
      <div className="adm-toolbar">
        <h1 id="adm-reports-title" className="adm-title">Laporan</h1>
        <div className="adm-actions">
          <button type="button" className="btn btn-secondary" onClick={runNotifyTest} disabled={testing}>
            {testing ? 'Mengirim…' : 'Tes notifikasi'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => load(0)} disabled={loading}>
            Muat ulang
          </button>
        </div>
      </div>

      {testResult?.error && <div className="adm-alert adm-alert-error" role="alert">{testResult.error}</div>}
      {testResult?.channels?.map((c) => (
        <div key={c.channel} className={`adm-alert ${c.ok ? 'adm-alert-ok' : 'adm-alert-error'}`} role="status">
          {c.ok ? `Saluran ${c.channel}: pesan tes terkirim. Periksa chat Anda.` : `Saluran ${c.channel} gagal: ${c.error || 'tidak diketahui'}`}
        </div>
      ))}

      <div className="adm-tabs" role="tablist" aria-label="Status laporan">
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={status === s}
            className={`adm-tab${status === s ? ' is-active' : ''}`}
            onClick={() => setStatus(s)}
          >
            {STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      <div className="adm-filters">
        <select className="form-input" aria-label="Jenis target" value={targetType} onChange={(e) => setTargetType(e.target.value)}>
          <option value="">Semua jenis</option>
          {Object.entries(TARGET_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select className="form-input" aria-label="Alasan" value={reason} onChange={(e) => setReason(e.target.value)}>
          <option value="">Semua alasan</option>
          {Object.entries(REASON_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {error && <div className="adm-alert adm-alert-error" role="alert">{error}</div>}

      <ul className="adm-list">
        {reports.map((r) => (
          <li key={r.id}>
            <Link href={`/admin/reports/${encodeURIComponent(r.id)}`} className="adm-row">
              <div className="adm-row-main">
                <span className="adm-row-title">
                  {TARGET_LABEL[r.target_type] || r.target_type} · {REASON_LABEL[r.reason] || r.reason}
                </span>
                <span className="adm-muted adm-mono adm-truncate">{r.target_id}</span>
              </div>
              <div className="adm-row-side">
                {isHighPriority(r.reason) && r.status === 'open' && <span className="adm-badge adm-badge-danger">Prioritas</span>}
                <span className="adm-muted">{formatDate(r.created_at)}</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {!loading && !error && reports.length === 0 && (
        <p className="adm-muted adm-center-note">Tidak ada laporan {STATUS_LABEL[status].toLowerCase()} untuk filter ini.</p>
      )}
      {loading && <p className="adm-muted adm-center-note">Memuat…</p>}
      {!loading && hasMore && (
        <button type="button" className="btn btn-secondary adm-block" onClick={() => load(reports.length)}>
          Muat lebih banyak
        </button>
      )}
    </section>
  )
}
