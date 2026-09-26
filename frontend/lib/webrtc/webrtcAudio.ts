/**
 * WebRTC 1-on-1 Audio/Voice Calling Session Manager
 * Menggunakan Google Public STUN untuk transmisi audio P2P latensi ultra-rendah.
 */

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    // Google Public STUN Cluster
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    // OpenRelay Public STUN & TURN Relay Cluster (Fallback untuk NAT/Firewall/4G/5G)
    { urls: 'stun:stun.relay.metered.ca:80' },
    {
      urls: 'turn:standard.relay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:standard.relay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:standard.relay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
  iceCandidatePoolSize: 10,
}

function extractRawSDP(sdpInput: string): string {
  if (!sdpInput) return ''
  const trimmed = sdpInput.trim()
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed)
      if (parsed.sdp && typeof parsed.sdp === 'string') {
        return parsed.sdp
      }
    } catch {}
  }
  return sdpInput
}

export class WebRTCAudioSession {
  private pc: RTCPeerConnection | null = null
  private localStream: MediaStream | null = null
  private remoteAudioElem: HTMLAudioElement | null = null
  private pendingCandidates: RTCIceCandidateInit[] = []
  private onRemoteTrackCallback: ((stream: MediaStream) => void) | null = null
  private onConnectionStateChangeCallback: ((state: RTCPeerConnectionState) => void) | null = null

  constructor(
    onRemoteTrack?: (stream: MediaStream) => void,
    onConnectionStateChange?: (state: RTCPeerConnectionState) => void
  ) {
    this.onRemoteTrackCallback = onRemoteTrack || null
    this.onConnectionStateChangeCallback = onConnectionStateChange || null
  }

  /**
   * Inisialisasi PeerConnection dan handler event
   */
  private createPeerConnection(onIceCandidate: (candidateJson: string) => void): RTCPeerConnection {
    const pc = new RTCPeerConnection(ICE_SERVERS)

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        onIceCandidate(JSON.stringify(event.candidate.toJSON()))
      }
    }

    pc.onconnectionstatechange = () => {
      if (this.onConnectionStateChangeCallback) {
        this.onConnectionStateChangeCallback(pc.connectionState)
      }
    }

    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        const remoteStream = event.streams[0]
        this.playRemoteAudio(remoteStream)
        if (this.onRemoteTrackCallback) {
          this.onRemoteTrackCallback(remoteStream)
        }
      }
    }

    return pc
  }

  /**
   * Memutar remote audio stream secara otomatis di background
   */
  private playRemoteAudio(stream: MediaStream): void {
    if (typeof window === 'undefined') return
    if (!this.remoteAudioElem) {
      this.remoteAudioElem = new Audio()
      this.remoteAudioElem.autoplay = true
      this.remoteAudioElem.volume = 1.0
      // Attribute penting untuk mobile Safari / Chrome
      this.remoteAudioElem.setAttribute('playsinline', 'true')
    }
    this.remoteAudioElem.srcObject = stream
    const playPromise = this.remoteAudioElem.play()
    if (playPromise !== undefined) {
      playPromise.catch(err => {
        console.warn('[WebRTC Audio] Autoplay remote audio butuh interaksi pengguna:', err)
      })
    }
  }

  /**
   * Memulai panggilan sebagai Caller (Pemanggil):
   * 1. Akses mikrofon lokal
   * 2. Buat Offer SDP
   */
  public async createOffer(onIceCandidate: (candidateJson: string) => void): Promise<string> {
    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    })

    this.pc = this.createPeerConnection(onIceCandidate)

    // Tambahkan track mikrofon ke peer connection
    this.localStream.getTracks().forEach((track) => {
      if (this.pc && this.localStream) {
        this.pc.addTrack(track, this.localStream)
      }
    })

    const offer = await this.pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: false,
    })

    await this.pc.setLocalDescription(offer)
    return offer.sdp || ''
  }

  /**
   * Menerima panggilan sebagai Callee (Penerima):
   * 1. Set Remote Offer SDP
   * 2. Akses mikrofon lokal
   * 3. Buat Answer SDP
   */
  public async handleOfferAndCreateAnswer(
    offerSDP: string,
    onIceCandidate: (candidateJson: string) => void
  ): Promise<string> {
    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    })

    this.pc = this.createPeerConnection(onIceCandidate)

    // Tambahkan track mikrofon lokal
    this.localStream.getTracks().forEach((track) => {
      if (this.pc && this.localStream) {
        this.pc.addTrack(track, this.localStream)
      }
    })

    const cleanOfferSDP = extractRawSDP(offerSDP)
    await this.pc.setRemoteDescription(
      new RTCSessionDescription({
        type: 'offer',
        sdp: cleanOfferSDP,
      })
    )
    await this.flushPendingCandidates()

    const answer = await this.pc.createAnswer()
    await this.pc.setLocalDescription(answer)

    return answer.sdp || ''
  }

  /**
   * Pemanggil memproses Answer SDP dari penerima
   */
  public async handleAnswer(answerSDP: string): Promise<void> {
    if (!this.pc) return
    const cleanAnswerSDP = extractRawSDP(answerSDP)
    if (this.pc.signalingState === 'have-local-offer') {
      await this.pc.setRemoteDescription(
        new RTCSessionDescription({
          type: 'answer',
          sdp: cleanAnswerSDP,
        })
      )
      await this.flushPendingCandidates()
    }
  }

  private async flushPendingCandidates(): Promise<void> {
    if (!this.pc || !this.pc.remoteDescription) return
    while (this.pendingCandidates.length > 0) {
      const candidateInit = this.pendingCandidates.shift()
      if (candidateInit) {
        try {
          await this.pc.addIceCandidate(new RTCIceCandidate(candidateInit))
        } catch (err) {
          console.warn('[WebRTC Audio] Gagal flush buffered ICE candidate:', err)
        }
      }
    }
  }

  /**
   * Menambahkan ICE Candidate yang diterima via WebSocket (dengan auto-buffer jika remote description belum siap)
   */
  public async addIceCandidate(candidateJson: string): Promise<void> {
    if (!candidateJson) return
    try {
      const candidateInit = JSON.parse(candidateJson) as RTCIceCandidateInit
      if (this.pc && this.pc.remoteDescription && this.pc.remoteDescription.type) {
        await this.pc.addIceCandidate(new RTCIceCandidate(candidateInit))
      } else {
        this.pendingCandidates.push(candidateInit)
      }
    } catch (err) {
      console.warn('[WebRTC Audio] Gagal add ICE candidate:', err)
    }
  }

  /**
   * Mute atau Unmute mikrofon lokal
   */
  public setMute(muted: boolean): void {
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = !muted
      })
    }
  }

  /**
   * Mengakhiri sesi panggilan dan merilis seluruh sumber daya hardware
   */
  public cleanup(): void {
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop())
      this.localStream = null
    }

    if (this.remoteAudioElem) {
      this.remoteAudioElem.pause()
      this.remoteAudioElem.srcObject = null
      this.remoteAudioElem = null
    }

    if (this.pc) {
      this.pc.close()
      this.pc = null
    }

    this.pendingCandidates = []
  }
}
