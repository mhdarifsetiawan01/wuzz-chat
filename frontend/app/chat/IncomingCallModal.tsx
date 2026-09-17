'use client'

import type { ActiveCallInfo } from '@/lib/types'
import { getAvatarStyle } from '@/lib/avatarColor'

interface IncomingCallModalProps {
  callInfo: ActiveCallInfo | null
  onAccept: () => void
  onReject: () => void
}

export function IncomingCallModal({ callInfo, onAccept, onReject }: IncomingCallModalProps) {
  if (!callInfo || callInfo.status !== 'incoming_ringing') {
    return null
  }

  const initial = (callInfo.peerNickname || '?')[0].toUpperCase()

  return (
    <div className="call-modal-overlay" role="dialog" aria-modal="true" aria-label="Panggilan Masuk">
      <div className="call-modal-content">
        <div className="call-avatar-container">
          <div className="call-avatar-pulse"></div>
          <div className="call-avatar-pulse delay-1"></div>
          <div className="call-avatar-circle" style={getAvatarStyle(callInfo.peerNickname || '?')}>
            {initial}
          </div>
        </div>

        <h3 className="call-caller-name">{callInfo.peerNickname}</h3>
        <p className="call-status-label">Panggilan Suara Masuk...</p>

        <div className="call-action-buttons">
          {/* Tombol Tolak */}
          <button
            type="button"
            className="call-btn-reject"
            onClick={onReject}
            title="Tolak Panggilan"
            aria-label="Tolak Panggilan"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-6-6 19.8 19.8 0 0 1-3.11-8.69A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
            <span>Tolak</span>
          </button>

          {/* Tombol Terima */}
          <button
            type="button"
            className="call-btn-accept"
            onClick={onAccept}
            title="Terima Panggilan"
            aria-label="Terima Panggilan"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
            <span>Terima</span>
          </button>
        </div>
      </div>
    </div>
  )
}
