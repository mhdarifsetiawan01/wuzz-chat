'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
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
      className="fixed inset-0 z-[1000] flex items-center justify-center p-0 sm:p-4 transition-opacity"
      style={{
        backgroundColor: 'rgba(9, 13, 22, 0.85)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <div
        className="w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-2xl flex flex-col rounded-none sm:rounded-2xl overflow-hidden shadow-2xl transition-all"
        style={{
          backgroundColor: 'var(--bg-base)',
          border: '1px solid var(--border-default)',
        }}
      >
        {/* Sticky Header */}
        <div
          className="sticky top-0 z-20 px-4 py-3 sm:px-6 sm:py-4 flex items-center justify-between border-b flex-shrink-0"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-default)',
            backdropFilter: 'blur(12px)',
          }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 -ml-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title="Kembali"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
            <div className="min-w-0">
              <h2 className="text-base font-bold truncate flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                <span>🧠 Review Memori AI Forum</span>
                {hasEdits && (
                  <span
                    className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: 'rgba(245, 158, 11, 0.15)', color: 'var(--color-warning)' }}
                  >
                    Ada Suntingan
                  </span>
                )}
              </h2>
              <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                {draft?.forum_title || 'Memvalidasi Keputusan Forum'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="text-xs px-2.5 py-1 rounded-lg font-medium transition-colors"
            style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
          >
            Tutup
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {isLoading ? (
            <div className="py-16 text-center space-y-3">
              <div
                className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin mx-auto"
                style={{ borderColor: 'var(--accent-500)', borderTopColor: 'transparent' }}
              />
              <p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                Memuat draft ringkasan memori...
              </p>
            </div>
          ) : errorMessage ? (
            <div
              className="p-4 rounded-xl border text-sm space-y-2"
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                borderColor: 'rgba(239, 68, 68, 0.3)',
                color: 'var(--color-danger)',
              }}
            >
              <p className="font-semibold">Terjadi Kesalahan</p>
              <p className="text-xs">{errorMessage}</p>
              <button
                type="button"
                onClick={loadDraft}
                className="text-xs underline font-medium"
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

        {/* Sticky Action Bar */}
        {draft && !isLoading && (
          <div
            className="sticky bottom-0 z-20 px-4 py-3 sm:px-6 sm:py-3.5 border-t flex items-center justify-between gap-2 flex-shrink-0"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-default)',
              backdropFilter: 'blur(12px)',
              paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))',
            }}
          >
            <button
              type="button"
              onClick={() => setShowRejectModal(true)}
              disabled={isSubmitting}
              className="px-3 py-2 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 text-rose-400 hover:bg-rose-500/10 border border-rose-500/20"
            >
              <span>❌</span>
              <span className="hidden sm:inline">Tolak Draft</span>
              <span className="sm:hidden">Tolak</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors"
                style={{
                  backgroundColor: 'var(--bg-tertiary)',
                  color: 'var(--text-secondary)',
                }}
              >
                Nanti Saja
              </button>

              <button
                type="button"
                onClick={handleApprove}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5"
                style={{
                  backgroundColor: 'var(--color-success)',
                  color: '#ffffff',
                  opacity: isSubmitting ? 0.6 : 1,
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                }}
              >
                {isSubmitting ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
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
          className="fixed inset-0 z-[1100] flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.75)' }}
        >
          <div
            className="w-full max-w-md p-5 rounded-2xl border space-y-4 shadow-2xl"
            style={{
              backgroundColor: 'var(--bg-base)',
              borderColor: 'var(--border-default)',
            }}
          >
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-rose-400 flex items-center gap-2">
                <span>⚠️ Tolak Draft Memori AI?</span>
              </h3>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                Draft ini akan ditolak dan tidak akan dipublikasikan ke memori grup. Tindakan ini tidak dapat dibatalkan.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                Alasan Penolakan (Opsional):
              </label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={3}
                className="w-full p-2.5 rounded-lg text-xs resize-none focus:outline-none"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-default)',
                  color: 'var(--text-primary)',
                }}
                placeholder="Misal: Diskusi tidak konklusif atau tidak relevan untuk grup..."
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
              <button
                type="button"
                onClick={() => setShowRejectModal(false)}
                disabled={isRejecting}
                className="px-3 py-1.5 rounded-lg text-xs font-medium"
                style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmReject}
                disabled={isRejecting}
                className="px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all text-white flex items-center gap-1.5"
                style={{ backgroundColor: 'var(--color-danger)' }}
              >
                {isRejecting ? 'Menolak...' : 'Ya, Tolak Draft'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )

  // Render ke document.body via portal agar tidak terpotong oleh
  // stacking context parent (.chat-main-pane: overflow:hidden + position:relative)
  if (typeof document === 'undefined') return null
  return createPortal(modalContent, document.body)
}
