'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  decideCreatorApplication,
  formatDate,
  getStarSettings,
  getStarUser,
  grantTestStars,
  listCreatorApplications,
  listPaidCreators,
  listPlayPurchases,
  listStarDebtors,
  refundStarSpend,
  setPaidCreator,
  updateStarSettings,
} from '@/lib/admin-api'
import {
  CREATOR_APP_STATUS_LABEL,
  CreatorApplication,
  PaidCreator,
  PlayPurchase,
  PlayPurchaseSummary,
  StarDebtor,
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
  playPurchaseLabel,
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
  | { kind: 'application'; app: CreatorApplication; approve: boolean }

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
  const [walletPurchases, setWalletPurchases] = useState<PlayPurchase[]>([])

  // Pendaftar Creator
  const [applications, setApplications] = useState<CreatorApplication[]>([])
  const [appFilter, setAppFilter] = useState<'pending' | ''>('pending')
  const [appError, setAppError] = useState('')

  // Pembelian Play dan utang
  const [purchases, setPurchases] = useState<PlayPurchase[]>([])
  const [purchaseSummary, setPurchaseSummary] = useState<PlayPurchaseSummary | null>(null)
  const [purchaseState, setPurchaseState] = useState<'' | 'credited' | 'voided'>('')
  const [includeTest, setIncludeTest] = useState(false)
  const [purchaseError, setPurchaseError] = useState('')
  const [purchaseLoading, setPurchaseLoading] = useState(false)
  const [debtors, setDebtors] = useState<StarDebtor[]>([])

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

  const loadApplications = useCallback(async (filter: 'pending' | '') => {
    setAppError('')
    const res = await listCreatorApplications(filter)
    if (res.status === 401) return expire()
    if (!res.data) return setAppError(starErrorMessage(res.code, res.error || 'Gagal memuat pendaftar Creator.'))
    setApplications(res.data.applications)
  }, [expire])

  const loadPurchases = useCallback(async (state: '' | 'credited' | 'voided', test: boolean) => {
    setPurchaseLoading(true)
    setPurchaseError('')
    const [p, d] = await Promise.all([listPlayPurchases(state, test), listStarDebtors()])
    setPurchaseLoading(false)
    if (p.status === 401 || d.status === 401) return expire()
    if (!p.data) return setPurchaseError(starErrorMessage(p.code, p.error || 'Gagal memuat pembelian.'))
    setPurchases(p.data.purchases)
    setPurchaseSummary(p.data.summary)
    setDebtors(d.data?.debtors ?? [])
  }, [expire])

  useEffect(() => {
    if (loadState === 'ready' && flags?.paid_groups_enabled) loadApplications(appFilter)
  }, [loadState, flags, appFilter, loadApplications])

  useEffect(() => {
    if (loadState === 'ready') loadPurchases(purchaseState, includeTest)
  }, [loadState, purchaseState, includeTest, loadPurchases])

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
    setWalletPurchases(res.data.play_purchases ?? [])
  }

  const openWalletOf = (username: string) => {
    if (!username) return
    setWalletRef(username)
    loadWallet(username)
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
    else if (pending.kind === 'application') res = await decideCreatorApplication(pending.app.id, pending.approve, note.trim())
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
    } else if (pending.kind === 'application') {
      const who = pending.app.username ? `@${pending.app.username}` : 'Pemohon'
      setMessage(pending.approve ? `${who} disetujui dan sekarang mitra kreator.` : `Permohonan ${who} ditolak. Pemohon bisa mengajukan lagi setelah 7 hari.`)
      await loadApplications(appFilter)
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
        Star hanya bisa dibelanjakan di aplikasi (bayar akses grup privat berbayar), tidak bisa ditransfer atau ditarik.
        Selama pembelian Play menyala, pengguna yang bukan penguji lisensi ditagih uang sungguhan.
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
              <span className={`adm-badge ${flags.play_billing ? 'adm-badge-warn' : 'adm-badge-muted'}`}>Pembelian Play {flags.play_billing ? 'aktif' : 'mati'}</span>
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

          {flags.paid_groups_enabled && (
            <div className="adm-card">
              <h2 className="adm-h2">Pendaftar Creator</h2>
              <p className="adm-muted">
                Permohonan dari tombol &quot;Daftar menjadi Creator&quot; di aplikasi. Menyetujui langsung menjadikan pemohon mitra
                kreator. Pemohon yang ditolak bisa mengajukan lagi setelah 7 hari.
              </p>
              <div className="adm-actions">
                <button type="button" className={appFilter === 'pending' ? 'btn btn-primary' : 'btn btn-secondary'} onClick={() => setAppFilter('pending')}>Menunggu</button>
                <button type="button" className={appFilter === '' ? 'btn btn-primary' : 'btn btn-secondary'} onClick={() => setAppFilter('')}>Semua</button>
                <button type="button" className="btn adm-link-btn" onClick={() => loadApplications(appFilter)}>Muat ulang</button>
              </div>
              {appError && <div className="adm-alert adm-alert-error" role="alert">{appError}</div>}
              {applications.length === 0 ? (
                <p className="adm-muted">{appFilter === 'pending' ? 'Tidak ada permohonan yang menunggu.' : 'Belum ada permohonan.'}</p>
              ) : (
                <div className="adm-list">
                  {applications.map((a) => (
                    <div className="adm-row adm-row-static" key={a.id}>
                      <div className="adm-staff-main">
                        <span className="adm-staff-name">{a.display_name || a.username || 'Akun dihapus'}</span>
                        {a.username && <span className="adm-muted adm-mono">@{a.username}</span>}
                        <span className="adm-pre">{a.message}</span>
                        <span className="adm-muted">
                          Diajukan {formatDate(a.created_at)}
                          {a.decided_at ? ` · diputuskan ${formatDate(a.decided_at)}` : ''}
                          {a.decision_note ? ` · ${a.decision_note}` : ''}
                        </span>
                      </div>
                      <div className="adm-row-side">
                        <span className={`adm-badge ${a.status === 'pending' ? 'adm-badge-warn' : 'adm-badge-muted'}`}>{CREATOR_APP_STATUS_LABEL[a.status] || a.status}</span>
                        {a.status === 'pending' && (
                          <>
                            <button
                              type="button"
                              className="btn btn-primary"
                              onClick={() => { setActionError(''); setNote(''); setPending({ kind: 'application', app: a, approve: true }) }}
                            >
                              Setujui
                            </button>
                            <button
                              type="button"
                              className="btn adm-btn-danger"
                              onClick={() => { setActionError(''); setNote(''); setPending({ kind: 'application', app: a, approve: false }) }}
                            >
                              Tolak
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

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
            <h2 className="adm-h2">Pembelian Star (Google Play)</h2>
            <p className="adm-muted">
              200 pembelian terbaru. Refund uang dilakukan di Play Console (Pesanan); Star yang sudah masuk dibalik otomatis
              pada sapuan per jam berikutnya. Cocokkan nomor pesanan (GPA…) dengan Play Console.
            </p>
            <div className="adm-inline-form">
              <select
                className="form-input"
                aria-label="Status pembelian"
                value={purchaseState}
                onChange={(e) => setPurchaseState(e.target.value as '' | 'credited' | 'voided')}
              >
                <option value="">Semua status</option>
                <option value="credited">Masuk</option>
                <option value="voided">Dibatalkan Google</option>
              </select>
              <label className="adm-muted">
                <input type="checkbox" checked={includeTest} onChange={(e) => setIncludeTest(e.target.checked)} /> Sertakan pembelian uji
              </label>
              <button type="button" className="btn adm-link-btn" onClick={() => loadPurchases(purchaseState, includeTest)} disabled={purchaseLoading}>
                {purchaseLoading ? 'Memuat…' : 'Muat ulang'}
              </button>
            </div>
            {purchaseError && <div className="adm-alert adm-alert-error" role="alert">{purchaseError}</div>}
            {purchaseSummary && (
              <p className="adm-muted">
                Di daftar ini: {purchaseSummary.count.toLocaleString('id-ID')} pembelian masuk ({purchaseSummary.stars.toLocaleString('id-ID')} Star),{' '}
                {purchaseSummary.voided_count.toLocaleString('id-ID')} dibatalkan Google, {purchaseSummary.test_count.toLocaleString('id-ID')} uji.
              </p>
            )}
            {purchases.length === 0 ? (
              <p className="adm-muted">Belum ada pembelian.</p>
            ) : (
              <div className="adm-list">
                {purchases.map((p) => (
                  <div className="adm-row adm-row-static" key={p.token_hash}>
                    <div className="adm-staff-main">
                      <span className="adm-staff-name">
                        {p.stars.toLocaleString('id-ID')} Star ·{' '}
                        {p.username ? (
                          <button type="button" className="btn adm-link-btn" onClick={() => openWalletOf(p.username || '')}>@{p.username}</button>
                        ) : 'akun dihapus'}
                      </span>
                      <span className="adm-muted">{formatDate(p.purchase_time || p.created_at)} · {p.product_id}</span>
                      <span className="adm-muted adm-mono">{p.order_id || p.token_hash.slice(0, 16)}</span>
                    </div>
                    <div className="adm-row-side">
                      <span className={`adm-badge ${p.state === 'voided' ? 'adm-badge-danger' : p.is_test ? 'adm-badge-muted' : 'adm-badge-warn'}`}>{playPurchaseLabel(p)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <h3 className="adm-h2 adm-actions-top">Utang Star</h3>
            {debtors.length === 0 ? (
              <p className="adm-muted">Tidak ada akun berutang Star.</p>
            ) : (
              <div className="adm-list">
                {debtors.map((d) => (
                  <div className="adm-row adm-row-static" key={d.user_id}>
                    <div className="adm-staff-main">
                      <button type="button" className="btn adm-link-btn" onClick={() => openWalletOf(d.username)}>@{d.username || d.user_id}</button>
                      <span className="adm-muted">Diperbarui {formatDate(d.updated_at)}</span>
                    </div>
                    <div className="adm-row-side">
                      <span className="adm-badge adm-badge-danger">{d.amount.toLocaleString('id-ID')} Star</span>
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
                  {wallet.debt ? <> · Utang <strong>{wallet.debt.toLocaleString('id-ID')} Star</strong></> : null}
                </p>
                {walletPurchases.length > 0 && (
                  <p className="adm-muted">
                    Pembelian Play: {walletPurchases.map((p) => `${p.stars} Star (${playPurchaseLabel(p)}, ${p.order_id || 'tanpa nomor'})`).join('; ')}
                  </p>
                )}
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
                    : pending.kind === 'refund'
                      ? 'Kembalikan Star?'
                      : pending.kind === 'application'
                        ? pending.approve ? 'Setujui pendaftar Creator?' : 'Tolak pendaftar Creator?'
                        : 'Kreditkan Star uji?'}
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
              {pending.kind === 'application' && (
                <p className="adm-pre">
                  <strong>{pending.app.username ? `@${pending.app.username}` : 'Pemohon'}</strong>{' '}
                  {pending.approve
                    ? 'akan menjadi mitra kreator dan bisa menjadikan grup privat buatannya berbayar. Pastikan perjanjian bagi hasil sudah disepakati.'
                    : 'ditolak dan baru bisa mengajukan lagi setelah 7 hari.'}
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
                    {pending.kind === 'creator'
                      ? 'Catatan (opsional)'
                      : pending.kind === 'application'
                        ? 'Catatan untuk pemohon (opsional, terlihat oleh pemohon)'
                        : 'Alasan (wajib, tercatat di riwayat)'}
                  </label>
                  <textarea id="adm-stars-note" className="form-input adm-textarea" rows={2} maxLength={MAX_NOTE} value={note} onChange={(e) => setNote(e.target.value)} />
                </div>
              )}
            </div>
            <div className="modal-footer-unified">
              <button type="button" className="btn btn-secondary" onClick={() => setPending(null)} disabled={busy}>Batal</button>
              <button
                type="button"
                className={
                  pending.kind === 'refund' || (pending.kind === 'creator' && !pending.active) || (pending.kind === 'application' && !pending.approve)
                    ? 'btn adm-btn-danger'
                    : 'btn btn-primary'
                }
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
