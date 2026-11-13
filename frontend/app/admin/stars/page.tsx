'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  formatDate,
  getStarSettings,
  getStarUser,
  grantTestStars,
  listPaidCreators,
  refundStarSpend,
  setPaidCreator,
  updateStarSettings,
} from '@/lib/admin-api'
import {
  PaidCreator,
  STAR_KIND_LABEL,
  SettingsForm,
  StarFlags,
  StarLedgerEntry,
  StarSettings,
  StarWallet,
  creatorShare,
  formatMinor,
  formatStarDelta,
  newIdempotencyKey,
  parseSettingsForm,
  settingsDiff,
  settingsToForm,
  starErrorMessage,
} from '@/lib/adminStars'
import { useAdminSession } from '../AdminShell'

const MAX_NOTE = 500

type Pending =
  | { kind: 'settings'; settings: StarSettings; diff: string[] }
  | { kind: 'creator'; user: string; label: string; active: boolean }
  | { kind: 'refund'; entry: StarLedgerEntry }
  | { kind: 'grant'; stars: number; key: string }

// Halaman Star (V2 Tahap 2a): khusus wuzz_admin; backend menolak peran lain dan menjawab 404 bila STARS_ENABLED mati.
export default function StarsAdminPage() {
  const { role, expire } = useAdminSession()
  const isAdmin = role === 'wuzz_admin'

  const [loadState, setLoadState] = useState<'loading' | 'off' | 'error' | 'ready'>('loading')
  const [loadError, setLoadError] = useState('')
  const [settings, setSettings] = useState<StarSettings | null>(null)
  const [flags, setFlags] = useState<StarFlags | null>(null)
  const [form, setForm] = useState<SettingsForm | null>(null)
  const [formError, setFormError] = useState('')
  const [creators, setCreators] = useState<PaidCreator[]>([])
  const [message, setMessage] = useState('')

  // Mitra kreator
  const [creatorUser, setCreatorUser] = useState('')

  // Dompet pengguna
  const [walletRef, setWalletRef] = useState('')
  const [walletUser, setWalletUser] = useState('')
  const [wallet, setWallet] = useState<StarWallet | null>(null)
  const [walletError, setWalletError] = useState('')
  const [walletLoading, setWalletLoading] = useState(false)
  const [grantStars, setGrantStars] = useState('100')

  // Konfirmasi
  const [pending, setPending] = useState<Pending | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')

  const load = useCallback(async () => {
    setLoadState('loading')
    const [s, c] = await Promise.all([getStarSettings(), listPaidCreators()])
    if (s.status === 401 || c.status === 401) return expire()
    if (s.status === 404) return setLoadState('off')
    if (!s.data) {
      setLoadError(s.error || 'Gagal memuat pengaturan Star.')
      return setLoadState('error')
    }
    setSettings(s.data.settings)
    setFlags(s.data.flags)
    setForm(settingsToForm(s.data.settings))
    setCreators(c.data?.creators ?? [])
    setLoadState('ready')
  }, [expire])

  useEffect(() => {
    if (isAdmin) load()
  }, [isAdmin, load])

  const loadWallet = async (ref = walletRef) => {
    if (!ref.trim() || walletLoading) return
    setWalletLoading(true)
    setWalletError('')
    const res = await getStarUser(ref)
    setWalletLoading(false)
    if (res.status === 401) return expire()
    if (!res.data) {
      setWallet(null)
      return setWalletError(starErrorMessage(res.code, res.error || 'Gagal memuat dompet.'))
    }
    setWalletUser(ref.trim().replace(/^@/, ''))
    setWallet(res.data.wallet)
  }

  const example = useMemo(() => {
    if (!settings) return ''
    const price = Math.min(Math.max(100, settings.group_price_min), settings.group_price_max)
    const { gross, share } = creatorShare(settings, price)
    return `Contoh: grup seharga ${price} Star = ${formatMinor(gross, settings.currency)}; kreator menerima ${formatMinor(share, settings.currency)} setelah potongan toko ${settings.store_fee_pct}% dan platform ${settings.platform_pct}%, tersedia ${settings.hold_days} hari setelah pembayaran.`
  }, [settings])

  const openSettings = () => {
    if (!form || !settings) return
    const parsed = parseSettingsForm(form)
    if (!parsed.settings) return setFormError(parsed.error || 'Isian tidak valid.')
    const diff = settingsDiff(settings, parsed.settings)
    if (diff.length === 0) return setFormError('Tidak ada perubahan.')
    setFormError('')
    setActionError('')
    setPending({ kind: 'settings', settings: parsed.settings, diff })
  }

  const openGrant = () => {
    const stars = Number(grantStars.trim())
    if (!Number.isInteger(stars) || stars < 1 || stars > 10000) return setWalletError('Jumlah kredit uji 1-10.000 Star.')
    setActionError('')
    setNote('')
    setPending({ kind: 'grant', stars, key: newIdempotencyKey() })
  }

  const confirm = async () => {
    if (!pending || busy) return
    setActionError('')
    if ((pending.kind === 'refund' || pending.kind === 'grant') && !note.trim()) return setActionError('Alasan wajib diisi.')
    setBusy(true)
    let res: { status: number; data?: unknown; error?: string; code?: string }
    if (pending.kind === 'settings') res = await updateStarSettings(pending.settings)
    else if (pending.kind === 'creator') res = await setPaidCreator(pending.user, pending.active, note.trim())
    else if (pending.kind === 'refund') res = await refundStarSpend(pending.entry.id, note.trim())
    else res = await grantTestStars(walletUser, pending.stars, note.trim(), pending.key)
    setBusy(false)
    if (res.status === 401) return expire()
    if (!res.data) return setActionError(starErrorMessage(res.code, res.error || 'Tindakan gagal.'))

    if (pending.kind === 'settings') {
      setSettings(pending.settings)
      setForm(settingsToForm(pending.settings))
      setMessage('Pengaturan Star disimpan. Hanya berlaku untuk transaksi berikutnya.')
    } else if (pending.kind === 'creator') {
      setMessage(pending.active ? `${pending.label} sekarang mitra kreator.` : `Hak mitra ${pending.label} dicabut; grup berbayarnya dinonaktifkan.`)
      setCreatorUser('')
      const c = await listPaidCreators()
      setCreators(c.data?.creators ?? creators)
    } else if (pending.kind === 'refund') {
      setMessage(`${Math.abs(pending.entry.delta)} Star dikembalikan ke @${walletUser}. Keanggotaan grup tidak berubah.`)
      await loadWallet(walletUser)
    } else {
      setMessage(`${pending.stars} Star uji dikreditkan ke @${walletUser}.`)
      await loadWallet(walletUser)
    }
    setPending(null)
    setNote('')
  }

  if (!isAdmin) {
    return (
      <section>
        <h1 className="adm-title">Star</h1>
        <div className="adm-alert adm-alert-warn" role="alert">Halaman ini khusus admin.</div>
      </section>
    )
  }

  return (
    <section aria-labelledby="adm-stars-title">
      <h1 id="adm-stars-title" className="adm-title">Star</h1>
      <p className="adm-muted">
        Star hanya bisa dibelanjakan di aplikasi (bayar akses grup privat berbayar). Fitur ini belum boleh dibuka untuk
        pengguna sebelum urusan hukum, profil merchant Play, dan deklarasi Play selesai.
      </p>

      {message && <div className="adm-alert adm-alert-ok" role="status">{message}</div>}

      {loadState === 'loading' && <p className="adm-muted adm-center-note">Memuat…</p>}
      {loadState === 'off' && (
        <div className="adm-alert adm-alert-info" role="status">
          Star dimatikan di server (<span className="adm-mono">STARS_ENABLED</span> kosong). Nyalakan hanya untuk uji dengan akun uji.
        </div>
      )}
      {loadState === 'error' && (
        <div className="adm-alert adm-alert-error" role="alert">
          {loadError}{' '}
          <button type="button" className="btn adm-link-btn" onClick={load}>Coba lagi</button>
        </div>
      )}

      {loadState === 'ready' && settings && flags && form && (
        <>
          <div className="adm-card">
            <h2 className="adm-h2">Status sakelar server</h2>
            <div className="adm-badges">
              <span className={`adm-badge ${flags.stars_enabled ? 'adm-badge-warn' : 'adm-badge-muted'}`}>Star {flags.stars_enabled ? 'aktif' : 'mati'}</span>
              <span className={`adm-badge ${flags.paid_groups_enabled ? 'adm-badge-warn' : 'adm-badge-muted'}`}>Grup berbayar {flags.paid_groups_enabled ? 'aktif' : 'mati'}</span>
              <span className={`adm-badge ${flags.test_grants ? 'adm-badge-danger' : 'adm-badge-muted'}`}>Kredit uji {flags.test_grants ? 'AKTIF' : 'mati'}</span>
            </div>
            {flags.test_grants && (
              <div className="adm-alert adm-alert-warn" role="status">
                Kredit uji membuat Star tanpa uang. Matikan <span className="adm-mono">STARS_TEST_GRANTS</span> sebelum ada pengguna nyata.
              </div>
            )}
          </div>

          <div className="adm-card">
            <h2 className="adm-h2">Pengaturan angka</h2>
            <p className="adm-muted">{example}</p>
            <form className="adm-stars-grid" onSubmit={(e) => { e.preventDefault(); openSettings() }}>
              {([
                ['star_value_minor', 'Nilai 1 Star (satuan minor)'],
                ['currency', 'Mata uang'],
                ['packages', 'Paket Star (pisahkan koma)'],
                ['group_price_min', 'Harga grup minimum (Star)'],
                ['group_price_max', 'Harga grup maksimum (Star)'],
                ['store_fee_pct', 'Potongan toko (%)'],
                ['platform_pct', 'Bagian platform (%)'],
                ['hold_days', 'Masa tahan (hari)'],
              ] as [keyof SettingsForm, string][]).map(([key, label]) => (
                <div className="form-group" key={key}>
                  <label className="form-label" htmlFor={`adm-star-${key}`}>{label}</label>
                  <input
                    id={`adm-star-${key}`}
                    className="form-input"
                    inputMode={key === 'currency' || key === 'packages' ? 'text' : 'numeric'}
                    value={form[key]}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  />
                </div>
              ))}
              <div className="adm-actions adm-stars-grid-full">
                <button type="submit" className="btn btn-primary">Simpan pengaturan</button>
              </div>
            </form>
            {formError && <div className="adm-alert adm-alert-error" role="alert">{formError}</div>}
          </div>

          <div className="adm-card">
            <h2 className="adm-h2">Mitra kreator</h2>
            <p className="adm-muted">Hanya mitra yang juga pembuat grup yang dapat menjadikan grup privatnya berbayar. Mencabut hak menonaktifkan semua grup berbayarnya.</p>
            <form
              className="adm-inline-form"
              onSubmit={(e) => {
                e.preventDefault()
                if (!creatorUser.trim()) return
                setActionError('')
                setNote('')
                setPending({ kind: 'creator', user: creatorUser.trim(), label: `@${creatorUser.trim().replace(/^@/, '')}`, active: true })
              }}
            >
              <input
                className="form-input"
                aria-label="Username calon mitra"
                placeholder="Username (tanpa @)"
                autoCapitalize="none"
                autoComplete="off"
                value={creatorUser}
                onChange={(e) => setCreatorUser(e.target.value)}
              />
              <button type="submit" className="btn btn-secondary" disabled={!creatorUser.trim()}>Jadikan mitra</button>
            </form>
            {creators.length === 0 ? (
              <p className="adm-muted">Belum ada mitra kreator.</p>
            ) : (
              <div className="adm-list">
                {creators.map((c) => (
                  <div className="adm-row adm-row-static" key={c.user_id}>
                    <div className="adm-staff-main">
                      <span className="adm-staff-name">{c.display_name || c.username}</span>
                      <span className="adm-muted adm-mono">@{c.username}</span>
                      <span className="adm-muted">Diperbarui {formatDate(c.updated_at)}{c.note ? ` · ${c.note}` : ''}</span>
                    </div>
                    <div className="adm-row-side">
                      <span className={`adm-badge ${c.status === 'active' ? 'adm-badge-warn' : 'adm-badge-muted'}`}>{c.status === 'active' ? 'Aktif' : 'Dicabut'}</span>
                      <button
                        type="button"
                        className={c.status === 'active' ? 'btn adm-btn-danger' : 'btn btn-secondary'}
                        onClick={() => {
                          setActionError('')
                          setNote('')
                          setPending({ kind: 'creator', user: c.user_id, label: `@${c.username}`, active: c.status !== 'active' })
                        }}
                      >
                        {c.status === 'active' ? 'Cabut' : 'Aktifkan lagi'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="adm-card">
            <h2 className="adm-h2">Dompet pengguna</h2>
            <form className="adm-inline-form" onSubmit={(e) => { e.preventDefault(); loadWallet() }}>
              <input
                className="form-input"
                aria-label="Username pengguna"
                placeholder="Username (tanpa @)"
                autoCapitalize="none"
                autoComplete="off"
                value={walletRef}
                onChange={(e) => setWalletRef(e.target.value)}
              />
              <button type="submit" className="btn btn-secondary" disabled={walletLoading || !walletRef.trim()}>
                {walletLoading ? 'Memuat…' : 'Lihat'}
              </button>
            </form>
            {walletError && <div className="adm-alert adm-alert-error" role="alert">{walletError}</div>}
            {wallet && (
              <div className="adm-block">
                <p>
                  <strong>@{walletUser}</strong> · Saldo <strong>{wallet.balance.toLocaleString('id-ID')} Star</strong>
                </p>
                {flags.test_grants && (
                  <form className="adm-inline-form" onSubmit={(e) => { e.preventDefault(); openGrant() }}>
                    <input
                      className="form-input"
                      aria-label="Jumlah kredit uji (Star)"
                      inputMode="numeric"
                      value={grantStars}
                      onChange={(e) => setGrantStars(e.target.value)}
                    />
                    <button type="submit" className="btn btn-secondary">Kredit uji</button>
                  </form>
                )}
                {wallet.history.length === 0 ? (
                  <p className="adm-muted">Belum ada riwayat Star.</p>
                ) : (
                  <div className="adm-list">
                    {wallet.history.map((e) => (
                      <div className="adm-row adm-row-static" key={e.id}>
                        <div className="adm-staff-main">
                          <span className="adm-staff-name">{STAR_KIND_LABEL[e.kind] || e.kind}{e.group_title ? ` · ${e.group_title}` : ''}</span>
                          <span className="adm-muted">{formatDate(e.created_at)}{e.reason ? ` · ${e.reason}` : ''}</span>
                          <span className="adm-muted adm-mono">{e.id}</span>
                        </div>
                        <div className="adm-row-side">
                          <span className={`adm-badge ${e.delta < 0 ? 'adm-badge-muted' : 'adm-badge-warn'}`}>{formatStarDelta(e.delta)}</span>
                          {e.kind === 'spend' && !wallet.history.some((x) => x.kind === 'refund' && x.ref_id === e.id) && (
                            <button
                              type="button"
                              className="btn adm-btn-danger"
                              onClick={() => {
                                setActionError('')
                                setNote('')
                                setPending({ kind: 'refund', entry: e })
                              }}
                            >
                              Refund
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {pending && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="adm-stars-confirm" onClick={(e) => e.target === e.currentTarget && !busy && setPending(null)}>
          <div className="modal-card-unified" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-unified">
              <h3 id="adm-stars-confirm" className="modal-title-unified">
                {pending.kind === 'settings'
                  ? 'Simpan pengaturan Star?'
                  : pending.kind === 'creator'
                    ? pending.active ? 'Jadikan mitra kreator?' : 'Cabut hak mitra?'
                    : pending.kind === 'refund' ? 'Kembalikan Star?' : 'Kreditkan Star uji?'}
              </h3>
              <button type="button" className="modal-close-btn" onClick={() => !busy && setPending(null)} aria-label="Tutup" disabled={busy}>✕</button>
            </div>
            <div className="modal-body-unified">
              {pending.kind === 'settings' && (
                <>
                  <ul className="adm-pre">
                    {pending.diff.map((d) => <li key={d}>{d}</li>)}
                  </ul>
                  <p className="adm-muted">Transaksi lama tidak berubah; angka baru hanya berlaku untuk pembayaran berikutnya.</p>
                </>
              )}
              {pending.kind === 'creator' && (
                <p className="adm-pre">
                  <strong>{pending.label}</strong>{' '}
                  {pending.active
                    ? 'akan bisa menjadikan grup privat buatannya berbayar.'
                    : 'tidak lagi bisa membuat grup berbayar, dan semua grup berbayarnya dinonaktifkan (anggota yang sudah membayar tetap anggota).'}
                </p>
              )}
              {pending.kind === 'refund' && (
                <p className="adm-pre">
                  <strong>{Math.abs(pending.entry.delta)} Star</strong> dikembalikan ke @{walletUser}
                  {pending.entry.group_title ? ` untuk grup "${pending.entry.group_title}"` : ''}. Star yang diterima kreator untuk
                  pembayaran ini dibatalkan. Keanggotaan grup tidak diubah; keluarkan manual bila perlu. Hanya bisa sekali.
                </p>
              )}
              {pending.kind === 'grant' && (
                <p className="adm-pre">
                  <strong>{pending.stars} Star uji</strong> untuk @{walletUser}. Tercatat sebagai kredit uji, bukan pembelian.
                </p>
              )}
              {actionError && <div className="adm-alert adm-alert-error" role="alert">{actionError}</div>}
              {pending.kind !== 'settings' && (
                <div className="form-group">
                  <label className="form-label" htmlFor="adm-stars-note">
                    {pending.kind === 'creator' ? 'Catatan (opsional)' : 'Alasan (wajib, tercatat di riwayat)'}
                  </label>
                  <textarea id="adm-stars-note" className="form-input adm-textarea" rows={2} maxLength={MAX_NOTE} value={note} onChange={(e) => setNote(e.target.value)} />
                </div>
              )}
            </div>
            <div className="modal-footer-unified">
              <button type="button" className="btn btn-secondary" onClick={() => setPending(null)} disabled={busy}>Batal</button>
              <button
                type="button"
                className={pending.kind === 'refund' || (pending.kind === 'creator' && !pending.active) ? 'btn adm-btn-danger' : 'btn btn-primary'}
                onClick={confirm}
                disabled={busy}
              >
                {busy ? 'Memproses…' : 'Konfirmasi'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
