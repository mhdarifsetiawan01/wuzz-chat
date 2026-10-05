/**
 * Pelacak status media panggilan (terpisah dari status sinyal).
 *
 * - Status berasal dari RTCPeerConnection.connectionState, bukan dari pesan `call_answer` (yang hanya berarti "dijawab").
 * - Setelah panggilan dijawab (`arm`), media harus tersambung dalam `timeoutMs`; bila tidak, status menjadi 'failed'
 *   agar UI jujur. Bila media tersambung terlambat, status pulih menjadi 'connected'.
 * - Murni dan dapat diuji: timer dan jam bisa disuntikkan.
 */
import { MediaState, mapPeerConnectionState } from '../services/webrtcService';

export const MEDIA_CONNECT_TIMEOUT_MS = 25000;

export interface MediaSnapshot {
  state: MediaState;
  /** Waktu (ms epoch) media pertama kali tersambung. */
  connectedAt?: number;
}

export interface MediaStateTrackerOptions {
  timeoutMs?: number;
  setTimer?: (fn: () => void, ms: number) => any;
  clearTimer?: (handle: any) => void;
  now?: () => number;
}

export class MediaStateTracker {
  private state: MediaState | null = null;
  private connectedAt: number | undefined;
  private armedAt: number | undefined;
  private timer: any = null;
  private readonly timeoutMs: number;
  private readonly setTimer: (fn: () => void, ms: number) => any;
  private readonly clearTimer: (handle: any) => void;
  private readonly now: () => number;

  constructor(private readonly onChange: (snapshot: MediaSnapshot) => void, options: MediaStateTrackerOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? MEDIA_CONNECT_TIMEOUT_MS;
    this.setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = options.clearTimer ?? ((h) => clearTimeout(h));
    this.now = options.now ?? (() => Date.now());
  }

  /** Panggil saat panggilan dijawab: mulai batas waktu penyambungan media. */
  arm(): void {
    this.stopTimer();
    this.armedAt = this.now();
    if (this.state !== 'connected') {
      this.emit('connecting');
      this.timer = this.setTimer(() => {
        this.timer = null;
        if (this.state !== 'connected') this.emit('failed');
      }, this.timeoutMs);
    }
  }

  /** Teruskan RTCPeerConnection.connectionState mentah. State 'new'/'closed' diabaikan. */
  onPeerState(raw: string): void {
    const mapped = mapPeerConnectionState(raw);
    if (!mapped) return;
    if (mapped === 'connected') {
      this.stopTimer();
      if (this.connectedAt === undefined) this.connectedAt = this.now();
    } else if (mapped === 'failed') {
      this.stopTimer();
    }
    this.emit(mapped);
  }

  /** Lama (ms) dari dijawab sampai media tersambung; undefined bila belum. */
  get msToConnect(): number | undefined {
    return this.armedAt !== undefined && this.connectedAt !== undefined ? this.connectedAt - this.armedAt : undefined;
  }

  /** Panggil saat panggilan berakhir/dimulai baru. */
  reset(): void {
    this.stopTimer();
    this.state = null;
    this.connectedAt = undefined;
    this.armedAt = undefined;
  }

  private stopTimer(): void {
    if (this.timer !== null) {
      this.clearTimer(this.timer);
      this.timer = null;
    }
  }

  private emit(state: MediaState): void {
    if (this.state === state) return;
    this.state = state;
    this.onChange({ state, connectedAt: this.connectedAt });
  }
}
