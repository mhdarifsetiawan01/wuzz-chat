// Klien API alat moderasi (/admin). Sengaja terpisah dari sesi chat: token disimpan di sessionStorage (hilang saat tab
// ditutup), login tanpa device_id (tidak memakai slot perangkat dan tidak menyentuh kunci E2EE). Pemeriksaan peran yang
// sebenarnya ada di backend; peran dari JWT di sini hanya untuk menyembunyikan UI.

const TOKEN_KEY = 'wuzz_admin_token'

export const STAFF_ROLES = ['wuzz_admin', 'wuzz_moderator']

export type ReportStatus = 'open' | 'resolved' | 'dismissed'
export type ReportTarget = 'message' | 'user' | 'post' | 'comment' | 'group'
export type ModAction = 'dismiss' | 'resolve' | 'reopen' | 'delete_content' | 'suspend_user'

export interface AdminReport {
  id: string
  reporter_id?: string
  target_type: ReportTarget
  target_id: string
  target_user_id?: string
  reason: string
  details?: string
  evidence?: string
  status: ReportStatus
  created_at: string
}

export interface TargetContent {
  available: boolean
  note?: string
  author_id?: string
  text?: string
  media_urls?: string
  created_at?: string
}

export interface ModerationHistoryItem {
  id: string
  report_id?: string
  moderator_id: string
  action: string
  target_type?: string
  target_id?: string
  target_user_id?: string
  note?: string
  created_at: string
}

export interface ReportDetail {
  report: AdminReport
  content: TargetContent
  related: AdminReport[]
  history: ModerationHistoryItem[]
  target_user_suspended: boolean
}

export const REASON_LABEL: Record<string, string> = {
  spam: 'Spam',
  harassment: 'Pelecehan',
  hate: 'Ujaran kebencian',
  sexual: 'Konten seksual',
  violence: 'Kekerasan',
  illegal: 'Ilegal',
  impersonation: 'Peniruan identitas',
  other: 'Lainnya',
}

export const TARGET_LABEL: Record<string, string> = {
  message: 'Pesan',
  user: 'Profil',
  post: 'Postingan',
  comment: 'Komentar',
  group: 'Grup',
}

export const STATUS_LABEL: Record<string, string> = {
  open: 'Terbuka',
  resolved: 'Selesai',
  dismissed: 'Ditolak',
}

export const ACTION_LABEL: Record<string, string> = {
  dismiss: 'Ditolak',
  resolve: 'Diselesaikan',
  reopen: 'Dibuka kembali',
  delete_content: 'Konten dihapus',
  suspend_user: 'Akun ditangguhkan',
  unsuspend_user: 'Akun dipulihkan',
}

// Alasan yang ditinjau paling dulu (selaras dengan urutan prioritas di backend).
export function isHighPriority(reason: string): boolean {
  return reason === 'sexual' || reason === 'illegal'
}

export function getAdminToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setAdminToken(token: string): void {
  try {
    sessionStorage.setItem(TOKEN_KEY, token)
  } catch {}
}

export function clearAdminToken(): void {
  try {
    sessionStorage.removeItem(TOKEN_KEY)
  } catch {}
}

// Membaca klaim JWT TANPA verifikasi tanda tangan (hanya kosmetik; backend yang memutuskan akses).
export function decodeClaims(token: string): { system_role?: string; username?: string; exp?: number } | null {
  try {
    const part = token.split('.')[1]
    if (!part) return null
    let b64 = part.replace(/-/g, '+').replace(/_/g, '/')
    while (b64.length % 4 !== 0) b64 += '='
    return JSON.parse(atob(b64))
  } catch {
    return null
  }
}

export function isStaffToken(token: string): boolean {
  const c = decodeClaims(token)
  if (!c || !c.system_role) return false
  if (c.exp && c.exp * 1000 < Date.now()) return false
  return STAFF_ROLES.includes(c.system_role)
}

export interface AdminResult<T> {
  data?: T
  error?: string
  status: number
  code?: string
}

export async function adminFetch<T>(path: string, init: RequestInit = {}): Promise<AdminResult<T>> {
  const token = getAdminToken()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)
  try {
    const res = await fetch(path, {
      ...init,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.headers as Record<string, string> | undefined),
      },
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { status: res.status, error: body.error || body.message || `Permintaan gagal (${res.status})`, code: body.code }
    }
    return { status: res.status, data: body as T }
  } catch (err: unknown) {
    const aborted = err instanceof Error && err.name === 'AbortError'
    return { status: aborted ? 408 : 0, error: aborted ? 'Server terlalu lama menjawab' : 'Tidak dapat terhubung ke server' }
  } finally {
    clearTimeout(timer)
  }
}

export interface ListParams {
  status: ReportStatus
  targetType?: string
  reason?: string
  offset?: number
  limit?: number
}

export function listReports(p: ListParams) {
  const q = new URLSearchParams({ status: p.status, limit: String(p.limit ?? 30), offset: String(p.offset ?? 0) })
  if (p.targetType) q.set('target_type', p.targetType)
  if (p.reason) q.set('reason', p.reason)
  return adminFetch<{ reports: AdminReport[] }>(`/api/admin/reports?${q.toString()}`)
}

export function getReport(id: string) {
  return adminFetch<ReportDetail>(`/api/admin/reports/${encodeURIComponent(id)}`)
}

export function applyAction(id: string, action: ModAction, note: string) {
  return adminFetch<{ status: string; report_status: ReportStatus; content_already_gone: boolean }>(
    `/api/admin/reports/${encodeURIComponent(id)}/action`,
    { method: 'POST', body: JSON.stringify({ action, note }) },
  )
}

export function unsuspendUser(userId: string, note: string) {
  return adminFetch<{ status: string }>(`/api/admin/users/${encodeURIComponent(userId)}/unsuspend`, {
    method: 'POST',
    body: JSON.stringify({ note }),
  })
}

export interface NotifyTestResult {
  channel: string
  ok: boolean
  error?: string
}

// Mengirim pesan uji ke setiap saluran notifikasi (Telegram dll) dan melaporkan hasilnya per saluran.
export function testNotify() {
  return adminFetch<{ channels: NotifyTestResult[] }>('/api/admin/notify/test', { method: 'POST' })
}

export async function adminLogin(username: string, password: string): Promise<AdminResult<{ token: string }>> {
  // Tanpa device_id: tidak memakai kuota 2 perangkat dan tidak membuat sesi/kunci chat.
  return adminFetch<{ token: string }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: username.trim(), password, platform: 'web' }),
  })
}

export async function adminLogout(): Promise<void> {
  const token = getAdminToken()
  clearAdminToken()
  if (!token) return
  try {
    await fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } })
  } catch {}
}

export function formatDate(iso?: string): string {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
}

// Pemilik konten yang bisa ditangguhkan/dipulihkan untuk laporan ini.
export function ownerOf(detail: ReportDetail): string {
  const r = detail.report
  return r.target_user_id || (r.target_type === 'user' ? r.target_id : '') || detail.content.author_id || ''
}
