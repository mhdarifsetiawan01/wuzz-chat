'use client'

import React, { useState } from 'react'
import { MemoryArtifactItem, ArtifactEvidenceItem } from '@/lib/types'
import { ConfidenceBadge } from './ConfidenceBadge'

// -----------------------------------------------------------------------------
// 1. SummaryReviewCard
// -----------------------------------------------------------------------------

interface SummaryReviewCardProps {
  artifact: MemoryArtifactItem
  onSaveContent: (artifactId: string, newContent: string) => Promise<boolean>
}

export function SummaryReviewCard({ artifact, onSaveContent }: SummaryReviewCardProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [draftContent, setDraftContent] = useState(artifact.content)
  const [isSaving, setIsSaving] = useState(false)

  const handleSave = async () => {
    if (!draftContent.trim() || draftContent.trim() === artifact.content) {
      setIsEditing(false)
      return
    }
    setIsSaving(true)
    const success = await onSaveContent(artifact.id, draftContent.trim())
    setIsSaving(false)
    if (success) {
      setIsEditing(false)
    }
  }

  const handleCancel = () => {
    setDraftContent(artifact.content)
    setIsEditing(false)
  }

  return (
    <div
      className="p-4 rounded-xl transition-all"
      style={{
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-default)',
      }}
    >
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold tracking-wide uppercase" style={{ color: 'var(--accent-400)' }}>
            📌 Ringkasan Diskusi
          </span>
          {artifact.is_human_edited && (
            <span
              className="text-[11px] px-2 py-0.5 rounded-md font-medium"
              style={{ backgroundColor: 'rgba(59, 130, 246, 0.15)', color: 'var(--accent-300)' }}
            >
              Telah Disunting
            </span>
          )}
        </div>
        <ConfidenceBadge confidence={artifact.confidence} />
      </div>

      {isEditing ? (
        <div className="space-y-3">
          <textarea
            value={draftContent}
            onChange={(e) => setDraftContent(e.target.value)}
            rows={4}
            className="w-full p-3 rounded-lg text-sm resize-y transition-all focus:outline-none"
            style={{
              backgroundColor: 'var(--bg-base)',
              border: '1px solid var(--accent-500)',
              color: 'var(--text-primary)',
            }}
            placeholder="Tulis ringkasan diskusi yang telah dikurasi..."
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleCancel}
              disabled={isSaving}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={{
                backgroundColor: 'var(--bg-tertiary)',
                color: 'var(--text-secondary)',
              }}
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || !draftContent.trim()}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5"
              style={{
                backgroundColor: 'var(--accent-500)',
                color: 'var(--text-inverse)',
              }}
            >
              {isSaving ? 'Menyimpan...' : 'Simpan Suntingan'}
            </button>
          </div>
        </div>
      ) : (
        <div>
          <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>
            {artifact.content}
          </p>
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="text-xs flex items-center gap-1 font-medium transition-colors px-2 py-1 rounded hover:bg-slate-800/50"
              style={{ color: 'var(--accent-400)' }}
            >
              ✏ Sunting Ringkasan
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// -----------------------------------------------------------------------------
// 2. DecisionReviewCard
// -----------------------------------------------------------------------------

interface DecisionReviewCardProps {
  artifact: MemoryArtifactItem
  index: number
  forumId: string
  onSaveContent: (artifactId: string, newContent: string) => Promise<boolean>
  onJumpToMessage?: (forumId: string, messageId: string) => void
}

export function DecisionReviewCard({
  artifact,
  index,
  forumId,
  onSaveContent,
  onJumpToMessage,
}: DecisionReviewCardProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [draftContent, setDraftContent] = useState(artifact.content)
  const [isSaving, setIsSaving] = useState(false)

  const handleSave = async () => {
    if (!draftContent.trim() || draftContent.trim() === artifact.content) {
      setIsEditing(false)
      return
    }
    setIsSaving(true)
    const success = await onSaveContent(artifact.id, draftContent.trim())
    setIsSaving(false)
    if (success) {
      setIsEditing(false)
    }
  }

  return (
    <div
      className="p-4 rounded-xl transition-all space-y-3"
      style={{
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-default)',
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
            style={{ backgroundColor: 'var(--accent-500)', color: 'var(--text-inverse)' }}
          >
            {index}
          </span>
          <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            Poin Keputusan #{index}
          </span>
          {artifact.is_human_edited && (
            <span
              className="text-[11px] px-2 py-0.5 rounded-md font-medium"
              style={{ backgroundColor: 'rgba(59, 130, 246, 0.15)', color: 'var(--accent-300)' }}
            >
              Telah Disunting
            </span>
          )}
        </div>
        <ConfidenceBadge confidence={artifact.confidence} />
      </div>

      {isEditing ? (
        <div className="space-y-3">
          <textarea
            value={draftContent}
            onChange={(e) => setDraftContent(e.target.value)}
            rows={3}
            className="w-full p-3 rounded-lg text-sm resize-y transition-all focus:outline-none"
            style={{
              backgroundColor: 'var(--bg-base)',
              border: '1px solid var(--accent-500)',
              color: 'var(--text-primary)',
            }}
            placeholder="Tulis revisi keputusan..."
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setDraftContent(artifact.content)
                setIsEditing(false)
              }}
              disabled={isSaving}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || !draftContent.trim()}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={{ backgroundColor: 'var(--accent-500)', color: 'var(--text-inverse)' }}
            >
              {isSaving ? 'Menyimpan...' : 'Simpan'}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-primary)' }}>
            {artifact.content}
          </p>
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="text-xs font-medium whitespace-nowrap px-2 py-1 rounded transition-colors hover:bg-slate-800/50 flex-shrink-0"
            style={{ color: 'var(--accent-400)' }}
          >
            ✏ Sunting
          </button>
        </div>
      )}

      {/* Evidence Snapshot Block */}
      {artifact.evidences && artifact.evidences.length > 0 && (
        <div className="pt-2 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
          <div className="text-xs font-medium mb-2 flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
            <span>🔍 Bukti Sumber Pesan Diskusi:</span>
          </div>
          <div className="space-y-2">
            {artifact.evidences.map((ev, evIdx) => (
              <div
                key={ev.id || evIdx}
                className="p-2.5 rounded-lg text-xs space-y-1"
                style={{
                  backgroundColor: 'rgba(15, 23, 42, 0.65)',
                  borderLeft: '3px solid var(--accent-500)',
                  border: '1px solid var(--border-subtle)',
                  borderLeftWidth: '3px',
                }}
              >
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold" style={{ color: 'var(--accent-300)' }}>
                    👤 {ev.message_sender_name}
                  </span>
                  <span style={{ color: 'var(--text-muted)' }}>
                    {ev.message_sent_at ? new Date(ev.message_sent_at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }) : ''}
                  </span>
                </div>
                <p className="italic text-xs leading-normal" style={{ color: 'var(--text-secondary)' }}>
                  &ldquo;{ev.message_preview}&rdquo;
                </p>
                {onJumpToMessage && ev.message_id && (
                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      onClick={() => onJumpToMessage(forumId, ev.message_id)}
                      className="text-[11px] font-medium hover:underline flex items-center gap-1"
                      style={{ color: 'var(--accent-400)' }}
                    >
                      Buka di diskusi asli →
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// -----------------------------------------------------------------------------
// 3. JourneyLiteReviewCard
// -----------------------------------------------------------------------------

interface JourneyLiteReviewCardProps {
  artifact: MemoryArtifactItem
  onSaveContent: (artifactId: string, newContent: string) => Promise<boolean>
  onRemoveJourney: () => Promise<boolean>
}

export function JourneyLiteReviewCard({
  artifact,
  onSaveContent,
  onRemoveJourney,
}: JourneyLiteReviewCardProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [draftContent, setDraftContent] = useState(artifact.content)
  const [isSaving, setIsSaving] = useState(false)
  const [showConfirmRemove, setShowConfirmRemove] = useState(false)
  const [isRemoving, setIsRemoving] = useState(false)

  // Parse struct kalimat jika format JSON
  let initially = ''
  let then = ''
  let finally_ = ''
  let isParsedJSON = false

  try {
    const parsed = JSON.parse(artifact.content)
    if (parsed.initially || parsed.then || parsed.finally_) {
      initially = parsed.initially || ''
      then = parsed.then || ''
      finally_ = parsed.finally_ || ''
      isParsedJSON = true
    }
  } catch {
    isParsedJSON = false
  }

  const handleSave = async () => {
    if (!draftContent.trim() || draftContent.trim() === artifact.content) {
      setIsEditing(false)
      return
    }
    setIsSaving(true)
    const success = await onSaveContent(artifact.id, draftContent.trim())
    setIsSaving(false)
    if (success) {
      setIsEditing(false)
    }
  }

  const handleConfirmRemove = async () => {
    setIsRemoving(true)
    const success = await onRemoveJourney()
    setIsRemoving(false)
    setShowConfirmRemove(false)
  }

  return (
    <div
      className="p-4 rounded-xl transition-all space-y-3"
      style={{
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-default)',
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--accent-secondary)' }}>
            🧭 Perjalanan Diskusi (Journey Lite)
          </span>
          {artifact.is_human_edited && (
            <span
              className="text-[11px] px-2 py-0.5 rounded-md font-medium"
              style={{ backgroundColor: 'rgba(59, 130, 246, 0.15)', color: 'var(--accent-300)' }}
            >
              Telah Disunting
            </span>
          )}
        </div>
        <ConfidenceBadge confidence={artifact.confidence} />
      </div>

      {isEditing ? (
        <div className="space-y-3">
          <textarea
            value={draftContent}
            onChange={(e) => setDraftContent(e.target.value)}
            rows={4}
            className="w-full p-3 rounded-lg text-sm resize-y transition-all focus:outline-none"
            style={{
              backgroundColor: 'var(--bg-base)',
              border: '1px solid var(--accent-secondary)',
              color: 'var(--text-primary)',
            }}
            placeholder="Tulis revisi linimasa perjalanan diskusi..."
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setDraftContent(artifact.content)
                setIsEditing(false)
              }}
              disabled={isSaving}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || !draftContent.trim()}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={{ backgroundColor: 'var(--accent-500)', color: 'var(--text-inverse)' }}
            >
              {isSaving ? 'Menyimpan...' : 'Simpan'}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {isParsedJSON ? (
            <div className="space-y-2 text-sm leading-relaxed" style={{ color: 'var(--text-primary)' }}>
              {initially && (
                <div>
                  <span className="font-semibold text-xs text-sky-400">Awalnya: </span>
                  <span>{initially}</span>
                </div>
              )}
              {then && (
                <div>
                  <span className="font-semibold text-xs text-indigo-400">Kemudian: </span>
                  <span>{then}</span>
                </div>
              )}
              {finally_ && (
                <div>
                  <span className="font-semibold text-xs text-emerald-400">Akhirnya: </span>
                  <span>{finally_}</span>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>
              {artifact.content}
            </p>
          )}

          <div className="mt-3 pt-3 border-t flex items-center justify-between" style={{ borderColor: 'var(--border-subtle)' }}>
            <button
              type="button"
              onClick={() => setShowConfirmRemove(true)}
              className="text-xs font-medium flex items-center gap-1 transition-colors px-2 py-1 rounded text-rose-400 hover:bg-rose-500/10"
            >
              🗑 Hapus dari Memori
            </button>
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="text-xs font-medium transition-colors px-2 py-1 rounded hover:bg-slate-800/50"
              style={{ color: 'var(--accent-400)' }}
            >
              ✏ Sunting Alur
            </button>
          </div>
        </div>
      )}

      {/* Confirmation Dialog to Remove Journey */}
      {showConfirmRemove && (
        <div
          className="p-3 rounded-lg border mt-2 space-y-2 text-xs"
          style={{
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            borderColor: 'rgba(239, 68, 68, 0.3)',
          }}
        >
          <p className="font-semibold" style={{ color: 'var(--color-danger)' }}>
            Hapus Perjalanan Diskusi dari Memori Permanen?
          </p>
          <p style={{ color: 'var(--text-secondary)' }}>
            Bagian ini tidak akan ditampilkan pada kartu memori grup bagi anggota. Ringkasan dan poin keputusan tetap disimpan.
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setShowConfirmRemove(false)}
              disabled={isRemoving}
              className="px-2.5 py-1 rounded text-xs font-medium"
              style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleConfirmRemove}
              disabled={isRemoving}
              className="px-2.5 py-1 rounded text-xs font-medium transition-colors"
              style={{ backgroundColor: 'var(--color-danger)', color: '#ffffff' }}
            >
              {isRemoving ? 'Menghapus...' : 'Ya, Hapus Bagian Ini'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// -----------------------------------------------------------------------------
// 4. JourneyLiteSkippedCard
// -----------------------------------------------------------------------------

export function JourneyLiteSkippedCard() {
  return (
    <div
      className="p-3.5 rounded-xl border text-xs"
      style={{
        backgroundColor: 'rgba(15, 23, 42, 0.4)',
        borderColor: 'var(--border-subtle)',
        color: 'var(--text-muted)',
      }}
    >
      <div className="flex items-center gap-2">
        <span>ℹ️</span>
        <span className="italic">
          Perjalanan diskusi dilewati oleh AI karena forum berlangsung singkat dengan konsensus cepat tanpa perdebatan opsi.
        </span>
      </div>
    </div>
  )
}
