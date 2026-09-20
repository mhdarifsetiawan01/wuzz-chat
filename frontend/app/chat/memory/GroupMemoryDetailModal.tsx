'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { ApprovedMemoryDetail } from '@/lib/types'
import { fetchApprovedMemoryDetail } from '@/lib/api'
import { ConfidenceBadge } from './ConfidenceBadge'

interface GroupMemoryDetailModalProps {
  memoryId: string
  isOpen: boolean
  onClose: () => void
  onJumpToMessage?: (forumId: string, messageId: string) => void
  onOpenForumChat?: (forumId: string) => void
}

export function GroupMemoryDetailModal({
  memoryId,
  isOpen,
  onClose,
  onJumpToMessage,
  onOpenForumChat,
}: GroupMemoryDetailModalProps) {
  const [memory, setMemory] = useState<ApprovedMemoryDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')

  const loadDetail = useCallback(async () => {
    if (!memoryId) return
    setIsLoading(true)
    setErrorMessage('')

    const res = await fetchApprovedMemoryDetail(memoryId)
    setIsLoading(false)

    if (res.error) {
      setErrorMessage(res.error)
      return
    }

    if (res.data) {
      setMemory(res.data)
    }
  }, [memoryId])

  useEffect(() => {
    if (isOpen && memoryId) {
      loadDetail()
    } else {
      setMemory(null)
      setErrorMessage('')
    }
  }, [isOpen, memoryId, loadDetail])

  if (!isOpen) return null

  // Parse Journey Lite jika berupa JSON
  let initially = ''
  let then = ''
  let finally_ = ''
  let isParsedJourneyJSON = false

  if (memory?.snapshot_journey_lite && !memory.is_journey_lite_removed) {
    try {
      const parsed = JSON.parse(memory.snapshot_journey_lite)
      if (parsed.initially || parsed.then || parsed.finally_) {
        initially = parsed.initially || ''
        then = parsed.then || ''
        finally_ = parsed.finally_ || ''
        isParsedJourneyJSON = true
      }
    } catch {
      isParsedJourneyJSON = false
    }
  }

  return (
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
        {/* Header */}
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
              title="Tutup"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
            <div className="min-w-0">
              <h2 className="text-base font-bold truncate flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                <span>🧠 Memori Pengetahuan Grup</span>
              </h2>
              <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                {memory?.forum_title ? `Topik: ${memory.forum_title}` : 'Arsip Keputusan Permanen'}
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
                Memuat memori pengetahuan...
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
              <p className="font-semibold">Gagal Memuat</p>
              <p className="text-xs">{errorMessage}</p>
              <button
                type="button"
                onClick={loadDetail}
                className="text-xs underline font-medium"
              >
                Coba lagi
              </button>
            </div>
          ) : memory ? (
            <>
              {/* 1. Summary Section */}
              <div
                className="p-4 rounded-xl space-y-2.5"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-default)',
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--accent-400)' }}>
                    📌 Ringkasan Keputusan Forum
                  </span>
                  <ConfidenceBadge confidence={memory.snapshot_summary_conf} />
                </div>
                <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>
                  {memory.snapshot_summary}
                </p>
              </div>

              {/* 2. Decisions List */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--accent-400)' }}>
                  🎯 Poin Keputusan & Bukti ({memory.snapshot_decisions.length})
                </h3>

                {memory.snapshot_decisions.length === 0 ? (
                  <div
                    className="p-4 rounded-xl border text-center text-xs italic"
                    style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}
                  >
                    Tidak ada poin keputusan tertulis.
                  </div>
                ) : (
                  memory.snapshot_decisions.map((dec, idx) => (
                    <div
                      key={idx}
                      className="p-4 rounded-xl space-y-3"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        border: '1px solid var(--border-default)',
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
                            style={{ backgroundColor: 'var(--accent-500)', color: 'var(--text-inverse)' }}
                          >
                            {dec.position || idx + 1}
                          </span>
                          <span className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>
                            Poin #{dec.position || idx + 1}
                          </span>
                          {dec.is_human_edited && (
                            <span
                              className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                              style={{ backgroundColor: 'rgba(59, 130, 246, 0.15)', color: 'var(--accent-300)' }}
                            >
                              Disunting Admin
                            </span>
                          )}
                        </div>
                        <ConfidenceBadge confidence={dec.confidence} />
                      </div>

                      <p className="text-sm leading-relaxed font-medium" style={{ color: 'var(--text-primary)' }}>
                        {dec.text}
                      </p>

                      {/* Evidences */}
                      {dec.evidences && dec.evidences.length > 0 && (
                        <div className="pt-2 border-t space-y-2" style={{ borderColor: 'var(--border-subtle)' }}>
                          <span className="text-[11px] font-semibold text-slate-400">
                            🔍 Kutipan Bukti Diskusi Asli:
                          </span>
                          {dec.evidences.map((ev, evIdx) => (
                            <div
                              key={ev.message_id || evIdx}
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
                                  👤 {ev.sender_name}
                                </span>
                                <span style={{ color: 'var(--text-muted)' }}>
                                  {ev.sent_at ? new Date(ev.sent_at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }) : ''}
                                </span>
                              </div>
                              <p className="italic text-xs leading-normal" style={{ color: 'var(--text-secondary)' }}>
                                &ldquo;{ev.preview}&rdquo;
                              </p>
                              {onJumpToMessage && ev.message_id && (
                                <div className="flex justify-end pt-0.5">
                                  <button
                                    type="button"
                                    onClick={() => onJumpToMessage(memory.forum_id, ev.message_id)}
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
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* 3. Journey Lite Section */}
              {memory.snapshot_journey_lite && !memory.is_journey_lite_removed && (
                <div
                  className="p-4 rounded-xl space-y-3"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border-default)',
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--accent-secondary)' }}>
                      🧭 Perjalanan Diskusi
                    </span>
                    {memory.snapshot_journey_conf && (
                      <ConfidenceBadge confidence={memory.snapshot_journey_conf} />
                    )}
                  </div>

                  {isParsedJourneyJSON ? (
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
                      {memory.snapshot_journey_lite}
                    </p>
                  )}
                </div>
              )}

              {/* 4. Footer Validation Signature */}
              <div
                className="p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                style={{
                  backgroundColor: 'rgba(16, 185, 129, 0.08)',
                  borderColor: 'rgba(16, 185, 129, 0.25)',
                }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-base">✅</span>
                  <div>
                    <strong style={{ color: 'var(--color-success)' }}>
                      {memory.has_human_edits
                        ? `Divalidasi dan disunting oleh ${memory.approved_by_name || 'Admin Grup'}`
                        : `Divalidasi oleh ${memory.approved_by_name || 'Admin Grup'}`}
                    </strong>
                    <span className="block text-[11px]" style={{ color: 'var(--text-muted)' }}>
                      Pada {new Date(memory.approved_at).toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' })}
                    </span>
                  </div>
                </div>

                {onOpenForumChat && memory.forum_id && (
                  <button
                    type="button"
                    onClick={() => onOpenForumChat(memory.forum_id)}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors hover:bg-emerald-500/20 text-emerald-300 border-emerald-500/30 flex-shrink-0"
                  >
                    📄 Buka Forum Asli
                  </button>
                )}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export default GroupMemoryDetailModal
