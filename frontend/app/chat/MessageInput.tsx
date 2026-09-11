'use client'

import { useState, useRef, useCallback, useEffect } from 'react'

interface MessageInputProps {
  onSend: (content: string) => void
  onTyping: () => void
  disabled: boolean
}

// Throttle typing event agar tidak spam ke server
const TYPING_THROTTLE_MS = 2000

export function MessageInput({ onSend, onTyping, disabled }: MessageInputProps) {
  const [text, setText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const lastTypingSentRef = useRef<number>(0)

  // Auto-resize textarea sesuai konten
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'
  }, [text])

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value)

    // Throttle typing indicator
    const now = Date.now()
    if (now - lastTypingSentRef.current > TYPING_THROTTLE_MS) {
      lastTypingSentRef.current = now
      onTyping()
    }
  }, [onTyping])

  const handleSend = useCallback(() => {
    const trimmed = text.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setText('')
    // Reset tinggi textarea setelah kirim
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }, [text, disabled, onSend])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter = kirim, Shift+Enter = baris baru
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  const canSend = text.trim().length > 0 && !disabled

  return (
    <div className="chat-input-area">
      <div className="chat-input-wrapper">
        <textarea
          ref={textareaRef}
          id="message-input"
          className="chat-textarea"
          placeholder={disabled ? 'Menunggu koneksi...' : 'Ketik pesan... (Enter untuk kirim)'}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          rows={1}
          aria-label="Tulis pesan"
          aria-multiline="true"
        />
        <button
          className="chat-send-btn"
          onClick={handleSend}
          disabled={!canSend}
          id="send-btn"
          aria-label="Kirim pesan"
          type="button"
        >
          {/* Send icon (inline SVG, tidak butuh dependency icon library) */}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
      <p style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: '0.375rem', paddingLeft: '0.25rem' }}>
        Enter kirim · Shift+Enter baris baru
      </p>
    </div>
  )
}
