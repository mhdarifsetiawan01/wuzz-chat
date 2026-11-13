// Helper murni untuk halaman /admin/stars (V2 Tahap 2a). Tanpa React/DOM agar bisa diuji dengan node
// (scripts/test/admin-stars.cjs). Aturan validasi sama dengan backend (store.StarSettings.validate).

export interface StarSettings {
  star_value_minor: number
  currency: string
  packages: number[]
  group_price_min: number
  group_price_max: number
  store_fee_pct: number
  platform_pct: number
  hold_days: number
}

export interface StarFlags {
  stars_enabled: boolean
  paid_groups_enabled: boolean
  test_grants: boolean
}

export interface StarLedgerEntry {
  id: string
  delta: number
  kind: string
  group_id?: string
  group_title?: string
  ref_id?: string
  reason?: string
  created_by?: string
  created_at: string
}

export interface StarWallet {
  balance: number
  history: StarLedgerEntry[]
}

export interface PaidCreator {
  user_id: string
  username: string
  display_name: string
  status: 'active' | 'revoked'
  granted_by: string
  note: string
  updated_at: string
}

// Label istilah netral (tanpa "pendapatan"/"cairkan").
export const STAR_KIND_LABEL: Record<string, string> = {
  purchase: 'Pembelian Star',
  spend: 'Bayar akses grup',
  refund: 'Pengembalian',
  test_grant: 'Kredit uji',
  adjustment: 'Penyesuaian',
}

export function formatStarDelta(delta: number): string {
  if (delta > 0) return `+${delta.toLocaleString('id-ID')}`
  if (delta < 0) return `−${Math.abs(delta).toLocaleString('id-ID')}`
  return '0'
}

export function formatMinor(amount: number, currency: string): string {
  // IDR tidak memakai sen; satuan minor IDR = Rupiah. Mata uang lain diasumsikan 2 desimal.
  const value = currency === 'IDR' ? amount : amount / 100
  try {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency, maximumFractionDigits: currency === 'IDR' ? 0 : 2 }).format(value)
  } catch {
    return `${currency} ${value}`
  }
}

// Bagian kreator untuk satu pembayaran akses: sama dengan store.StarSettings.CreatorShareMinor.
export function creatorShare(s: StarSettings, stars: number): { gross: number; share: number } {
  const gross = stars * s.star_value_minor
  const share = Math.floor((gross * (100 - s.store_fee_pct) * (100 - s.platform_pct)) / 10000)
  return { gross, share }
}

export type SettingsForm = Record<keyof StarSettings, string>

export function settingsToForm(s: StarSettings): SettingsForm {
  return {
    star_value_minor: String(s.star_value_minor),
    currency: s.currency,
    packages: s.packages.join(', '),
    group_price_min: String(s.group_price_min),
    group_price_max: String(s.group_price_max),
    store_fee_pct: String(s.store_fee_pct),
    platform_pct: String(s.platform_pct),
    hold_days: String(s.hold_days),
  }
}

function int(v: string): number | null {
  const t = v.trim()
  return /^\d+$/.test(t) ? Number(t) : null
}

// Mengubah isian formulir menjadi pengaturan, atau pesan galat pertama yang ditemukan.
export function parseSettingsForm(f: SettingsForm): { settings?: StarSettings; error?: string } {
  const n = {
    star_value_minor: int(f.star_value_minor),
    group_price_min: int(f.group_price_min),
    group_price_max: int(f.group_price_max),
    store_fee_pct: int(f.store_fee_pct),
    platform_pct: int(f.platform_pct),
    hold_days: int(f.hold_days),
  }
  const currency = f.currency.trim().toUpperCase()
  const packages = f.packages.split(',').map((p) => p.trim()).filter(Boolean).map((p) => int(p))
  if (n.star_value_minor === null || n.star_value_minor < 1) return { error: 'Nilai 1 Star harus bilangan bulat ≥ 1.' }
  if (!/^[A-Z]{3}$/.test(currency)) return { error: 'Mata uang harus 3 huruf (mis. IDR).' }
  if (packages.length === 0 || packages.length > 10 || packages.some((p) => p === null || p < 1 || p > 1_000_000)) {
    return { error: 'Paket: 1-10 angka dipisah koma, masing-masing 1-1.000.000.' }
  }
  if (n.group_price_min === null || n.group_price_min < 1) return { error: 'Harga grup minimum harus ≥ 1.' }
  if (n.group_price_max === null || n.group_price_max < n.group_price_min || n.group_price_max > 1_000_000) {
    return { error: 'Harga grup maksimum harus ≥ minimum dan ≤ 1.000.000.' }
  }
  if (n.store_fee_pct === null || n.store_fee_pct > 50) return { error: 'Potongan toko 0-50%.' }
  if (n.platform_pct === null || n.platform_pct > 90) return { error: 'Bagian platform 0-90%.' }
  if (n.hold_days === null || n.hold_days > 365) return { error: 'Masa tahan 0-365 hari.' }
  return {
    settings: {
      star_value_minor: n.star_value_minor,
      currency,
      packages: packages as number[],
      group_price_min: n.group_price_min,
      group_price_max: n.group_price_max,
      store_fee_pct: n.store_fee_pct,
      platform_pct: n.platform_pct,
      hold_days: n.hold_days,
    },
  }
}

// Daftar perubahan yang mudah dibaca untuk dialog konfirmasi ("Bagian platform: 20% → 30%").
export function settingsDiff(before: StarSettings, after: StarSettings): string[] {
  const label: Record<keyof StarSettings, string> = {
    star_value_minor: 'Nilai 1 Star (satuan minor)',
    currency: 'Mata uang',
    packages: 'Paket Star',
    group_price_min: 'Harga grup minimum',
    group_price_max: 'Harga grup maksimum',
    store_fee_pct: 'Potongan toko (%)',
    platform_pct: 'Bagian platform (%)',
    hold_days: 'Masa tahan (hari)',
  }
  const out: string[] = []
  for (const k of Object.keys(label) as (keyof StarSettings)[]) {
    const a = Array.isArray(before[k]) ? (before[k] as number[]).join(', ') : String(before[k])
    const b = Array.isArray(after[k]) ? (after[k] as number[]).join(', ') : String(after[k])
    if (a !== b) out.push(`${label[k]}: ${a} → ${b}`)
  }
  return out
}

// Kunci idempoten per dialog: klik ganda dengan kunci sama tidak menulis dua kali.
export function newIdempotencyKey(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  if (c?.randomUUID) return c.randomUUID()
  return `k-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

// Mengenali galat umum dari backend Star agar pesan admin jelas.
export function starErrorMessage(code: string | undefined, fallback: string): string {
  switch (code) {
    case 'test_grants_disabled':
      return 'Kredit uji dimatikan di server (STARS_TEST_GRANTS).'
    case 'already_refunded':
      return 'Pembayaran ini sudah dikembalikan.'
    case 'earning_already_paid':
      return 'Star diterima kreator sudah diselesaikan; refund harus ditangani manual.'
    case 'ledger_not_found':
      return 'Entri Star tidak ditemukan.'
    case 'user_not_found':
      return 'Pengguna tidak ditemukan.'
    case 'settings_invalid':
      return 'Pengaturan ditolak server (di luar batas).'
    case 'reason_required':
      return 'Alasan wajib diisi.'
    case 'invalid_amount':
      return 'Jumlah Star harus 1-10.000.'
    case 'admin_only':
      return 'Tindakan ini khusus admin.'
    default:
      return fallback
  }
}
