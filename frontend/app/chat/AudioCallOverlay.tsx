'use client'

import { useState, useEffect } from 'react'
import type { ActiveCallInfo } from '@/lib/types'
import { getAvatarStyle } from '@/lib/avatarColor'

interface AudioCallOverlayProps {
  callInfo: ActiveCallInfo | null
  isMuted: boolean
  onToggleMute: () => void
  onEndCall: () => void
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

export function AudioCallOverlay({
  callInfo,
  isMuted,
  onToggleMute,
  onEndCall,
}: AudioCallOverlayProps) {
  const [duration, setDuration] = useState(0)

  // Hitung timer durasi saat panggilan connected
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null
    if (callInfo?.status === 'connected' && callInfo.startTime) {
      setDuration(Math.floor((Date.now() - callInfo.startTime) / 1000))
      timer = setInterval(() => {
        setDuration(Math.floor((Date.now() - (callInfo.startTime || Date.now())) / 1000))
      }, 1000)
    } else {
      setDuration(0)
    }
    return () => {
      if (timer) clearInterval(timer)
    }
  }, [callInfo?.status, callInfo?.startTime])

  if (!callInfo || callInfo.status === 'idle' || callInfo.status === 'incoming_ringing') {
    return null
  }

  const initial = (callInfo.peerNickname || '?')[0].toUpperCase()

  const getStatusText = () => {
    switch (callInfo.status) {
      case 'outgoing_ringing':
        return 'Memanggil...'
      case 'connecting':
        return 'Menghubungkan...'
      case 'connected':
        return formatDuration(duration)
      case 'ended':
        return 'Panggilan Berakhir'
      default:
        return ''
    }
  }

  return (
    <div className="audio-call-overlay" role="dialog" aria-modal="true" aria-label="Panggilan Suara">
      <div className="audio-call-card">
        {/* Header info */}
        <div className="audio-call-header">
          <span className="audio-call-badge">🔒 Panggilan Suara P2P</span>
        </div>

        {/* Avatar & Pulse Wave */}
        <div className="audio-call-center">
          <div className={`audio-call-avatar-wrapper ${callInfo.status === 'connected' ? 'in-call-wave' : 'ringing-wave'}`}>
            <div className="audio-call-pulse-ring"></div>
            <div className="audio-call-pulse-ring delay-1"></div>
            <div className="audio-call-avatar" style={getAvatarStyle(callInfo.peerNickname || '?')}>
              {initial}
            </div>
          </div>

          <h2 className="audio-call-name">{callInfo.peerNickname}</h2>
          <p className={`audio-call-timer ${callInfo.status === 'connected' ? 'connected' : ''}`}>
            {getStatusText()}
          </p>
        </div>

        {/* Controls Toolbar */}
        <div className="audio-call-controls">
          {/* Mute Button */}
          <button
            type="button"
            className={`audio-call-ctrl-btn ${isMuted ? 'muted' : ''}`}
            onClick={onToggleMute}
            title={isMuted ? 'Aktifkan Mikrofon' : 'Bisukan Mikrofon'}
            aria-label={isMuted ? 'Aktifkan Mikrofon' : 'Bisukan Mikrofon'}
            disabled={callInfo.status !== 'connected'}
          >
            {isMuted ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="1" y1="1" x2="23" y2="23" />
                <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            )}
            <span className="ctrl-label">{isMuted ? 'Muted' : 'Mute'}</span>
          </button>

          {/* End Call Button */}
          <button
            type="button"
            className="audio-call-ctrl-btn end-call"
            onClick={onEndCall}
            title="Tutup Telepon"
            aria-label="Tutup Telepon"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-6-6 19.8 19.8 0 0 1-3.11-8.69A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
            <span className="ctrl-label">Tutup</span>
          </button>
        </div>
      </div>
    </div>
  )
}
