'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { uploadMedia, getAppConfig } from '@/lib/api'
import { compressImage } from '@/lib/imageCompressor'
import { setCachedMediaBlob } from '@/lib/mediaCache'
import type { Message, MediaUploadResponse } from '@/lib/types'
import { VoiceRecorder } from './VoiceRecorder'

interface StagedMedia {
  file: File
  previewUrl: string
  isUploading: boolean
  uploadedData?: MediaUploadResponse
  error?: string
}

interface MessageInputProps {
  onSend: (content: string, media?: { url: string; media_type: string; file_name: string; file_size: number }) => void
  onTyping: () => void
  disabled: boolean
  replyTo?: Message | null
  onCancelReply?: () => void
  stagedExternalFile?: File | null
  onClearStagedExternalFile?: () => void
}

// Throttle typing event agar tidak spam ke server
const TYPING_THROTTLE_MS = 2000

export function MessageInput({
  onSend,
  onTyping,
  disabled,
  replyTo,
  onCancelReply,
  stagedExternalFile,
  onClearStagedExternalFile,
}: MessageInputProps) {
  const [text, setText] = useState('')
  const [mediaEnabled, setMediaEnabled] = useState(true)
  const [stagedMedia, setStagedMedia] = useState<StagedMedia | null>(null)
  const [isSending, setIsSending] = useState(false)
  const [isRecordingVoice, setIsRecordingVoice] = useState(false)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const lastTypingSentRef = useRef<number>(0)

  // Cek konfigurasi fitur media dari backend
  useEffect(() => {
    getAppConfig().then((cfg) => {
      if (cfg) {
        setMediaEnabled(cfg.media_upload_enabled)
      }
    })
  }, [])

  // Tangkap file dari drop zone eksternal (dari ChatWindow)
  useEffect(() => {
    if (stagedExternalFile && mediaEnabled) {
      handleStageFile(stagedExternalFile)
      onClearStagedExternalFile?.()
    }
  }, [stagedExternalFile, mediaEnabled, onClearStagedExternalFile])

  // Focus textarea saat user mengklik reply
  useEffect(() => {
    if (replyTo && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [replyTo])

  // Auto-resize textarea sesuai konten
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'
  }, [text])

  const handleStageFile = (file: File) => {
    const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : ''
    setStagedMedia({
      file,
      previewUrl,
      isUploading: false,
    })
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      handleStageFile(files[0])
    }
    // Reset file input agar bisa pilih file yang sama kembali
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleCancelStagedMedia = () => {
    if (stagedMedia?.previewUrl) {
      URL.revokeObjectURL(stagedMedia.previewUrl)
    }
    setStagedMedia(null)
  }

  // Tangkap paste gambar dari clipboard (Ctrl + V)
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (!mediaEnabled || disabled) return
    const items = e.clipboardData?.items
    if (!items) return

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile()
        if (file) {
          e.preventDefault()
          handleStageFile(file)
          break
        }
      }
    }
  }

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setText(e.target.value)

      // Throttle typing indicator
      const now = Date.now()
      if (now - lastTypingSentRef.current > TYPING_THROTTLE_MS) {
        lastTypingSentRef.current = now
        onTyping()
      }
    },
    [onTyping]
  )

  const handleSend = async () => {
    const trimmed = text.trim()
    if ((!trimmed && !stagedMedia) || disabled || isSending) return

    setIsSending(true)

    try {
      let mediaPayload: { url: string; media_type: string; file_name: string; file_size: number } | undefined

      // Jika ada media yang dilampirkan, kompresi gambar (jika aktif) lalu unggah
      if (stagedMedia) {
        setStagedMedia((prev) => (prev ? { ...prev, isUploading: true, error: undefined } : null))
        
        // Kompresi otomatis (WhatsApp style) untuk gambar
        const fileToUpload = stagedMedia.file.type.startsWith('image/')
          ? await compressImage(stagedMedia.file)
          : stagedMedia.file

        const uploadRes = await uploadMedia(fileToUpload)

        if (uploadRes.error || !uploadRes.data) {
          setStagedMedia((prev) =>
            prev ? { ...prev, isUploading: false, error: uploadRes.error || 'Gagal mengunggah file' } : null
          )
          setIsSending(false)
          return
        }

        // Simpan langsung ke IndexedDB pengirim agar instan & tidak perlu download ulang
        await setCachedMediaBlob(uploadRes.data.url, fileToUpload, fileToUpload.type, uploadRes.data.file_name)

        mediaPayload = {
          url: uploadRes.data.url,
          media_type: uploadRes.data.media_type,
          file_name: uploadRes.data.file_name,
          file_size: uploadRes.data.file_size,
        }
      }

      onSend(trimmed, mediaPayload)
      setText('')
      handleCancelStagedMedia()

      if (textareaRef.current) textareaRef.current.style.height = 'auto'
    } finally {
      setIsSending(false)
    }
  }

  // Kirim audio langsung dari rekaman VoiceRecorder
  const handleSendAudio = async (audioFile: File) => {
    if (disabled || isSending) return
    setIsSending(true)

    try {
      const uploadRes = await uploadMedia(audioFile)
      if (uploadRes.error || !uploadRes.data) {
        alert('Gagal mengunggah pesan suara: ' + (uploadRes.error || 'Terjadi kesalahan jaringan'))
        setIsSending(false)
        return
      }

      // Simpan langsung rekaman ke IndexedDB
      await setCachedMediaBlob(uploadRes.data.url, audioFile, audioFile.type, uploadRes.data.file_name)

      onSend('', {
        url: uploadRes.data.url,
        media_type: 'audio',
        file_name: uploadRes.data.file_name,
        file_size: uploadRes.data.file_size,
      })

      setIsRecordingVoice(false)
    } finally {
      setIsSending(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter = kirim, Shift+Enter = baris baru
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const hasTextOrMedia = text.trim().length > 0 || stagedMedia !== null
  const canSend = hasTextOrMedia && !disabled && !isSending

  return (
    <div className="chat-input-area">
      {/* Quoted Message Preview Banner */}
      {replyTo && (
        <div className="reply-preview-bar" aria-label="Membalas pesan">
          <div className="reply-preview-content">
            <span className="reply-preview-label">
              Membalas ke <strong className="reply-preview-sender">{replyTo.nickname || 'Pengguna'}</strong>
            </span>
            <span className="reply-preview-snippet">{replyTo.content}</span>
          </div>
          <button
            type="button"
            className="reply-preview-cancel"
            onClick={onCancelReply}
            title="Batal membalas"
            aria-label="Batal membalas"
          >
            ✕
          </button>
        </div>
      )}

      {/* Staged Media Preview Bar */}
      {stagedMedia && (
        <div className="media-preview-bar">
          <div className="media-preview-thumb-box">
            {stagedMedia.previewUrl ? (
              <img src={stagedMedia.previewUrl} alt="Preview" className="media-preview-thumb" />
            ) : (
              <span className="media-preview-file-icon">
                {stagedMedia.file.name.endsWith('.pdf')
                  ? '📕'
                  : stagedMedia.file.name.match(/\.(doc|docx)$/i)
                  ? '📘'
                  : stagedMedia.file.name.match(/\.(xls|xlsx|csv)$/i)
                  ? '📗'
                  : stagedMedia.file.name.match(/\.(zip|rar|7z|tar|gz)$/i)
                  ? '🗜️'
                  : '📄'}
              </span>
            )}
          </div>
          <div className="media-preview-info">
            <span className="media-preview-filename">{stagedMedia.file.name}</span>
            <span className="media-preview-size">
              {(stagedMedia.file.size / (1024 * 1024)).toFixed(2)} MB
              {stagedMedia.isUploading && ' · Mengunggah... ⏳'}
              {stagedMedia.error && <strong className="media-preview-error"> · {stagedMedia.error}</strong>}
            </span>
          </div>
          <button
            type="button"
            className="media-preview-cancel"
            onClick={handleCancelStagedMedia}
            title="Batal lampirkan"
            disabled={isSending}
          >
            ✕
          </button>
        </div>
      )}

      {/* Mode Perekaman Suara Aktif */}
      {isRecordingVoice ? (
        <VoiceRecorder
          onSendAudio={handleSendAudio}
          onCancel={() => setIsRecordingVoice(false)}
          disabled={disabled || isSending}
        />
      ) : (
        <div className="chat-input-wrapper">
          {/* Hidden File Input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.7z,.tar,.gz,.txt,.csv,.json"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />

          {/* Tombol Lampiran (Hanya tampil jika media upload diaktifkan) */}
          {mediaEnabled && (
            <button
              type="button"
              className="chat-attach-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || isSending}
              title="Lampirkan Gambar atau Berkas"
              aria-label="Lampirkan berkas"
            >
              📎
            </button>
          )}

          <textarea
            ref={textareaRef}
            id="message-input"
            className="chat-textarea"
            placeholder={
              disabled
                ? 'Menunggu koneksi...'
                : mediaEnabled
                ? 'Ketik pesan atau paste gambar (Ctrl+V)...'
                : 'Ketik pesan... (Enter untuk kirim)'
            }
            value={text}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            disabled={disabled || isSending}
            rows={1}
            aria-label="Tulis pesan"
            aria-multiline="true"
          />

          {/* Tombol Mikrofon (Saat teks & lampiran kosong) atau Tombol Kirim */}
          {!hasTextOrMedia && mediaEnabled ? (
            <button
              type="button"
              className="chat-mic-btn"
              onClick={() => setIsRecordingVoice(true)}
              disabled={disabled || isSending}
              title="Rekam Pesan Suara"
              aria-label="Rekam pesan suara"
            >
              🎙️
            </button>
          ) : (
            <button
              className="chat-send-btn"
              onClick={handleSend}
              disabled={!canSend}
              id="send-btn"
              aria-label="Kirim pesan"
              type="button"
            >
              {isSending ? (
                <span className="sending-spinner">⏳</span>
              ) : (
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              )}
            </button>
          )}
        </div>
      )}

      <p style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: '0.375rem', paddingLeft: '0.25rem' }}>
        Enter kirim · Shift+Enter baris baru {mediaEnabled && '· 🎙️ Rekam suara · Paste gambar (Ctrl+V)'}
      </p>
    </div>
  )
}
