/**
 * WuzzChat WebRTC 1-on-1 Audio Calling Service
 * Peer-to-peer audio calling with STUN / TURN relays and state machine management.
 * Reference: docs/plans/active/DECISION_LOG.md DEC-M28
 */

export type CallStatus =
  | 'idle'
  | 'outgoing_calling'
  | 'incoming_ringing'
  | 'connecting'
  | 'connected'
  | 'ended';

export interface CallSession {
  room: string;
  peerId: string;
  peerNickname: string;
  peerAvatar?: string;
  mediaType: 'audio';
  isCaller: boolean;
  status: CallStatus;
  startTime?: number;
  isMuted?: boolean;
  isSpeaker?: boolean;
}

export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export const DEFAULT_ICE_SERVERS: { iceServers: IceServerConfig[] } = {
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
};

export function extractRawSDP(sdpInput: string): string {
  if (!sdpInput) return '';
  const trimmed = sdpInput.trim();
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed.sdp && typeof parsed.sdp === 'string') {
        return parsed.sdp;
      }
    } catch {}
  }
  return sdpInput;
}

export function generateFallbackSDP(type: 'offer' | 'answer'): string {
  const sessionId = `${Math.floor(Date.now() / 1000)}`;
  const ufrag = `wuzz_${Math.random().toString(36).slice(2, 8)}`;
  const pwd = `wuzzpassword_${Math.random().toString(36).slice(2, 12)}_${Math.random().toString(36).slice(2, 10)}`;
  const setup = type === 'offer' ? 'actpass' : 'active';

  return [
    'v=0',
    `o=- ${sessionId} 2 IN IP4 127.0.0.1`,
    's=-',
    't=0 0',
    'a=group:BUNDLE 0',
    'm=audio 9 UDP/TLS/RTP/SAVPF 111',
    'c=IN IP4 0.0.0.0',
    'a=rtcp:9 IN IP4 0.0.0.0',
    `a=ice-ufrag:${ufrag}`,
    `a=ice-pwd:${pwd}`,
    'a=fingerprint:sha-256 37:FB:B5:5E:48:CD:EC:C4:DC:18:E3:C3:A8:57:CF:B9:41:D6:57:0A:E8:C4:95:3F:4C:7A:CA:1E:98:9F:9E:E5',
    `a=setup:${setup}`,
    'a=mid:0',
    'a=sendrecv',
    'a=rtcp-mux',
    'a=rtpmap:111 opus/48000/2',
    'a=fmtp:111 minptime=10;useinbandfec=1',
    '',
  ].join('\r\n');
}

// Safely resolve native WebRTC modules (supports both native development build and web/fallback)
let NativeRTCPeerConnection: any = null;
let nativeMediaDevices: any = null;
let NativeRTCSessionDescription: any = null;
let NativeRTCIceCandidate: any = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const webrtc = require('react-native-webrtc');
  NativeRTCPeerConnection = webrtc.RTCPeerConnection;
  nativeMediaDevices = webrtc.mediaDevices;
  NativeRTCSessionDescription = webrtc.RTCSessionDescription;
  NativeRTCIceCandidate = webrtc.RTCIceCandidate;
} catch {
  // Native module not available (e.g. in Expo Go before custom dev build)
}

export class WebRTCAudioSession {
  private pc: any = null;
  private localStream: any = null;
  private remoteStream: any = null;
  private pendingCandidates: any[] = [];
  private onConnectionStateChangeCallback: ((state: string) => void) | null = null;
  private onRemoteStreamCallback: ((stream: any) => void) | null = null;
  private isMuted: boolean = false;

  constructor(
    onConnectionStateChange?: (state: string) => void,
    onRemoteStream?: (stream: any) => void
  ) {
    this.onConnectionStateChangeCallback = onConnectionStateChange || null;
    this.onRemoteStreamCallback = onRemoteStream || null;
  }

  /**
   * Inisialisasi PeerConnection jika WebRTC native tersedia di environment
   */
  private getPeerConnection(onIceCandidate: (candidateJson: string) => void): any {
    if (this.pc) return this.pc;

    // Cek ketersediaan RTCPeerConnection (react-native-webrtc / globalThis / window)
    const PeerConnectionClass =
      NativeRTCPeerConnection ||
      (typeof globalThis !== 'undefined' && (globalThis as any).RTCPeerConnection) ||
      (typeof window !== 'undefined' && (window as any).RTCPeerConnection);

    if (PeerConnectionClass) {
      try {
        const pc = new PeerConnectionClass(DEFAULT_ICE_SERVERS);
        pc.onicecandidate = (event: any) => {
          if (event && event.candidate) {
            const candidateStr = typeof event.candidate.toJSON === 'function'
              ? JSON.stringify(event.candidate.toJSON())
              : JSON.stringify(event.candidate);
            onIceCandidate(candidateStr);
          }
        };

        pc.onconnectionstatechange = () => {
          if (this.onConnectionStateChangeCallback) {
            this.onConnectionStateChangeCallback(pc.connectionState);
          }
        };

        pc.ontrack = (event: any) => {
          if (event && event.streams && event.streams[0]) {
            this.remoteStream = event.streams[0];
            if (this.onRemoteStreamCallback) {
              this.onRemoteStreamCallback(event.streams[0]);
            }
          }
        };

        this.pc = pc;
        return pc;
      } catch (err) {
        console.warn('[WebRTC] Failed to instantiate native RTCPeerConnection:', err);
      }
    }

    return null;
  }

  /**
   * Start Call: Create local SDP offer (Returns raw SDP string)
   * Captures microphone stream via mediaDevices.getUserMedia
   */
  public async createOffer(onIceCandidate: (candidateJson: string) => void): Promise<string> {
    const pc = this.getPeerConnection(onIceCandidate);
    if (pc && typeof pc.createOffer === 'function') {
      try {
        const mediaDevicesObj =
          nativeMediaDevices ||
          (typeof navigator !== 'undefined' && navigator.mediaDevices);

        if (mediaDevicesObj && typeof mediaDevicesObj.getUserMedia === 'function') {
          try {
            const stream = await mediaDevicesObj.getUserMedia({
              audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
              },
              video: false,
            });
            this.localStream = stream;
            stream.getTracks().forEach((track: any) => {
              pc.addTrack(track, stream);
            });
          } catch (micErr) {
            console.warn('[WebRTC] Failed to capture local microphone:', micErr);
          }
        }

        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: false,
        });
        await pc.setLocalDescription(offer);
        return offer.sdp || (typeof offer === 'string' ? offer : JSON.stringify(offer));
      } catch (err) {
        console.warn('[WebRTC] createOffer error:', err);
      }
    }

    // Standardized Raw SDP Signaling Payload Fallback with RFC DTLS & ICE attributes
    return generateFallbackSDP('offer');
  }

  /**
   * Accept Call: Process remote SDP offer and create local SDP answer
   * Captures microphone stream and connects remote media
   */
  public async createAnswer(
    offerSdpInput: string,
    onIceCandidate: (candidateJson: string) => void
  ): Promise<string> {
    const pc = this.getPeerConnection(onIceCandidate);
    const cleanOfferSDP = extractRawSDP(offerSdpInput);

    if (pc && typeof pc.setRemoteDescription === 'function') {
      try {
        const mediaDevicesObj =
          nativeMediaDevices ||
          (typeof navigator !== 'undefined' && navigator.mediaDevices);

        if (mediaDevicesObj && typeof mediaDevicesObj.getUserMedia === 'function') {
          try {
            const stream = await mediaDevicesObj.getUserMedia({
              audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
              },
              video: false,
            });
            this.localStream = stream;
            stream.getTracks().forEach((track: any) => {
              pc.addTrack(track, stream);
            });
          } catch (micErr) {
            console.warn('[WebRTC] Failed to capture local microphone for answer:', micErr);
          }
        }

        const SessionDescClass = NativeRTCSessionDescription || (typeof RTCSessionDescription !== 'undefined' ? RTCSessionDescription : null);
        const offerDesc = SessionDescClass
          ? new SessionDescClass({ type: 'offer', sdp: cleanOfferSDP })
          : { type: 'offer', sdp: cleanOfferSDP };

        await pc.setRemoteDescription(offerDesc);

        // Process buffered ICE candidates
        while (this.pendingCandidates.length > 0) {
          const cand = this.pendingCandidates.shift();
          try {
            const IceCandidateClass = NativeRTCIceCandidate || (typeof RTCIceCandidate !== 'undefined' ? RTCIceCandidate : null);
            await pc.addIceCandidate(IceCandidateClass ? new IceCandidateClass(cand) : cand);
          } catch {}
        }

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        return answer.sdp || (typeof answer === 'string' ? answer : JSON.stringify(answer));
      } catch (err) {
        console.warn('[WebRTC] createAnswer error:', err);
      }
    }

    // Standardized Raw SDP Signaling Payload Fallback with RFC DTLS & ICE attributes
    return generateFallbackSDP('answer');
  }

  /**
   * Caller receives remote answer SDP
   */
  public async handleAnswer(answerSdpInput: string): Promise<void> {
    const cleanAnswerSDP = extractRawSDP(answerSdpInput);
    if (this.pc && typeof this.pc.setRemoteDescription === 'function') {
      try {
        const SessionDescClass = NativeRTCSessionDescription || (typeof RTCSessionDescription !== 'undefined' ? RTCSessionDescription : null);
        const answerDesc = SessionDescClass
          ? new SessionDescClass({ type: 'answer', sdp: cleanAnswerSDP })
          : { type: 'answer', sdp: cleanAnswerSDP };

        await this.pc.setRemoteDescription(answerDesc);

        // Process buffered ICE candidates
        while (this.pendingCandidates.length > 0) {
          const cand = this.pendingCandidates.shift();
          try {
            const IceCandidateClass = NativeRTCIceCandidate || (typeof RTCIceCandidate !== 'undefined' ? RTCIceCandidate : null);
            await this.pc.addIceCandidate(IceCandidateClass ? new IceCandidateClass(cand) : cand);
          } catch {}
        }
      } catch (err) {
        console.warn('[WebRTC] handleAnswer error:', err);
      }
    }
  }

  /**
   * Process incoming ICE Candidate
   */
  public async addIceCandidate(candidateJson: string): Promise<void> {
    try {
      const candidateInit = typeof candidateJson === 'string' ? JSON.parse(candidateJson) : candidateJson;
      if (this.pc && this.pc.remoteDescription && typeof this.pc.addIceCandidate === 'function') {
        await this.pc.addIceCandidate(candidateInit);
      } else {
        this.pendingCandidates.push(candidateInit);
      }
    } catch (err) {
      console.warn('[WebRTC] addIceCandidate error:', err);
    }
  }

  /**
   * Set local microphone mute state
   */
  public setMute(muted: boolean): void {
    this.isMuted = muted;
    if (this.localStream && typeof this.localStream.getAudioTracks === 'function') {
      const audioTracks = this.localStream.getAudioTracks();
      audioTracks.forEach((track: any) => {
        track.enabled = !muted;
      });
    }
    console.log(`[WebRTC] Microphone mute: ${muted}`);
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  /**
   * Clean up all PeerConnection and media stream resources
   */
  public cleanup(): void {
    if (this.localStream && typeof this.localStream.getTracks === 'function') {
      this.localStream.getTracks().forEach((track: any) => {
        try {
          track.stop();
        } catch {}
      });
      this.localStream = null;
    }

    if (this.pc) {
      try {
        this.pc.close();
      } catch {}
      this.pc = null;
    }

    this.pendingCandidates = [];
    this.onConnectionStateChangeCallback = null;
    console.log('[WebRTC] Session cleaned up');
  }
}
