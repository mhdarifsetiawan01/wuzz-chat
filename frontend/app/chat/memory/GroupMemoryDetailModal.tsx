'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { usePortalTarget } from '@/lib/usePortalTarget'
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
  const portalTarget = usePortalTarget()
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

  const modalContent = (
    <div
      className="group-modal-backdrop z-modal"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="memory-detail-title"
    >
      <div
        className="group-modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 640, maxHeight: '90vh', padding: 0 }}
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
              title="Kembali ke arsip"
              aria-label="Kembali"
            >
              ←
            </button>
            <div style={{ minWidth: 0 }}>
              <h2
                id="memory-detail-title"
                style={{
                  margin: 0,
                  fontSize: '1.05rem',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                🧠 Memori Pengetahuan Grup
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
                {memory?.forum_title ? `Topik: ${memory.forum_title}` : 'Arsip Keputusan Permanen'}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="group-modal-close-btn"
            aria-label="Tutup detail memori"
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
            paddingBottom: 'max(24px, env(safe-area-inset-bottom, 0px))',
          }}
        >
          {isLoading ? (
            <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
              <div className="spinner" style={{ margin: '0 auto 12px' }} />
              <p style={{ fontSize: '0.85rem', margin: 0 }}>Memuat memori pengetahuan...</p>
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
              <p style={{ fontWeight: 600, margin: '0 0 4px' }}>Gagal Memuat</p>
              <p style={{ margin: '0 0 10px', fontSize: '0.8rem' }}>{errorMessage}</p>
              <button
                type="button"
                onClick={loadDetail}
                className="btn btn-secondary"
                style={{ fontSize: '0.75rem', padding: '4px 10px' }}
              >
                Coba lagi
              </button>
            </div>
          ) : memory ? (
            <>
              {/* 1. Summary Section */}
              <div
                style={{
                  padding: '16px',
                  borderRadius: '14px',
                  backgroundColor: 'var(--bg-elevated)',
                  border: '1px solid var(--border-default)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <span
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color: 'var(--accent-400)',
                    }}
                  >
                    📌 Ringkasan Keputusan Forum
                  </span>
                  <ConfidenceBadge confidence={memory.snapshot_summary_conf} />
                </div>
                <p
                  style={{
                    margin: 0,
                    fontSize: '0.88rem',
                    lineHeight: 1.6,
                    whiteSpace: 'pre-wrap',
                    color: 'var(--text-primary)',
                  }}
                >
                  {memory.snapshot_summary}
                </p>
              </div>

              {/* 2. Decisions List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <h3
                  style={{
                    margin: 0,
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: 'var(--accent-400)',
                  }}
                >
                  🎯 Poin Keputusan & Bukti ({memory.snapshot_decisions.length})
                </h3>

                {memory.snapshot_decisions.length === 0 ? (
                  <div
                    style={{
                      padding: '16px',
                      borderRadius: '12px',
                      border: '1px solid var(--border-subtle)',
                      textAlign: 'center',
                      fontSize: '0.8rem',
                      fontStyle: 'italic',
                      backgroundColor: 'var(--bg-elevated)',
                      color: 'var(--text-muted)',
                    }}
                  >
                    Tidak ada poin keputusan tertulis.
                  </div>
                ) : (
                  memory.snapshot_decisions.map((dec, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: '16px',
                        borderRadius: '14px',
                        backgroundColor: 'var(--bg-elevated)',
                        border: '1px solid var(--border-default)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                      }}
                    >
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
                            {dec.position || idx + 1}
                          </span>
                          <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                            Poin #{dec.position || idx + 1}
                          </span>
                          {dec.is_human_edited && (
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
                              Disunting Admin
                            </span>
                          )}
                        </div>
                        <ConfidenceBadge confidence={dec.confidence} />
                      </div>

                      <p
                        style={{
                          margin: 0,
                          fontSize: '0.88rem',
                          lineHeight: 1.5,
                          fontWeight: 500,
                          color: 'var(--text-primary)',
                        }}
                      >
                        {dec.text}
                      </p>

                      {/* Evidences */}
                      {dec.evidences && dec.evidences.length > 0 && (
                        <div
                          style={{
                            paddingTop: '10px',
                            borderTop: '1px solid var(--border-subtle)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px',
                          }}
                        >
                          <span style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                            🔍 Kutipan Bukti Diskusi Asli:
                          </span>
                          {dec.evidences.map((ev, evIdx) => (
                            <div
                              key={ev.message_id || evIdx}
                              style={{
                                padding: '10px 12px',
                                borderRadius: '10px',
                                fontSize: '0.78rem',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '4px',
                                backgroundColor: 'rgba(15, 23, 42, 0.6)',
                                border: '1px solid var(--border-subtle)',
                                borderLeft: '3px solid var(--accent-500)',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.72rem' }}>
                                <span style={{ fontWeight: 600, color: 'var(--accent-300)' }}>
                                  👤 {ev.sender_name}
                                </span>
                                <span style={{ color: 'var(--text-muted)' }}>
                                  {ev.sent_at ? new Date(ev.sent_at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }) : ''}
                                </span>
                              </div>
                              <p style={{ margin: 0, fontStyle: 'italic', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                                &ldquo;{ev.preview}&rdquo;
                              </p>
                              {onJumpToMessage && ev.message_id && (
                                <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '4px' }}>
                                  <button
                                    type="button"
                                    onClick={() => onJumpToMessage(memory.forum_id, ev.message_id)}
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
                                    Buka di forum asli →
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
                  style={{
                    padding: '16px',
                    borderRadius: '14px',
                    backgroundColor: 'var(--bg-elevated)',
                    border: '1px solid var(--border-default)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <span
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        color: 'var(--accent-400)',
                      }}
                    >
                      🧭 Perjalanan Diskusi
                    </span>
                    {memory.snapshot_journey_conf && (
                      <ConfidenceBadge confidence={memory.snapshot_journey_conf} />
                    )}
                  </div>

                  {isParsedJourneyJSON ? (
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
                    <p
                      style={{
                        margin: 0,
                        fontSize: '0.85rem',
                        lineHeight: 1.5,
                        whiteSpace: 'pre-wrap',
                        color: 'var(--text-primary)',
                      }}
                    >
                      {memory.snapshot_journey_lite}
                    </p>
                  )}
                </div>
              )}

              {/* 4. Footer Validation Signature */}
              <div
                style={{
                  padding: '14px 16px',
                  borderRadius: '14px',
                  border: '1px solid rgba(16, 185, 129, 0.25)',
                  backgroundColor: 'rgba(16, 185, 129, 0.08)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  flexWrap: 'wrap',
                  fontSize: '0.8rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '1.2rem' }}>✅</span>
                  <div>
                    <strong style={{ color: 'var(--color-success)', display: 'block' }}>
                      {memory.has_human_edits
                        ? `Divalidasi dan disunting oleh ${memory.approved_by_name || 'Admin Grup'}`
                        : `Divalidasi oleh ${memory.approved_by_name || 'Admin Grup'}`}
                    </strong>
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                      Pada {new Date(memory.approved_at).toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' })}
                    </span>
                  </div>
                </div>

                {onOpenForumChat && memory.forum_id && (
                  <button
                    type="button"
                    onClick={() => onOpenForumChat(memory.forum_id)}
                    className="btn btn-secondary"
                    style={{ fontSize: '0.78rem', padding: '6px 14px' }}
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

  // Render ke #modal-portal-root via portal agar bebas dari
  // stacking context parent (.chat-app-container / .chat-main-pane)
  if (!portalTarget) return null
  return createPortal(modalContent, portalTarget)
}

export default GroupMemoryDetailModal
