'use client'

import React, { useState, useEffect, useRef } from 'react'

interface VoiceRecorderProps {
  onSendAudio: (file: File) => void
  onCancel: () => void
  disabled?: boolean
}

// Format detik ke mm:ss
function formatRecordTimer(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`
}

export const VoiceRecorder: React.FC<VoiceRecorderProps> = ({
  onSendAudio,
  onCancel,
  disabled = false,
}) => {
  const [timerSeconds, setTimerSeconds] = useState(0)
  const [hasPermission, setHasPermission] = useState<boolean | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    let active = true

    async function startRecording() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        if (!active) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }

        streamRef.current = stream
        setHasPermission(true)

        // Deteksi supported MIME type untuk browser yang berbeda
        let mimeType = 'audio/webm;codecs=opus'
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          if (MediaRecorder.isTypeSupported('audio/webm')) {
            mimeType = 'audio/webm'
          } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
            mimeType = 'audio/mp4'
          } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
            mimeType = 'audio/ogg'
          } else {
            mimeType = '' // fallback
          }
        }

        const options = mimeType ? { mimeType } : undefined
        const recorder = new MediaRecorder(stream, options)
        mediaRecorderRef.current = recorder
        audioChunksRef.current = []

        recorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            audioChunksRef.current.push(event.data)
          }
        }

        recorder.start(200) // Kumpulkan slice setiap 200ms

        // Mulai timer rekaman
        timerIntervalRef.current = setInterval(() => {
          setTimerSeconds((prev) => prev + 1)
        }, 1000)
      } catch (err: any) {
        console.error('Mikrofon error:', err)
        setHasPermission(false)
        setErrorMessage(
          err.name === 'NotAllowedError'
            ? 'Akses mikrofon tidak diizinkan oleh peramban.'
            : 'Gagal mengakses mikrofon: ' + err.message
        )
      }
    }

    startRecording()

    return () => {
      active = false
      cleanup()
    }
  }, [])

  const cleanup = () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current)
      timerIntervalRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }

  const handleStopAndSend = () => {
    const recorder = mediaRecorderRef.current
    if (!recorder || recorder.state === 'inactive') return

    recorder.onstop = () => {
      const mimeType = recorder.mimeType || 'audio/webm'
      const ext = mimeType.includes('mp4') ? '.mp4' : mimeType.includes('ogg') ? '.ogg' : '.webm'
      const audioBlob = new Blob(audioChunksRef.current, { type: mimeType })
      const fileName = `voice_note_${Date.now()}${ext}`
      const audioFile = new File([audioBlob], fileName, { type: mimeType })

      cleanup()
      onSendAudio(audioFile)
    }

    recorder.stop()
  }

  const handleCancelRecording = () => {
    const recorder = mediaRecorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = null
      recorder.stop()
    }
    cleanup()
    onCancel()
  }

  if (hasPermission === false) {
    return (
      <div className="voice-recorder-bar voice-recorder-error">
        <span className="voice-error-text">⚠️ {errorMessage || 'Akses mikrofon ditolak.'}</span>
        <button type="button" className="voice-cancel-btn" onClick={onCancel}>
          Tutup
        </button>
      </div>
    )
  }

  return (
    <div className="voice-recorder-bar" role="region" aria-label="Sedang merekam suara">
      {/* Tombol Hapus / Batal */}
      <button
        type="button"
        className="voice-action-btn voice-trash-btn"
        onClick={handleCancelRecording}
        title="Batal dan hapus rekaman"
        disabled={disabled}
      >
        🗑️
      </button>

      {/* Recording Pulse & Timer */}
      <div className="voice-recording-status">
        <span className="voice-recording-pulse" />
        <span className="voice-recording-timer">{formatRecordTimer(timerSeconds)}</span>
        <div className="voice-live-wave">
          <span className="live-wave-bar" />
          <span className="live-wave-bar" />
          <span className="live-wave-bar" />
          <span className="live-wave-bar" />
          <span className="live-wave-bar" />
        </div>
      </div>

      {/* Tombol Kirim Voice Note */}
      <button
        type="button"
        className="voice-action-btn voice-send-btn"
        onClick={handleStopAndSend}
        title="Kirim pesan suara"
        disabled={disabled || timerSeconds < 1}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
        </svg>
      </button>
    </div>
  )
}
