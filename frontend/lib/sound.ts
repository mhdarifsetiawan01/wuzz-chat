/**
 * Sound FX Synthesizer using Web Audio API
 * Generates procedural audio for sending and receiving messages.
 * 100% zero-dependency, zero network latency, and immune to 404s.
 */

class SoundManager {
  private audioCtx: AudioContext | null = null
  private muted: boolean = false
  private listeners: Set<(muted: boolean) => void> = new Set()

  constructor() {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('wuzz_sound_muted')
      this.muted = saved === 'true'
    }
  }

  private getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null
    if (!this.audioCtx) {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (AudioCtxClass) {
        this.audioCtx = new AudioCtxClass()
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {})
    }
    return this.audioCtx
  }

  public isMuted(): boolean {
    return this.muted
  }

  public setMuted(muted: boolean): void {
    this.muted = muted
    if (typeof window !== 'undefined') {
      localStorage.setItem('wuzz_sound_muted', String(muted))
    }
    this.listeners.forEach(fn => fn(this.muted))
  }

  public toggleMute(): boolean {
    this.setMuted(!this.muted)
    return this.muted
  }

  public onMuteChange(listener: (muted: boolean) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /**
   * Procedural Pop/Bubble sound for outgoing sent message
   */
  public playSend(): void {
    if (this.muted) return
    const ctx = this.getAudioContext()
    if (!ctx) return

    try {
      const now = ctx.currentTime
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = 'sine'
      // Frequency drops quickly from 880Hz (A5) to 320Hz for a crisp pop
      osc.frequency.setValueAtTime(880, now)
      osc.frequency.exponentialRampToValueAtTime(320, now + 0.07)

      gain.gain.setValueAtTime(0.2, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07)

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.start(now)
      osc.stop(now + 0.08)
    } catch {
      // Ignore audio synthesis errors on locked browsers
    }
  }

  /**
   * Procedural Ding/Marimba chime for incoming received message
   */
  public playReceive(): void {
    if (this.muted) return
    const ctx = this.getAudioContext()
    if (!ctx) return

    try {
      const now = ctx.currentTime

      // First note: E5 (659.25 Hz)
      const osc1 = ctx.createOscillator()
      const gain1 = ctx.createGain()
      osc1.type = 'sine'
      osc1.frequency.setValueAtTime(659.25, now)
      gain1.gain.setValueAtTime(0.18, now)
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.15)
      osc1.connect(gain1)
      gain1.connect(ctx.destination)
      osc1.start(now)
      osc1.stop(now + 0.16)

      // Second note: B5 (987.77 Hz) slightly delayed for pleasant chime
      const osc2 = ctx.createOscillator()
      const gain2 = ctx.createGain()
      osc2.type = 'sine'
      osc2.frequency.setValueAtTime(987.77, now + 0.08)
      gain2.gain.setValueAtTime(0.2, now + 0.08)
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.3)
      osc2.connect(gain2)
      gain2.connect(ctx.destination)
      osc2.start(now + 0.08)
      osc2.stop(now + 0.32)
    } catch {
      // Ignore audio synthesis errors on locked browsers
    }
  }

  private callInterval: ReturnType<typeof setInterval> | null = null

  /**
   * Nada sambung panggilan keluar (Outgoing Ringing Tone - Tuuut... Tuuut...)
   */
  public playOutgoingRing(): void {
    if (this.muted) return
    this.stopCallSounds()

    const triggerBurst = () => {
      const ctx = this.getAudioContext()
      if (!ctx) return
      try {
        const now = ctx.currentTime
        const osc1 = ctx.createOscillator()
        const osc2 = ctx.createOscillator()
        const gain = ctx.createGain()

        osc1.type = 'sine'
        osc1.frequency.setValueAtTime(440, now) // A4
        osc2.type = 'sine'
        osc2.frequency.setValueAtTime(480, now)

        gain.gain.setValueAtTime(0.08, now)
        gain.gain.setValueAtTime(0.08, now + 1.2)
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.3)

        osc1.connect(gain)
        osc2.connect(gain)
        gain.connect(ctx.destination)

        osc1.start(now)
        osc2.start(now)
        osc1.stop(now + 1.35)
        osc2.stop(now + 1.35)
      } catch {}
    }

    triggerBurst()
    this.callInterval = setInterval(triggerBurst, 3500)
  }

  /**
   * Nada dering panggilan masuk (Incoming Melodic Ringing Tone)
   */
  public playIncomingRing(): void {
    if (this.muted) return
    this.stopCallSounds()

    const triggerMelody = () => {
      const ctx = this.getAudioContext()
      if (!ctx) return
      try {
        const notes = [
          { freq: 523.25, time: 0.00, dur: 0.15 }, // C5
          { freq: 659.25, time: 0.18, dur: 0.15 }, // E5
          { freq: 783.99, time: 0.36, dur: 0.15 }, // G5
          { freq: 1046.50, time: 0.54, dur: 0.35 }, // C6
          { freq: 783.99, time: 1.00, dur: 0.15 }, // G5
          { freq: 1046.50, time: 1.18, dur: 0.40 }, // C6
        ]

        const baseNow = ctx.currentTime
        notes.forEach(({ freq, time, dur }) => {
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          const start = baseNow + time

          osc.type = 'triangle'
          osc.frequency.setValueAtTime(freq, start)

          gain.gain.setValueAtTime(0.15, start)
          gain.gain.exponentialRampToValueAtTime(0.001, start + dur)

          osc.connect(gain)
          gain.connect(ctx.destination)

          osc.start(start)
          osc.stop(start + dur + 0.05)
        })
      } catch {}
    }

    triggerMelody()
    this.callInterval = setInterval(triggerMelody, 3200)
  }

  /**
   * Menghentikan seluruh suara panggilan (nada sambung & nada dering)
   */
  public stopCallSounds(): void {
    if (this.callInterval) {
      clearInterval(this.callInterval)
      this.callInterval = null
    }
  }
}

export const soundManager = new SoundManager()

export const playOutgoingRing = () => soundManager.playOutgoingRing()
export const playIncomingRing = () => soundManager.playIncomingRing()
export const stopCallSounds = () => soundManager.stopCallSounds()
