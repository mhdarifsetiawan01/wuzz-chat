'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { uploadMedia, getAppConfig } from '@/lib/api'
import { compressImage } from '@/lib/imageCompressor'
import { setCachedMediaBlob } from '@/lib/mediaCache'
import type { Message, MediaUploadResponse, GroupMember } from '@/lib/types'
import { VoiceRecorder } from './VoiceRecorder'
import { EMOJI_CATEGORIES, getEmojiCategories } from '@/lib/emojis'
import { UserAvatar } from './UserAvatar'
import { VerifiedBadge } from './VerifiedBadge'

interface StagedMedia {
  file: File
  previewUrl: string
  isUploading: boolean
  uploadedData?: MediaUploadResponse
  error?: string
}

interface MessageInputProps {
  onSend: (content: string, media?: { url: string; media_type: string; file_name: string; file_size: number }, mentions?: string[]) => void
  onTyping: () => void
  disabled: boolean
  replyTo?: Message | null
  onCancelReply?: () => void
  editingMessage?: { id: string; content: string } | null
  onCancelEdit?: () => void
  onSaveEdit?: (messageId: string, newContent: string) => Promise<void>
  stagedExternalFile?: File | null
  onClearStagedExternalFile?: () => void
  members?: GroupMember[]
  currentUserId?: string
}

// Throttle typing event agar tidak spam ke server
const TYPING_THROTTLE_MS = 2000

export function MessageInput({
  onSend,
  onTyping,
  disabled,
  replyTo,
  onCancelReply,
  editingMessage,
  onCancelEdit,
  onSaveEdit,
  stagedExternalFile,
  onClearStagedExternalFile,
  members = [],
  currentUserId = '',
}: MessageInputProps) {
  const [text, setText] = useState('')
  const [mediaEnabled, setMediaEnabled] = useState(true)
  const [stagedMedia, setStagedMedia] = useState<StagedMedia | null>(null)
  const [isSending, setIsSending] = useState(false)
  const [isRecordingVoice, setIsRecordingVoice] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [activeEmojiCategory, setActiveEmojiCategory] = useState<string>('faces')

  // Mention state & tracked user UUIDs (DEC-013)
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionStartIdx, setMentionStartIdx] = useState<number>(-1)
  const [selectedMentionIdx, setSelectedMentionIdx] = useState<number>(0)
  const trackedMentions = useRef<Map<string, string>>(new Map())
  const mentionPopoverRef = useRef<HTMLDivElement>(null)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const emojiPickerRef = useRef<HTMLDivElement>(null)
  const lastTypingSentRef = useRef<number>(0)

  // Filter anggota yang cocok untuk mention popover (exclude self ID)
  const eligibleMembers = (members || []).filter(m => m.user_id !== currentUserId)
  const matchingMembers = mentionQuery !== null
    ? eligibleMembers.filter(m => {
        const q = mentionQuery.toLowerCase()
        return (
          m.username.toLowerCase().includes(q) ||
          m.display_name.toLowerCase().includes(q)
        )
      })
    : []

  // Tutup mention popover jika klik di luar
  useEffect(() => {
    if (mentionQuery === null) return
    const handleClickOutside = (e: MouseEvent) => {
      if (mentionPopoverRef.current && !mentionPopoverRef.current.contains(e.target as Node)) {
        setMentionQuery(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [mentionQuery])

  // Tutup emoji picker jika user klik di luar popover atau menekan tombol Escape
  useEffect(() => {
    if (!showEmojiPicker) return
    const handleClickOutside = (e: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) {
        const target = e.target as HTMLElement
        if (target.closest('.chat-emoji-btn')) return
        setShowEmojiPicker(false)
      }
    }
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowEmojiPicker(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEsc)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEsc)
    }
  }, [showEmojiPicker])

  // Sisipkan emoji di posisi kursor aktif
  const handleInsertEmoji = (emoji: string) => {
    const ta = textareaRef.current
    if (!ta) {
      setText(prev => prev + emoji)
      return
    }
    const start = ta.selectionStart || 0
    const end = ta.selectionEnd || 0
    const newText = text.substring(0, start) + emoji + text.substring(end)
    setText(newText)

    requestAnimationFrame(() => {
      ta.focus()
      const newCursor = start + emoji.length
      ta.setSelectionRange(newCursor, newCursor)
    })
  }

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

  // Focus dan pre-fill textarea saat user mengedit pesan
  useEffect(() => {
    if (editingMessage) {
      setText(editingMessage.content)
      if (textareaRef.current) {
        textareaRef.current.focus()
      }
    }
  }, [editingMessage])

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

  const handleSelectMention = (member: GroupMember) => {
    if (mentionStartIdx < 0) return
    const ta = textareaRef.current
    const cursor = ta ? ta.selectionStart : text.length
    const before = text.slice(0, mentionStartIdx)
    const after = text.slice(cursor)
    const mentionText = `@${member.username} `
    const newText = before + mentionText + after

    // Simpan relasi immutable username -> user_id (UUID)
    trackedMentions.current.set(member.username.toLowerCase(), member.user_id)

    setText(newText)
    setMentionQuery(null)

    requestAnimationFrame(() => {
      if (ta) {
        ta.focus()
        const newCursor = before.length + mentionText.length
        ta.setSelectionRange(newCursor, newCursor)
      }
    })
  }

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newText = e.target.value
      setText(newText)

      // Deteksi trigger mention (@)
      const cursor = e.target.selectionStart || 0
      const textBeforeCursor = newText.slice(0, cursor)
      const match = textBeforeCursor.match(/(?:^|\s)@([a-zA-Z0-9_.-]*)$/)
      if (match && members && members.length > 0) {
        const query = match[1]
        const atPos = textBeforeCursor.length - query.length - 1
        setMentionQuery(query)
        setMentionStartIdx(atPos)
        setSelectedMentionIdx(0)
      } else {
        setMentionQuery(null)
      }

      // Throttle typing indicator
      const now = Date.now()
      if (now - lastTypingSentRef.current > TYPING_THROTTLE_MS) {
        lastTypingSentRef.current = now
        onTyping()
      }
    },
    [members, onTyping]
  )

  const handleSend = async () => {
    const trimmed = text.trim()
    if ((!trimmed && !stagedMedia) || disabled || isSending) return

    // Jika dalam mode edit pesan
    if (editingMessage && onSaveEdit) {
      if (!trimmed) return
      setIsSending(true)
      try {
        await onSaveEdit(editingMessage.id, trimmed)
        setText('')
        onCancelEdit?.()
        if (textareaRef.current) textareaRef.current.style.height = 'auto'
      } finally {
        setIsSending(false)
      }
      return
    }

    setIsSending(true)
    setMentionQuery(null)

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

      // Ekstraksi multi-mention UUIDs secara immutable (DEC-013)
      const mentionMatches = trimmed.match(/@([a-zA-Z0-9_.-]+)/g) || []
      const finalMentions: string[] = []
      const seen = new Set<string>()

      for (const match of mentionMatches) {
        const uname = match.slice(1).toLowerCase()
        let uid = trackedMentions.current.get(uname)
        if (!uid && members) {
          const found = members.find(m => m.username.toLowerCase() === uname)
          if (found && found.user_id !== currentUserId) {
            uid = found.user_id
          }
        }
        if (uid && !seen.has(uid)) {
          seen.add(uid)
          finalMentions.push(uid)
        }
      }

      onSend(trimmed, mediaPayload, finalMentions.length > 0 ? finalMentions : undefined)
      setText('')
      handleCancelStagedMedia()
      trackedMentions.current.clear()

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
    // Navigasi keyboard mention popover
    if (mentionQuery !== null && matchingMembers.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedMentionIdx(prev => (prev + 1) % matchingMembers.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedMentionIdx(prev => (prev - 1 + matchingMembers.length) % matchingMembers.length)
        return
      }
      if ((e.key === 'Enter' || e.key === 'Tab') && !e.shiftKey) {
        e.preventDefault()
        if (matchingMembers[selectedMentionIdx]) {
          handleSelectMention(matchingMembers[selectedMentionIdx])
        }
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setMentionQuery(null)
        return
      }
    }

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
      {/* Editing Message Preview Banner */}
      {editingMessage && (
        <div className="reply-preview-bar edit-preview-bar" aria-label="Mengedit pesan">
          <div className="reply-preview-content">
            <span className="reply-preview-label">
              ✏️ <strong className="reply-preview-sender">Edit Pesan</strong>
            </span>
            <span className="reply-preview-snippet">{editingMessage.content}</span>
          </div>
          <button
            type="button"
            className="reply-preview-cancel"
            onClick={onCancelEdit}
            title="Batal edit"
            aria-label="Batal edit"
          >
            ✕
          </button>
        </div>
      )}

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
        <>
          {/* Frosted Glass Emoji Picker Tray */}
          {showEmojiPicker && (
            <div ref={emojiPickerRef} className="emoji-picker-popover" role="dialog" aria-label="Pemilih Emoji">
              <div className="emoji-picker-header">
                <div className="emoji-category-tabs">
                  {getEmojiCategories().map(cat => (
                    <button
                      key={cat.id}
                      type="button"
                      className={`emoji-category-tab ${activeEmojiCategory === cat.id ? 'active' : ''}`}
                      onClick={() => setActiveEmojiCategory(cat.id)}
                    >
                      {cat.icon} {cat.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="emoji-picker-close-btn"
                  onClick={() => setShowEmojiPicker(false)}
                  title="Tutup"
                >
                  ✕
                </button>
              </div>

              <div className="emoji-grid-container">
                {(EMOJI_CATEGORIES[activeEmojiCategory]?.emojis || EMOJI_CATEGORIES.faces.emojis).map(emoji => (
                  <button
                    key={emoji}
                    type="button"
                    className="emoji-grid-item"
                    onClick={() => handleInsertEmoji(emoji)}
                    title={emoji}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Autocomplete Mention Suggestion Popover */}
          {mentionQuery !== null && matchingMembers.length > 0 && (
            <div
              ref={mentionPopoverRef}
              className="mention-autocomplete-popover"
              role="listbox"
              aria-label="Saran Mention Anggota"
            >
              <div className="mention-popover-header">
                <span className="mention-popover-title">Sebut Anggota (@)</span>
                <span className="mention-popover-hint">Gunakan ↑↓ lalu Enter</span>
              </div>
              <div className="mention-popover-list">
                {matchingMembers.slice(0, 6).map((member, idx) => (
                  <button
                    key={member.user_id}
                    type="button"
                    className={`mention-popover-item ${idx === selectedMentionIdx ? 'active' : ''}`}
                    onClick={() => handleSelectMention(member)}
                    onMouseEnter={() => setSelectedMentionIdx(idx)}
                    role="option"
                    aria-selected={idx === selectedMentionIdx}
                  >
                    <UserAvatar
                      avatarUrl={member.avatar_url}
                      name={member.display_name}
                      id={member.user_id}
                      size={30}
                    />
                    <div className="mention-item-info">
                      <div className="mention-item-name-row">
                        <span className="mention-item-name">{member.display_name}</span>
                        {member.is_verified && <VerifiedBadge size={13} />}
                      </div>
                      <span className="mention-item-username">@{member.username}</span>
                    </div>
                    {member.role && member.role !== 'member' && (
                      <span className={`mention-item-role role-${member.role}`}>
                        {member.role === 'creator' ? '👑 Pembuat' : '🛡️ Admin'}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="chat-input-row">
            <div className="chat-input-pill">
              {/* Hidden File Input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.7z,.tar,.gz,.txt,.csv,.json"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />

              {/* Tombol Pemilih Emoticon (Kiri) */}
              <button
                type="button"
                className={`chat-pill-icon-btn chat-emoji-btn ${showEmojiPicker ? 'active' : ''}`}
                onClick={() => setShowEmojiPicker(prev => !prev)}
                disabled={disabled || isSending}
                title="Pilih Emoticon"
                aria-label="Pilih emoticon"
              >
                😊
              </button>

              {/* Text Input Utama */}
              <textarea
                ref={textareaRef}
                id="message-input"
                className="chat-textarea"
                placeholder={
                  disabled
                    ? 'Menunggu koneksi...'
                    : 'Message'
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

              {/* Tombol Lampiran (Kanan Teks) */}
              {mediaEnabled && (
                <button
                  type="button"
                  className="chat-pill-icon-btn chat-attach-btn"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={disabled || isSending}
                  title="Lampirkan Gambar atau Berkas"
                  aria-label="Lampirkan berkas"
                >
                  📎
                </button>
              )}
            </div>

            {/* Tombol Aksi Mandiri (Floating Circular Button: Mic / Send) */}
            {!hasTextOrMedia && mediaEnabled ? (
              <button
                type="button"
                className="chat-floating-action-btn chat-mic-btn"
                onClick={() => setIsRecordingVoice(true)}
                disabled={disabled || isSending}
                title="Rekam Pesan Suara"
                aria-label="Rekam pesan suara"
              >
                🎙️
              </button>
            ) : (
              <button
                className="chat-floating-action-btn chat-send-btn"
                onClick={handleSend}
                disabled={!canSend}
                id="send-btn"
                aria-label={editingMessage ? "Simpan perubahan pesan" : "Kirim pesan"}
                title={editingMessage ? "Simpan perubahan pesan" : "Kirim pesan"}
                type="button"
              >
                {isSending ? (
                  <span className="sending-spinner">⏳</span>
                ) : editingMessage ? (
                  <span style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>✓</span>
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
        </>
      )}

      <p className="chat-input-hints" style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: '0.375rem', paddingLeft: '0.25rem' }}>
        Enter kirim · Shift+Enter baris baru {mediaEnabled && '· 🎙️ Rekam suara · Paste gambar (Ctrl+V)'}
      </p>
    </div>
  )
}
