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
    <div className="memory-review-card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--accent-400)' }}>
            📌 Ringkasan Diskusi
          </span>
          {artifact.is_human_edited && (
            <span
              style={{
                fontSize: '0.7rem',
                padding: '2px 6px',
                borderRadius: '4px',
                fontWeight: 500,
                backgroundColor: 'rgba(59, 130, 246, 0.15)',
                color: 'var(--accent-300)',
              }}
            >
              Telah Disunting
            </span>
          )}
        </div>
        <ConfidenceBadge confidence={artifact.confidence} />
      </div>

      {isEditing ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <textarea
            value={draftContent}
            onChange={(e) => setDraftContent(e.target.value)}
            rows={4}
            className="memory-textarea"
            placeholder="Tulis ringkasan diskusi yang telah dikurasi..."
          />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
            <button
              type="button"
              onClick={handleCancel}
              disabled={isSaving}
              className="btn btn-secondary"
              style={{ fontSize: '0.78rem', padding: '6px 12px' }}
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || !draftContent.trim()}
              className="btn btn-primary"
              style={{ fontSize: '0.78rem', padding: '6px 14px' }}
            >
              {isSaving ? 'Menyimpan...' : 'Simpan Suntingan'}
            </button>
          </div>
        </div>
      ) : (
        <div>
          <p style={{ margin: 0, fontSize: '0.88rem', lineHeight: 1.6, whiteSpace: 'pre-wrap', color: 'var(--text-primary)' }}>
            {artifact.content}
          </p>
          <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              style={{
                background: 'none',
                border: 'none',
                fontSize: '0.78rem',
                fontWeight: 500,
                color: 'var(--accent-400)',
                cursor: 'pointer',
                padding: '4px 8px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
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
    <div className="memory-review-card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              width: '22px',
              height: '22px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.75rem',
              fontWeight: 700,
              backgroundColor: 'var(--accent-500)',
              color: 'var(--text-on-accent)',
              flexShrink: 0,
            }}
          >
            {index}
          </span>
          <span style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            Poin Keputusan #{index}
          </span>
          {artifact.is_human_edited && (
            <span
              style={{
                fontSize: '0.7rem',
                padding: '2px 6px',
                borderRadius: '4px',
                fontWeight: 500,
                backgroundColor: 'rgba(59, 130, 246, 0.15)',
                color: 'var(--accent-300)',
              }}
            >
              Telah Disunting
            </span>
          )}
        </div>
        <ConfidenceBadge confidence={artifact.confidence} />
      </div>

      {isEditing ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <textarea
            value={draftContent}
            onChange={(e) => setDraftContent(e.target.value)}
            rows={3}
            className="memory-textarea"
            placeholder="Tulis revisi keputusan..."
          />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
            <button
              type="button"
              onClick={() => {
                setDraftContent(artifact.content)
                setIsEditing(false)
              }}
              disabled={isSaving}
              className="btn btn-secondary"
              style={{ fontSize: '0.78rem', padding: '6px 12px' }}
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || !draftContent.trim()}
              className="btn btn-primary"
              style={{ fontSize: '0.78rem', padding: '6px 14px' }}
            >
              {isSaving ? 'Menyimpan...' : 'Simpan'}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
          <p style={{ margin: 0, fontSize: '0.88rem', lineHeight: 1.5, color: 'var(--text-primary)' }}>
            {artifact.content}
          </p>
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '0.78rem',
              fontWeight: 500,
              color: 'var(--accent-400)',
              cursor: 'pointer',
              padding: '4px 8px',
              borderRadius: '6px',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            ✏ Sunting
          </button>
        </div>
      )}

      {/* Evidence Snapshot Block */}
      {artifact.evidences && artifact.evidences.length > 0 && (
        <div style={{ paddingTop: '8px', borderTop: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>🔍 Bukti Sumber Pesan Diskusi:</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {artifact.evidences.map((ev, evIdx) => (
              <div key={ev.id || evIdx} className="memory-evidence-item">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.72rem' }}>
                  <span style={{ fontWeight: 600, color: 'var(--accent-300)' }}>
                    👤 {ev.message_sender_name}
                  </span>
                  <span style={{ color: 'var(--text-muted)' }}>
                    {ev.message_sent_at ? new Date(ev.message_sent_at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }) : ''}
                  </span>
                </div>
                <p style={{ margin: 0, fontStyle: 'italic', fontSize: '0.78rem', lineHeight: 1.4, color: 'var(--text-secondary)' }}>
                  &ldquo;{ev.message_preview}&rdquo;
                </p>
                {onJumpToMessage && ev.message_id && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '4px' }}>
                    <button
                      type="button"
                      onClick={() => onJumpToMessage(forumId, ev.message_id)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--accent-400)',
                        fontSize: '0.74rem',
                        fontWeight: 500,
                        cursor: 'pointer',
                        padding: 0,
                      }}
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
    <div className="memory-review-card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--accent-400)' }}>
            🧭 Perjalanan Diskusi (Journey Lite)
          </span>
          {artifact.is_human_edited && (
            <span
              style={{
                fontSize: '0.7rem',
                padding: '2px 6px',
                borderRadius: '4px',
                fontWeight: 500,
                backgroundColor: 'rgba(59, 130, 246, 0.15)',
                color: 'var(--accent-300)',
              }}
            >
              Telah Disunting
            </span>
          )}
        </div>
        <ConfidenceBadge confidence={artifact.confidence} />
      </div>

      {isEditing ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <textarea
            value={draftContent}
            onChange={(e) => setDraftContent(e.target.value)}
            rows={4}
            className="memory-textarea"
            placeholder="Tulis revisi linimasa perjalanan diskusi..."
          />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
            <button
              type="button"
              onClick={() => {
                setDraftContent(artifact.content)
                setIsEditing(false)
              }}
              disabled={isSaving}
              className="btn btn-secondary"
              style={{ fontSize: '0.78rem', padding: '6px 12px' }}
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || !draftContent.trim()}
              className="btn btn-primary"
              style={{ fontSize: '0.78rem', padding: '6px 14px' }}
            >
              {isSaving ? 'Menyimpan...' : 'Simpan'}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {isParsedJSON ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                fontSize: '0.85rem',
                lineHeight: 1.5,
                color: 'var(--text-primary)',
              }}
            >
              {initially && (
                <div>
                  <span style={{ fontWeight: 600, fontSize: '0.78rem', color: 'var(--color-info)' }}>Awalnya: </span>
                  <span>{initially}</span>
                </div>
              )}
              {then && (
                <div>
                  <span style={{ fontWeight: 600, fontSize: '0.78rem', color: 'var(--accent-400)' }}>Kemudian: </span>
                  <span>{then}</span>
                </div>
              )}
              {finally_ && (
                <div>
                  <span style={{ fontWeight: 600, fontSize: '0.78rem', color: 'var(--color-success)' }}>Akhirnya: </span>
                  <span>{finally_}</span>
                </div>
              )}
            </div>
          ) : (
            <p style={{ margin: 0, fontSize: '0.88rem', lineHeight: 1.6, whiteSpace: 'pre-wrap', color: 'var(--text-primary)' }}>
              {artifact.content}
            </p>
          )}

          <div style={{ marginTop: '4px', paddingTop: '10px', borderTop: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <button
              type="button"
              onClick={() => setShowConfirmRemove(true)}
              style={{
                background: 'none',
                border: 'none',
                fontSize: '0.78rem',
                fontWeight: 500,
                color: 'var(--color-error)',
                cursor: 'pointer',
                padding: '4px 8px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              🗑 Hapus dari Memori
            </button>
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              style={{
                background: 'none',
                border: 'none',
                fontSize: '0.78rem',
                fontWeight: 500,
                color: 'var(--accent-400)',
                cursor: 'pointer',
                padding: '4px 8px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              ✏ Sunting Alur
            </button>
          </div>
        </div>
      )}

      {/* Confirmation Dialog to Remove Journey */}
      {showConfirmRemove && (
        <div
          style={{
            padding: '12px 14px',
            borderRadius: '10px',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            backgroundColor: 'var(--tint-error-15)',
            marginTop: '8px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            fontSize: '0.8rem',
          }}
        >
          <p style={{ fontWeight: 600, color: 'var(--color-error)', margin: 0 }}>
            Hapus Perjalanan Diskusi dari Memori Permanen?
          </p>
          <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.76rem', lineHeight: 1.4 }}>
            Bagian ini tidak akan ditampilkan pada kartu memori grup bagi anggota. Ringkasan dan poin keputusan tetap disimpan.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', paddingTop: '4px' }}>
            <button
              type="button"
              onClick={() => setShowConfirmRemove(false)}
              disabled={isRemoving}
              className="btn btn-secondary"
              style={{ fontSize: '0.75rem', padding: '4px 10px' }}
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleConfirmRemove}
              disabled={isRemoving}
              className="btn"
              style={{
                fontSize: '0.75rem',
                padding: '4px 12px',
                backgroundColor: 'var(--color-danger)',
                color: '#ffffff',
                fontWeight: 600,
              }}
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
      style={{
        padding: '14px 16px',
        borderRadius: '12px',
        border: '1px solid var(--border-subtle)',
        backgroundColor: 'rgba(15, 23, 42, 0.4)',
        fontSize: '0.8rem',
        color: 'var(--text-muted)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span>ℹ️</span>
        <span style={{ fontStyle: 'italic', lineHeight: 1.4 }}>
          Perjalanan diskusi dilewati oleh AI karena forum berlangsung singkat dengan konsensus cepat tanpa perdebatan opsi.
        </span>
      </div>
    </div>
  )
}
