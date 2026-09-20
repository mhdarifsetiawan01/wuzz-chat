'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { usePortalTarget } from '@/lib/usePortalTarget'
import { MemoryDraftDetail, MemoryArtifactItem } from '@/lib/types'
import {
  fetchMemoryDraftDetail,
  approveMemoryDraft,
  rejectMemoryDraft,
  updateMemoryArtifact,
  removeJourneyLite,
} from '@/lib/api'
import {
  SummaryReviewCard,
  DecisionReviewCard,
  JourneyLiteReviewCard,
  JourneyLiteSkippedCard,
} from './ReviewCards'

interface MemoryDraftReviewModalProps {
  draftId: string
  isOpen: boolean
  onClose: () => void
  onApproved?: (approvedMemory: any) => void
  onRejected?: () => void
  onJumpToMessage?: (forumId: string, messageId: string) => void
}

export function MemoryDraftReviewModal({
  draftId,
  isOpen,
  onClose,
  onApproved,
  onRejected,
  onJumpToMessage,
}: MemoryDraftReviewModalProps) {
  const portalTarget = usePortalTarget()
  const [draft, setDraft] = useState<MemoryDraftDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [hasEdits, setHasEdits] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Dialog konfirmasi tolak
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [rejectionReason, setRejectionReason] = useState('')
  const [isRejecting, setIsRejecting] = useState(false)

  // Load data draft
  const loadDraft = useCallback(async () => {
    if (!draftId) return
    setIsLoading(true)
    setErrorMessage('')
    const res = await fetchMemoryDraftDetail(draftId)
    setIsLoading(false)

    if (res.error) {
      setErrorMessage(res.error)
      return
    }

    if (res.data && res.data.draft) {
      setDraft(res.data.draft)
      // Periksa apakah draft sudah memiliki artefak yang disunting sebelumnya
      const anyEdited = res.data.draft.artifacts.some((a) => a.is_human_edited || a.is_removed)
      setHasEdits(anyEdited)
    }
  }, [draftId])

  useEffect(() => {
    if (isOpen && draftId) {
      loadDraft()
    } else {
      setDraft(null)
      setErrorMessage('')
      setShowRejectModal(false)
      setRejectionReason('')
      setHasEdits(false)
    }
  }, [isOpen, draftId, loadDraft])

  if (!isOpen) return null

  // Handler simpan edit artefak
  const handleSaveArtifactContent = async (artifactId: string, newContent: string): Promise<boolean> => {
    if (!draft) return false
    const res = await updateMemoryArtifact(draft.id, artifactId, newContent)
    if (res.error) {
      alert('Gagal menyimpan suntingan: ' + res.error)
      return false
    }

    // Update lokal
    setDraft((prev) => {
      if (!prev) return null
      const updatedArts = prev.artifacts.map((a) => {
        if (a.id === artifactId) {
          return { ...a, content: newContent, is_human_edited: true }
        }
        return a
      })
      return { ...prev, artifacts: updatedArts }
    })
    setHasEdits(true)
    return true
  }

  // Handler hapus Journey Lite
  const handleRemoveJourney = async (): Promise<boolean> => {
    if (!draft) return false
    const res = await removeJourneyLite(draft.id)
    if (res.error) {
      alert('Gagal menghapus Journey Lite: ' + res.error)
      return false
    }

    setDraft((prev) => {
      if (!prev) return null
      const updatedArts = prev.artifacts.map((a) => {
        if (a.type === 'JOURNEY_LITE') {
          return { ...a, is_removed: true, is_human_edited: true }
        }
        return a
      })
      return { ...prev, artifacts: updatedArts }
    })
    setHasEdits(true)
    return true
  }

  // Handler Approve
  const handleApprove = async () => {
    if (!draft || isSubmitting) return
    setIsSubmitting(true)
    setErrorMessage('')

    const res = await approveMemoryDraft(draft.id, hasEdits)
    setIsSubmitting(false)

    if (res.error) {
      setErrorMessage('Gagal menyetujui draft: ' + res.error)
      return
    }

    if (onApproved) {
      onApproved(res.data?.approved_memory)
    }
    onClose()
  }

  // Handler Reject
  const handleConfirmReject = async () => {
    if (!draft || isRejecting) return
    setIsRejecting(true)

    const res = await rejectMemoryDraft(draft.id, rejectionReason)
    setIsRejecting(false)
    setShowRejectModal(false)

    if (res.error) {
      alert('Gagal menolak draft: ' + res.error)
      return
    }

    if (onRejected) {
      onRejected()
    }
    onClose()
  }

  // Filter artefak
  const summaryArtifact = draft?.artifacts.find((a) => a.type === 'SUMMARY' && !a.is_removed)
  const decisionArtifacts = draft?.artifacts.filter((a) => a.type === 'DECISION' && !a.is_removed) || []
  const journeyArtifact = draft?.artifacts.find((a) => a.type === 'JOURNEY_LITE')

  const modalContent = (
    <div
      className="group-modal-backdrop z-modal"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="draft-review-title"
    >
      <div
        className="group-modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 680, maxHeight: '90vh', padding: 0 }}
      >
        {/* Header Modal */}
        <div className="group-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-primary)',
                fontSize: '1.25rem',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                flexShrink: 0,
              }}
              title="Kembali"
              aria-label="Kembali"
            >
              ←
            </button>
            <div style={{ minWidth: 0 }}>
              <h2
                id="draft-review-title"
                style={{
                  margin: 0,
                  fontSize: '1.05rem',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                <span>🧠 Review Memori AI Forum</span>
                {hasEdits && (
                  <span
                    style={{
                      fontSize: '0.68rem',
                      fontWeight: 600,
                      padding: '2px 7px',
                      borderRadius: '9999px',
                      backgroundColor: 'rgba(245, 158, 11, 0.15)',
                      color: 'var(--color-warning)',
                    }}
                  >
                    Ada Suntingan
                  </span>
                )}
              </h2>
              <span
                style={{
                  fontSize: '0.78rem',
                  color: 'var(--text-muted)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  display: 'block',
                }}
              >
                {draft?.forum_title || 'Memvalidasi Keputusan Forum'}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="group-modal-close-btn"
            aria-label="Tutup review memori"
          >
            ✕
          </button>
        </div>

        {/* Scrollable Body */}
        <div
          className="group-modal-body"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            padding: '20px',
          }}
        >
          {isLoading ? (
            <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
              <div className="spinner" style={{ margin: '0 auto 12px' }} />
              <p style={{ fontSize: '0.85rem', margin: 0 }}>Memuat draft ringkasan memori...</p>
            </div>
          ) : errorMessage ? (
            <div
              style={{
                backgroundColor: 'var(--tint-error-15)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: 'var(--color-error)',
                padding: '14px 16px',
                borderRadius: '12px',
                fontSize: '0.85rem',
              }}
            >
              <p style={{ fontWeight: 600, margin: '0 0 4px' }}>Terjadi Kesalahan</p>
              <p style={{ margin: '0 0 10px', fontSize: '0.8rem' }}>{errorMessage}</p>
              <button
                type="button"
                onClick={loadDraft}
                className="btn btn-secondary"
                style={{ fontSize: '0.75rem', padding: '4px 10px' }}
              >
                Coba lagi
              </button>
            </div>
          ) : draft ? (
            <>
              {/* Context Header Info */}
              <div
                className="p-3 rounded-xl text-xs space-y-1"
                style={{
                  backgroundColor: 'rgba(59, 130, 246, 0.06)',
                  border: '1px solid rgba(59, 130, 246, 0.15)',
                }}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold" style={{ color: 'var(--accent-400)' }}>
                    💬 Data Sumber Forum
                  </span>
                  <span style={{ color: 'var(--text-muted)' }}>
                    {draft.message_count_processed} pesan percakapan dianalisis
                  </span>
                </div>
                <p style={{ color: 'var(--text-secondary)' }}>
                  Periksa kebenaran ringkasan dan bukti keputusan di bawah sebelum disetujui. Keputusan yang disetujui akan diabadikan permanen untuk seluruh anggota grup.
                </p>
              </div>

              {/* 1. Summary Card */}
              {summaryArtifact ? (
                <SummaryReviewCard
                  artifact={summaryArtifact}
                  onSaveContent={handleSaveArtifactContent}
                />
              ) : null}

              {/* 2. Decisions List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--accent-400)' }}>
                    🎯 Poin Keputusan & Bukti ({decisionArtifacts.length})
                  </h3>
                </div>

                {decisionArtifacts.length === 0 ? (
                  <div
                    className="p-4 rounded-xl border text-center text-xs italic"
                    style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}
                  >
                    Tidak ada poin keputusan teridentifikasi dalam forum ini.
                  </div>
                ) : (
                  decisionArtifacts.map((dec, idx) => (
                    <DecisionReviewCard
                      key={dec.id}
                      artifact={dec}
                      index={idx + 1}
                      forumId={draft.forum_id}
                      onSaveContent={handleSaveArtifactContent}
                      onJumpToMessage={onJumpToMessage}
                    />
                  ))
                )}
              </div>

              {/* 3. Journey Lite */}
              <div className="space-y-2">
                {journeyArtifact && !journeyArtifact.is_removed ? (
                  <JourneyLiteReviewCard
                    artifact={journeyArtifact}
                    onSaveContent={handleSaveArtifactContent}
                    onRemoveJourney={handleRemoveJourney}
                  />
                ) : (
                  <JourneyLiteSkippedCard />
                )}
              </div>
            </>
          ) : null}
        </div>

        {/* Action Bar Footer */}
        {draft && !isLoading && (
          <div
            className="group-modal-footer"
            style={{
              padding: '14px 20px',
              paddingBottom: 'max(14px, env(safe-area-inset-bottom, 0px))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px',
              flexWrap: 'wrap',
            }}
          >
            <button
              type="button"
              onClick={() => setShowRejectModal(true)}
              disabled={isSubmitting}
              className="btn btn-secondary"
              style={{
                fontSize: '0.8rem',
                padding: '8px 14px',
                color: 'var(--color-error)',
                borderColor: 'rgba(239, 68, 68, 0.3)',
              }}
            >
              <span>❌ Tolak Draft</span>
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="btn btn-secondary"
                style={{ fontSize: '0.8rem', padding: '8px 14px' }}
              >
                Nanti Saja
              </button>

              <button
                type="button"
                onClick={handleApprove}
                disabled={isSubmitting}
                className="btn btn-primary"
                style={{
                  fontSize: '0.8rem',
                  padding: '8px 16px',
                  backgroundColor: 'var(--color-success)',
                  borderColor: 'var(--color-success)',
                  opacity: isSubmitting ? 0.6 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                {isSubmitting ? (
                  <>
                    <span className="spinner" style={{ width: '14px', height: '14px', borderWidth: '2px' }} />
                    <span>Mempublikasikan...</span>
                  </>
                ) : (
                  <>
                    <span>✅</span>
                    <span>{hasEdits ? 'Setujui dengan Suntingan' : 'Setujui & Publikasikan'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal Dialog Konfirmasi Tolak */}
      {showRejectModal && (
        <div
          className="group-modal-backdrop"
          style={{ zIndex: 'var(--z-modal-top)' as any, backgroundColor: 'rgba(0, 0, 0, 0.82)' }}
          onClick={() => !isRejecting && setShowRejectModal(false)}
        >
          <div
            className="group-modal-card"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 440, padding: '20px', gap: '14px' }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--color-error)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>⚠️</span> Tolak Draft Memori AI?
              </h3>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                Draft ini akan ditolak dan tidak akan dipublikasikan ke memori grup. Tindakan ini tidak dapat dibatalkan.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                Alasan Penolakan (Opsional):
              </label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={3}
                className="group-form-textarea"
                style={{ fontSize: '0.82rem', resize: 'none' }}
                placeholder="Misal: Diskusi tidak konklusif atau tidak relevan untuk grup..."
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px', paddingTop: '8px', borderTop: '1px solid var(--border-subtle)' }}>
              <button
                type="button"
                onClick={() => setShowRejectModal(false)}
                disabled={isRejecting}
                className="btn btn-secondary"
                style={{ fontSize: '0.8rem', padding: '6px 12px' }}
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmReject}
                disabled={isRejecting}
                className="btn"
                style={{
                  fontSize: '0.8rem',
                  padding: '6px 14px',
                  backgroundColor: 'var(--color-danger)',
                  color: '#ffffff',
                  fontWeight: 600,
                }}
              >
                {isRejecting ? 'Menolak...' : 'Ya, Tolak Draft'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )

  // Render ke #modal-portal-root via portal agar bebas dari
  // stacking context parent (.chat-app-container / .chat-main-pane)
  if (!portalTarget) return null
  return createPortal(modalContent, portalTarget)
}
