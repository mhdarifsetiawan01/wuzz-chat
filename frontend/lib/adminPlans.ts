// Logika tampilan halaman admin "Paket" (/admin/plans). Murni (tanpa React/fetch) agar bisa diuji unit.
// Server adalah penentu; teks di sini hanya menjelaskan hasil pencarian paket kepada admin.

export interface AdminEntitlementRow {
  plan: string
  status: string
  valid_until?: string
  source: string
  granted_by?: string
  note?: string
  updated_at?: string
}

export interface AdminEntitlementStatus {
  plan: 'free' | 'pro'
  source?: string
  valid_until?: string
  limits_enforced: boolean
  forums: { active: number; limit: number }
  allowed_duration_days: number[]
  ai: { enforced: boolean; used: number; limit: number; reset_at: string }
}

export const SOURCE_LABEL: Record<string, string> = {
  manual: 'Manual',
  grandfather: 'Pengguna lama',
}

export interface PlanSummary {
  headline: string
  tone: 'pro' | 'free'
  detail: string
}

const defaultFmt = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '-' : d.toISOString().slice(0, 10)
}

/** Ringkasan paket yang berlaku saat ini beserta alasannya (baris tidak ada, dicabut, atau Pro berakhir). */
export function planSummary(
  status: AdminEntitlementStatus,
  row: AdminEntitlementRow | null | undefined,
  fmt: (iso: string) => string = defaultFmt,
): PlanSummary {
  if (status.plan === 'pro') {
    const src = row?.source ? SOURCE_LABEL[row.source] || row.source : ''
    const until = status.valid_until ? `Berlaku sampai ${fmt(status.valid_until)}` : 'Tanpa batas waktu'
    return { headline: 'Pro', tone: 'pro', detail: src ? `${until} · ${src}` : until }
  }
  if (!row) return { headline: 'Gratis', tone: 'free', detail: 'Belum pernah diberi paket.' }
  if (row.status === 'revoked') return { headline: 'Gratis', tone: 'free', detail: 'Paket dicabut.' }
  if (row.valid_until) return { headline: 'Gratis', tone: 'free', detail: `Pro berakhir ${fmt(row.valid_until)}.` }
  return { headline: 'Gratis', tone: 'free', detail: 'Tidak ada paket aktif.' }
}

/** Teks status penegakan di server, supaya admin tahu apakah batas sungguh berlaku. */
export function enforcementNote(status: AdminEntitlementStatus): string {
  const forums = status.limits_enforced ? 'Batas forum aktif DITEGAKKAN' : 'Batas forum aktif BELUM ditegakkan (informasi saja)'
  const ai = status.ai.enforced ? 'kuota ringkasan AI DITEGAKKAN' : 'kuota ringkasan AI BELUM ditegakkan'
  return `${forums}; ${ai}.`
}

/** Membaca isian jumlah hari. null = tidak valid. allowZero: 0 berarti "tanpa batas waktu". */
export function parseDaysInput(raw: string, opts: { allowZero: boolean; max: number }): number | null {
  const s = raw.trim()
  if (!/^\d+$/.test(s)) return null
  const n = Number(s)
  if (!Number.isSafeInteger(n) || n > opts.max) return null
  if (n === 0 && !opts.allowZero) return null
  return n
}

export interface GrandfatherPreview {
  dry_run: boolean
  days: number
  valid_until: string
  eligible: number
  sample: string[]
}

/** Kalimat ringkas hasil pratinjau grandfather. */
export function grandfatherPreviewText(p: GrandfatherPreview): string {
  if (p.eligible === 0) return 'Tidak ada akun yang memenuhi syarat (semua sudah punya paket atau bukan admin/pembuat grup).'
  const more = p.eligible > p.sample.length ? ` dan ${p.eligible - p.sample.length} lainnya` : ''
  return `${p.eligible} akun akan mendapat Pro selama ${p.days} hari: ${p.sample.map((u) => '@' + u).join(', ')}${more}.`
}
