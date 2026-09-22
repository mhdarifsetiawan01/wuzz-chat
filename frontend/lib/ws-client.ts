import type { Message, ConnectionStatus } from './types'

// Tipe callback untuk event listener
type MessageHandler = (msg: Message) => void
type StatusHandler = (status: ConnectionStatus) => void

// Konfigurasi reconnect
const RECONNECT_BASE_DELAY_MS = 1000   // mulai dari 1 detik
const RECONNECT_MAX_DELAY_MS  = 30000  // maksimum 30 detik
const RECONNECT_MAX_ATTEMPTS  = 10     // stop setelah 10 kali gagal

/**
 * WsClient — abstraksi WebSocket dengan auto-reconnect dan event listener.
 *
 * Desain: bukan singleton global, tapi instance yang dikontrol oleh React component.
 * Alasan: lebih mudah di-cleanup saat komponen unmount (hindari memory leak).
 *
 * Pola EventEmitter sederhana dipakai agar komponen bisa subscribe ke event
 * tanpa coupling langsung ke objek WebSocket (yang bisa saja null saat reconnect).
 */
export class WsClient {
  private ws: WebSocket | null = null
  private urlOrGetter: string | (() => string)
  private reconnectAttempts = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private destroyed = false
  private outboundQueue: Message[] = []
  private readonly MAX_QUEUE_SIZE = 100

  // Listener arrays — komponen bisa subscribe ke event ini
  private messageHandlers: MessageHandler[] = []
  private statusHandlers: StatusHandler[] = []

  constructor(urlOrGetter: string | (() => string)) {
    this.urlOrGetter = urlOrGetter
  }

  private getUrl(): string {
    let url = typeof this.urlOrGetter === 'function' ? this.urlOrGetter() : this.urlOrGetter
    // Jika URL belum memiliki query token, otomatis tambahkan dari localStorage jika tersedia
    if (!url.includes('token=') && typeof window !== 'undefined') {
      const token = localStorage.getItem('wuzz_auth_token')
      if (token) {
        url += (url.includes('?') ? '&' : '?') + `token=${encodeURIComponent(token)}`
      }
    }
    // Sertakan device_id jika belum ada di URL untuk validasi Single Active Device Gatekeeper
    if (!url.includes('device_id=') && typeof window !== 'undefined') {
      const deviceId = localStorage.getItem('wuzz_device_id')
      if (deviceId) {
        url += (url.includes('?') ? '&' : '?') + `device_id=${encodeURIComponent(deviceId)}`
      }
    }
    return url
  }

  // ----------------------------------------------------------------
  // Public API
  // ----------------------------------------------------------------

  /** Mulai koneksi WebSocket */
  connect() {
    if (this.destroyed) return
    this._connect()
  }

  /** Kirim pesan ke server (dengan jaminan antrean jika koneksi terputus/reconnecting) */
  send(msg: Message) {
    // Pastikan pesan durable memiliki request_id untuk korelasi ACK
    if (msg.type === 'message' && !msg.request_id) {
      msg.request_id = msg.id || ('req_' + Math.random().toString(36).slice(2) + Date.now())
    }

    const isDurable = msg.type === 'message' || msg.type === 'reaction' || msg.type === 'receipt'

    if (isDurable) {
      // Masukkan ke outboundQueue jika belum ada (anti-duplicate di antrean lokal)
      const identifier = msg.request_id || msg.id
      const exists = identifier && this.outboundQueue.some(item => (item.request_id || item.id) === identifier)
      if (!exists) {
        if (this.outboundQueue.length >= this.MAX_QUEUE_SIZE) {
          this.outboundQueue.shift() // Drop terlama jika antrean meluap
        }
        this.outboundQueue.push(msg)
      }
    }

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg))
    } else {
      console.log(`[WsClient] Socket belum siap, pesan disimpan di antrean keluar (total: ${this.outboundQueue.length})`)
    }
  }

  /** Subscribe ke event pesan masuk */
  onMessage(handler: MessageHandler) {
    this.messageHandlers.push(handler)
    // Return unsubscribe function (pola teardown untuk useEffect)
    return () => {
      this.messageHandlers = this.messageHandlers.filter(h => h !== handler)
    }
  }

  /** Subscribe ke perubahan status koneksi */
  onStatus(handler: StatusHandler) {
    this.statusHandlers.push(handler)
    return () => {
      this.statusHandlers = this.statusHandlers.filter(h => h !== handler)
    }
  }

  /**
   * Tutup koneksi dan hentikan semua proses reconnect.
   * Harus dipanggil di useEffect cleanup untuk menghindari memory leak.
   */
  destroy() {
    this.destroyed = true
    this.outboundQueue = []
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.ws?.close(1000, 'client destroyed')
    this.ws = null
    this.messageHandlers = []
    this.statusHandlers = []
  }

  // ----------------------------------------------------------------
  // Internal
  // ----------------------------------------------------------------

  private _connect() {
    this._emitStatus('connecting')

    try {
      const targetUrl = this.getUrl()
      this.ws = new WebSocket(targetUrl)
    } catch (err) {
      console.error('[WsClient] gagal buat WebSocket:', err)
      this._scheduleReconnect()
      return
    }

    this.ws.onopen = () => {
      this.reconnectAttempts = 0
      this._emitStatus('connected')

      // Kirim ulang seluruh pesan yang tertahan di antrean keluar
      if (this.outboundQueue.length > 0) {
        console.log(`[WsClient] Mengirim ${this.outboundQueue.length} pesan tertunda dari antrean keluar...`)
        for (const pendingMsg of [...this.outboundQueue]) {
          if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(pendingMsg))
          }
        }
      }
    }

    this.ws.onmessage = (event) => {
      try {
        const msg: Message = JSON.parse(event.data as string)

        // Penanganan ACK transport: Hapus pesan dari antrean keluar secara deterministik
        if (msg.type === 'ack' && msg.request_id) {
          this.outboundQueue = this.outboundQueue.filter(item => (item.request_id || item.id) !== msg.request_id)
        } else if (msg.type === 'receipt' && msg.id) {
          this.outboundQueue = this.outboundQueue.filter(item => item.id !== msg.id && item.request_id !== msg.id)
        }

        this.messageHandlers.forEach(h => h(msg))
      } catch {
        console.error('[WsClient] pesan tidak valid JSON:', event.data)
      }
    }

    this.ws.onclose = (event) => {
      // code 1000 = close normal (dipanggil oleh destroy())
      // code 4001 = SESSION_REPLACED / DEVICE_KICKED (akun dibuka dari perangkat lain / di-kick, dilarang reconnect!)
      if (event.code === 4001 || event.reason?.includes('SESSION_REPLACED') || event.reason?.includes('DEVICE_KICKED')) {
        const isKicked = event.reason?.includes('DEVICE_KICKED')
        console.warn(`[WsClient] Sesi ditutup terminal (Code 4001 / ${event.reason || 'KICKED'}). Menghentikan auto-reconnect.`)
        this.destroyed = true
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
        this._emitStatus('disconnected')
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('wuzz:session_replaced', { detail: { reason: event.reason } }))
        }
        // Pastikan UI menerima event agar modal konflik / notifikasi kick muncul seketika
        this.messageHandlers.forEach(h => h({
          type: 'system',
          content: event.reason || (isKicked ? 'DEVICE_KICKED: Perangkat ini telah dikeluarkan.' : 'SESSION_REPLACED: Akun Anda dibuka dari perangkat lain.'),
          timestamp: new Date().toISOString(),
        }))
        return
      }

      if (this.destroyed || event.code === 1000) return
      this._emitStatus('disconnected')
      this._scheduleReconnect()
    }

    this.ws.onerror = () => {
      // onerror selalu diikuti onclose, cukup log saja
      console.warn('[WsClient] WebSocket error')
    }
  }

  /**
   * Exponential backoff reconnect.
   * Delay: 1s, 2s, 4s, 8s, ... sampai max 30s.
   */
  private _scheduleReconnect() {
    if (this.destroyed) return
    if (this.reconnectAttempts >= RECONNECT_MAX_ATTEMPTS) {
      console.error('[WsClient] reconnect gagal setelah', RECONNECT_MAX_ATTEMPTS, 'percobaan')
      return
    }

    const delay = Math.min(
      RECONNECT_BASE_DELAY_MS * Math.pow(2, this.reconnectAttempts),
      RECONNECT_MAX_DELAY_MS
    )

    this.reconnectAttempts++
    this._emitStatus('reconnecting')

    console.log(`[WsClient] reconnect ke-${this.reconnectAttempts} dalam ${delay}ms`)

    this.reconnectTimer = setTimeout(() => {
      if (!this.destroyed) this._connect()
    }, delay)
  }

  private _emitStatus(status: ConnectionStatus) {
    this.statusHandlers.forEach(h => h(status))
  }
}
