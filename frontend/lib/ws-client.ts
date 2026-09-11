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
  private url: string
  private reconnectAttempts = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private destroyed = false

  // Listener arrays — komponen bisa subscribe ke event ini
  private messageHandlers: MessageHandler[] = []
  private statusHandlers: StatusHandler[] = []

  constructor(url: string) {
    this.url = url
  }

  // ----------------------------------------------------------------
  // Public API
  // ----------------------------------------------------------------

  /** Mulai koneksi WebSocket */
  connect() {
    if (this.destroyed) return
    this._connect()
  }

  /** Kirim pesan ke server */
  send(msg: Message) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg))
    } else {
      console.warn('[WsClient] tidak bisa kirim pesan: koneksi belum open')
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
      this.ws = new WebSocket(this.url)
    } catch (err) {
      console.error('[WsClient] gagal buat WebSocket:', err)
      this._scheduleReconnect()
      return
    }

    this.ws.onopen = () => {
      this.reconnectAttempts = 0
      this._emitStatus('connected')
    }

    this.ws.onmessage = (event) => {
      try {
        const msg: Message = JSON.parse(event.data as string)
        this.messageHandlers.forEach(h => h(msg))
      } catch {
        console.error('[WsClient] pesan tidak valid JSON:', event.data)
      }
    }

    this.ws.onclose = (event) => {
      // code 1000 = close normal (dipanggil oleh destroy())
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
