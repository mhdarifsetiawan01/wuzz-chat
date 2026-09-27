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
import { useAuth } from './AuthContext';
import {
  CallSession,
  CallStatus,
  WebRTCAudioSession,
  callAudioManager,
  websocketClient,
  LocalCallRecord,
  saveCallRecord,
  getCallHistory,
  clearCallHistory as clearCallHistoryStorage,
  deleteCallRecord as deleteCallRecordStorage,
} from '../services';
import { startDirectChat } from '../api/users';

interface CallContextType {
  activeCall: CallSession | null;
  callDuration: number;
  isMuted: boolean;
  isSpeaker: boolean;
  callHistory: LocalCallRecord[];
  isLoadingHistory: boolean;
  refreshCallHistory: () => Promise<void>;
  deleteCallRecord: (recordId: string) => Promise<void>;
  clearAllCallHistory: () => Promise<void>;
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
  const { user } = useAuth();
  const [activeCall, setActiveCall] = useState<CallSession | null>(null);
  const [callDuration, setCallDuration] = useState<number>(0);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isSpeaker, setIsSpeaker] = useState<boolean>(false);
  const [callHistory, setCallHistory] = useState<LocalCallRecord[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);

  const activeCallRef = useRef<CallSession | null>(null);
  activeCallRef.current = activeCall;

  const callDurationRef = useRef<number>(0);
  callDurationRef.current = callDuration;

  const loggedCallIdRef = useRef<string | null>(null);

  const webrtcSessionRef = useRef<WebRTCAudioSession | null>(null);
  const pendingOfferSdpRef = useRef<string | null>(null);
  const earlyIceCandidatesRef = useRef<string[]>([]);
  const durationTimerRef = useRef<any>(null);

  // Load call history from SQLite
  const refreshCallHistory = useCallback(async () => {
    if (!user?.id) {
      setCallHistory([]);
      return;
    }
    setIsLoadingHistory(true);
    try {
      const records = await getCallHistory(user.id);
      setCallHistory(records);
    } catch (err) {
      console.warn('[CallContext] Failed to load call history:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  }, [user?.id]);

  useEffect(() => {
    refreshCallHistory();
  }, [refreshCallHistory]);

  const deleteCallRecord = useCallback(async (recordId: string) => {
    await deleteCallRecordStorage(recordId);
    setCallHistory((prev) => prev.filter((r) => r.id !== recordId));
  }, []);

  const clearAllCallHistory = useCallback(async () => {
    if (!user?.id) return;
    await clearCallHistoryStorage(user.id);
    setCallHistory([]);
  }, [user?.id]);

  // Record call to local SQLite (Single Invocation Guard DEC-M33)
  const recordCallLog = useCallback(
    async (
      session: CallSession | null,
      finalStatus: string,
      durationOverride?: number
    ) => {
      if (!session || !user?.id) return;

      const sessionStartTime = session.startTime || 0;
      const callKey = `${session.room}_${session.isCaller ? 'out' : 'in'}_${sessionStartTime || session.peerId}`;
      if (loggedCallIdRef.current === callKey) {
        return;
      }
      loggedCallIdRef.current = callKey;

      let callType: 'incoming' | 'outgoing' | 'missed';
      if (session.isCaller) {
        callType = 'outgoing';
      } else if (session.status === 'connected' || finalStatus === 'completed') {
        callType = 'incoming';
      } else {
        callType = 'missed';
      }

      let finalDuration = 0;
      if (callType !== 'missed') {
        if (typeof durationOverride === 'number' && durationOverride > 0) {
          finalDuration = durationOverride;
        } else if (sessionStartTime > 0) {
          finalDuration = Math.max(0, Math.floor((Date.now() - sessionStartTime) / 1000));
        } else {
          finalDuration = callDurationRef.current;
        }
      }

      const record: LocalCallRecord = {
        id: `call_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        user_id: user.id,
        peer_id: session.peerId,
        peer_username: session.peerNickname,
        peer_display_name: session.peerNickname,
        call_type: callType,
        duration_seconds: finalDuration,
        created_at: sessionStartTime || Date.now(),
        status: finalStatus,
      };

      try {
        await saveCallRecord(record);
        setCallHistory((prev) => [record, ...prev.filter((r) => r.id !== record.id)]);
      } catch (e) {
        console.warn('[CallContext] Failed to save call record:', e);
      }
    },
    [user?.id]
  );

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
   * DEC-M34: Supports automatic room resolution if roomId is omitted or empty.
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
      loggedCallIdRef.current = null;

      // Auto-resolve room ID if empty
      let targetRoomId = roomId;
      if (!targetRoomId) {
        try {
          const directRes = await startDirectChat(peerId);
          if (directRes?.room_id) {
            targetRoomId = directRes.room_id;
          } else {
            throw new Error('No room_id returned from startDirectChat');
          }
        } catch (err: any) {
          console.error('[CallContext] Failed to resolve room for call:', err);
          Alert.alert('Gagal Memulai Panggilan', 'Tidak dapat membuat sesi percakapan dengan kontak.');
          return false;
        }
      }

      const newCall: CallSession = {
        room: targetRoomId,
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
          websocketClient.sendIceCandidate(targetRoomId, candidateJson);
        });

        // 4. Send SDP Offer via WebSocket signaling
        websocketClient.sendCallOffer(targetRoomId, offerSdp, peerId);
        return true;
      } catch (err) {
        console.error('[CallContext] Failed to start call:', err);
        recordCallLog(newCall, 'failed', 0);
        cleanupCallSession();
        setActiveCall({ ...newCall, status: 'ended' });
        setTimeout(() => setActiveCall(null), 1500);
        return false;
      }
    },
    [cleanupCallSession, recordCallLog]
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
      recordCallLog(current, 'failed', 0);
      cleanupCallSession();
      setActiveCall((prev) => (prev ? { ...prev, status: 'ended' } : null));
      setTimeout(() => setActiveCall(null), 1500);
    }
  }, [cleanupCallSession, isSpeaker, recordCallLog]);

  /**
   * Reject incoming call
   */
  const rejectCall = useCallback(() => {
    const current = activeCallRef.current;
    if (current) {
      websocketClient.sendCallReject(current.room);
      recordCallLog(current, 'rejected', 0);
    }
    cleanupCallSession();
    setActiveCall((prev) => (prev ? { ...prev, status: 'ended' } : null));
    setTimeout(() => setActiveCall(null), 1000);
  }, [cleanupCallSession, recordCallLog]);

  /**
   * Hang up / End active or outgoing call
   */
  const endCall = useCallback(() => {
    const current = activeCallRef.current;
    if (current) {
      websocketClient.sendCallEnd(current.room);
      const finalStatus =
        current.status === 'connected'
          ? 'completed'
          : current.isCaller
          ? 'cancelled'
          : 'missed';
      recordCallLog(current, finalStatus, callDurationRef.current);
    }
    cleanupCallSession();
    setActiveCall((prev) => (prev ? { ...prev, status: 'ended' } : null));
    setTimeout(() => setActiveCall(null), 1000);
  }, [cleanupCallSession, recordCallLog]);

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

      loggedCallIdRef.current = null;
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
      const current = activeCallRef.current;
      if (current) {
        recordCallLog(current, 'rejected', 0);
      }
      cleanupCallSession();
      setActiveCall((prev) => (prev ? { ...prev, status: 'ended' } : null));
      setTimeout(() => setActiveCall(null), 1500);
    });

    const unsubEnd = websocketClient.on('call_end', () => {
      const current = activeCallRef.current;
      if (current) {
        const finalStatus =
          current.status === 'connected'
            ? 'completed'
            : current.isCaller
            ? 'cancelled'
            : 'missed';
        recordCallLog(current, finalStatus, callDurationRef.current);
      }
      cleanupCallSession();
      setActiveCall((prev) => (prev ? { ...prev, status: 'ended' } : null));
      setTimeout(() => setActiveCall(null), 1200);
    });

    const unsubBusy = websocketClient.on('call_busy', () => {
      const current = activeCallRef.current;
      if (current) {
        recordCallLog(current, 'busy', 0);
      }
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
  }, [cleanupCallSession, isSpeaker, recordCallLog]);

  return (
    <CallContext.Provider
      value={{
        activeCall,
        callDuration,
        isMuted,
        isSpeaker,
        callHistory,
        isLoadingHistory,
        refreshCallHistory,
        deleteCallRecord,
        clearAllCallHistory,
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
