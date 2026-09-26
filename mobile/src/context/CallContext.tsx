/**
 * WuzzChat Call Context & Provider
 * Global state machine and lifecycle manager for 1-on-1 WebRTC audio calls in Mobile.
 * Reference: docs/plans/active/DECISION_LOG.md DEC-M28, DEC-M29, DEC-M30, DEC-M31
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Alert } from 'react-native';
import {
  CallSession,
  CallStatus,
  WebRTCAudioSession,
  callAudioManager,
  websocketClient,
} from '../services';

interface CallContextType {
  activeCall: CallSession | null;
  callDuration: number;
  isMuted: boolean;
  isSpeaker: boolean;
  startCall: (
    roomId: string,
    peerId: string,
    peerNickname: string,
    peerAvatar?: string
  ) => Promise<boolean>;
  acceptCall: () => Promise<void>;
  rejectCall: () => void;
  endCall: () => void;
  toggleMute: () => void;
  toggleSpeaker: () => void;
}

const CallContext = createContext<CallContextType | undefined>(undefined);

export const CallProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeCall, setActiveCall] = useState<CallSession | null>(null);
  const [callDuration, setCallDuration] = useState<number>(0);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isSpeaker, setIsSpeaker] = useState<boolean>(false);

  const activeCallRef = useRef<CallSession | null>(null);
  activeCallRef.current = activeCall;

  const webrtcSessionRef = useRef<WebRTCAudioSession | null>(null);
  const pendingOfferSdpRef = useRef<string | null>(null);
  const earlyIceCandidatesRef = useRef<string[]>([]);
  const durationTimerRef = useRef<any>(null);

  // Clean up timer on unmount or call end
  const clearDurationTimer = useCallback(() => {
    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
  }, []);

  // Update timer during connected call
  useEffect(() => {
    if (activeCall?.status === 'connected') {
      clearDurationTimer();
      setCallDuration(0);
      durationTimerRef.current = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    } else {
      clearDurationTimer();
      if (activeCall?.status !== 'ended') {
        setCallDuration(0);
      }
    }
    return () => clearDurationTimer();
  }, [activeCall?.status, clearDurationTimer]);

  /**
   * Internal session cleanup helper
   */
  const cleanupCallSession = useCallback(() => {
    clearDurationTimer();
    callAudioManager.endCallAudioSession();
    if (webrtcSessionRef.current) {
      webrtcSessionRef.current.cleanup();
      webrtcSessionRef.current = null;
    }
    pendingOfferSdpRef.current = null;
    earlyIceCandidatesRef.current = [];
    setIsMuted(false);
    setIsSpeaker(false);
  }, [clearDurationTimer]);

  /**
   * Start an outgoing 1-on-1 voice call
   */
  const startCall = useCallback(
    async (
      roomId: string,
      peerId: string,
      peerNickname: string,
      peerAvatar?: string
    ): Promise<boolean> => {
      // 1. Validate permissions
      const hasPermission = await callAudioManager.requestMicrophonePermission();
      if (!hasPermission) {
        Alert.alert(
          'Izin Mikrofon Diperlukan',
          'WuzzChat membutuhkan izin akses mikrofon untuk melakukan panggilan suara. Silakan izinkan di pengaturan perangkat.'
        );
        return false;
      }

      // 2. Clean previous state if any
      cleanupCallSession();

      const newCall: CallSession = {
        room: roomId,
        peerId,
        peerNickname,
        peerAvatar,
        mediaType: 'audio',
        isCaller: true,
        status: 'outgoing_calling',
        isMuted: false,
        isSpeaker: false,
      };

      setActiveCall(newCall);
      callAudioManager.playOutgoingRingback();

      // 3. Initialize WebRTC session
      const session = new WebRTCAudioSession();
      webrtcSessionRef.current = session;

      try {
        const offerSdp = await session.createOffer((candidateJson) => {
          websocketClient.sendIceCandidate(roomId, candidateJson);
        });

        // 4. Send SDP Offer via WebSocket signaling
        websocketClient.sendCallOffer(roomId, offerSdp, peerId);
        return true;
      } catch (err) {
        console.error('[CallContext] Failed to start call:', err);
        cleanupCallSession();
        setActiveCall({ ...newCall, status: 'ended' });
        setTimeout(() => setActiveCall(null), 1500);
        return false;
      }
    },
    [cleanupCallSession]
  );

  /**
   * Accept an incoming voice call
   */
  const acceptCall = useCallback(async () => {
    const current = activeCallRef.current;
    if (!current || current.status !== 'incoming_ringing') return;

    // 1. Validate permissions
    const hasPermission = await callAudioManager.requestMicrophonePermission();
    if (!hasPermission) {
      Alert.alert(
        'Izin Mikrofon Diperlukan',
        'WuzzChat membutuhkan izin akses mikrofon untuk menjawab panggilan suara.'
      );
      rejectCall();
      return;
    }

    callAudioManager.stopAllCallTones();
    setActiveCall((prev) => (prev ? { ...prev, status: 'connecting' } : null));

    const session = new WebRTCAudioSession();
    webrtcSessionRef.current = session;

    try {
      const offerSdp = pendingOfferSdpRef.current || '';
      const answerSdp = await session.createAnswer(offerSdp, (candidateJson) => {
        websocketClient.sendIceCandidate(current.room, candidateJson);
      });

      // Send SDP Answer to caller
      websocketClient.sendCallAnswer(current.room, answerSdp);

      // Start Audio Session
      await callAudioManager.startCallAudioSession(isSpeaker);

      setActiveCall((prev) =>
        prev
          ? {
              ...prev,
              status: 'connected',
              startTime: Date.now(),
            }
          : null
      );
    } catch (err) {
      console.error('[CallContext] Failed to accept call:', err);
      cleanupCallSession();
      setActiveCall((prev) => (prev ? { ...prev, status: 'ended' } : null));
      setTimeout(() => setActiveCall(null), 1500);
    }
  }, [cleanupCallSession, isSpeaker]);

  /**
   * Reject incoming call
   */
  const rejectCall = useCallback(() => {
    const current = activeCallRef.current;
    if (current) {
      websocketClient.sendCallReject(current.room);
    }
    cleanupCallSession();
    setActiveCall((prev) => (prev ? { ...prev, status: 'ended' } : null));
    setTimeout(() => setActiveCall(null), 1000);
  }, [cleanupCallSession]);

  /**
   * Hang up / End active or outgoing call
   */
  const endCall = useCallback(() => {
    const current = activeCallRef.current;
    if (current) {
      websocketClient.sendCallEnd(current.room);
    }
    cleanupCallSession();
    setActiveCall((prev) => (prev ? { ...prev, status: 'ended' } : null));
    setTimeout(() => setActiveCall(null), 1000);
  }, [cleanupCallSession]);

  /**
   * Toggle Microphone Mute
   */
  const toggleMute = useCallback(() => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (webrtcSessionRef.current) {
      webrtcSessionRef.current.setMute(nextMuted);
    }
  }, [isMuted]);

  /**
   * Toggle Speakerphone vs Earpiece
   */
  const toggleSpeaker = useCallback(() => {
    const nextSpeaker = !isSpeaker;
    setIsSpeaker(nextSpeaker);
    callAudioManager.setSpeakerphone(nextSpeaker);
  }, [isSpeaker]);

  /**
   * Subscribe to WebSocket Signaling Events
   */
  useEffect(() => {
    const unsubOffer = websocketClient.on('call_offer', (msg: any) => {
      const current = activeCallRef.current;
      if (current && current.status !== 'idle' && current.status !== 'ended') {
        // Already in a call: send busy signal back
        websocketClient.sendCallBusy(msg.room || '');
        return;
      }

      pendingOfferSdpRef.current = msg.sdp || null;
      setActiveCall({
        room: msg.room || '',
        peerId: msg.from || msg.nickname || 'Peer',
        peerNickname: msg.nickname || 'Pengguna WuzzChat',
        mediaType: 'audio',
        isCaller: false,
        status: 'incoming_ringing',
        isMuted: false,
        isSpeaker: false,
      });

      callAudioManager.playIncomingRingtone();
    });

    const unsubAnswer = websocketClient.on('call_answer', (msg: any) => {
      callAudioManager.stopAllCallTones();
      if (msg.sdp && webrtcSessionRef.current) {
        webrtcSessionRef.current.handleAnswer(msg.sdp).catch((err) => {
          console.warn('[CallContext] Error handling remote answer SDP:', err);
        });
      }

      callAudioManager.startCallAudioSession(isSpeaker);
      setActiveCall((prev) =>
        prev
          ? {
              ...prev,
              status: 'connected',
              startTime: Date.now(),
            }
          : null
      );
    });

    const unsubCandidate = websocketClient.on('ice_candidate', (msg: any) => {
      if (msg.candidate) {
        if (webrtcSessionRef.current) {
          webrtcSessionRef.current.addIceCandidate(msg.candidate).catch(() => {});
        } else {
          earlyIceCandidatesRef.current.push(msg.candidate);
        }
      }
    });

    const unsubReject = websocketClient.on('call_reject', () => {
      cleanupCallSession();
      setActiveCall((prev) => (prev ? { ...prev, status: 'ended' } : null));
      setTimeout(() => setActiveCall(null), 1500);
    });

    const unsubEnd = websocketClient.on('call_end', () => {
      cleanupCallSession();
      setActiveCall((prev) => (prev ? { ...prev, status: 'ended' } : null));
      setTimeout(() => setActiveCall(null), 1200);
    });

    const unsubBusy = websocketClient.on('call_busy', () => {
      cleanupCallSession();
      setActiveCall((prev) => (prev ? { ...prev, status: 'ended' } : null));
      Alert.alert('Pengguna Sedang Sibuk', 'Kontak sedang berada dalam panggilan lain.');
      setTimeout(() => setActiveCall(null), 1500);
    });

    return () => {
      unsubOffer();
      unsubAnswer();
      unsubCandidate();
      unsubReject();
      unsubEnd();
      unsubBusy();
    };
  }, [cleanupCallSession, isSpeaker]);

  return (
    <CallContext.Provider
      value={{
        activeCall,
        callDuration,
        isMuted,
        isSpeaker,
        startCall,
        acceptCall,
        rejectCall,
        endCall,
        toggleMute,
        toggleSpeaker,
      }}
    >
      {children}
    </CallContext.Provider>
  );
};

export const useCall = (): CallContextType => {
  const context = useContext(CallContext);
  if (!context) {
    throw new Error('useCall must be used within a CallProvider');
  }
  return context;
};
