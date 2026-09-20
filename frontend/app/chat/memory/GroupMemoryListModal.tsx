'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { usePortalTarget } from '@/lib/usePortalTarget'
import { ApprovedMemoryListItem } from '@/lib/types'
import { fetchGroupMemories } from '@/lib/api'
import { ConfidenceBadge } from './ConfidenceBadge'

interface GroupMemoryListModalProps {
  groupId: string
  groupName: string
  isOpen: boolean
  onClose: () => void
  onSelectMemory: (memoryId: string) => void
}

export function GroupMemoryListModal({
  groupId,
  groupName,
  isOpen,
  onClose,
  onSelectMemory,
}: GroupMemoryListModalProps) {
  const portalTarget = usePortalTarget()
  const [memories, setMemories] = useState<ApprovedMemoryListItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  const loadMemories = useCallback(async () => {
    if (!groupId) return
    setIsLoading(true)
    setErrorMessage('')

    const res = await fetchGroupMemories(groupId, 50, 0)
    setIsLoading(false)

    if (res.error) {
      setErrorMessage(res.error)
      return
    }

    if (res.data) {
      setMemories(res.data)
    }
  }, [groupId])

  useEffect(() => {
    if (isOpen && groupId) {
      loadMemories()
    } else {
      setMemories([])
      setErrorMessage('')
      setSearchQuery('')
    }
  }, [isOpen, groupId, loadMemories])

  // Filter memori berdasarkan kata kunci pencarian
  const filteredMemories = useMemo(() => {
    if (!searchQuery.trim()) return memories
    const q = searchQuery.toLowerCase()
    return memories.filter(
      (m) =>
        m.forum_title.toLowerCase().includes(q) ||
        m.snapshot_summary.toLowerCase().includes(q) ||
        m.approved_by_name?.toLowerCase().includes(q)
    )
  }, [memories, searchQuery])

  if (!isOpen) return null

  const modalContent = (
    <div
      className="group-modal-backdrop z-modal"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="memory-list-title"
    >
      <div
        className="group-modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 540, maxHeight: '88vh', padding: 0 }}
      >
        {/* Header Modal */}
        <div className="group-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 12,
                background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.25), rgba(59, 130, 246, 0.25))',
                border: '1px solid rgba(168, 85, 247, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.25rem',
                flexShrink: 0,
                boxShadow: '0 2px 10px rgba(168, 85, 247, 0.2)',
              }}
            >
              🧠
            </div>
            <div style={{ minWidth: 0 }}>
              <h2
                id="memory-list-title"
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
                Arsip Memori Pengetahuan
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
                {groupName} · {memories.length} memori terpublikasi
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="group-modal-close-btn"
            aria-label="Tutup arsip memori"
          >
            ✕
          </button>
        </div>

        {/* Search Bar (hanya tampil jika memori > 2 atau sedang ada pencarian) */}
        {(memories.length > 2 || searchQuery) && (
          <div
            style={{
              padding: '10px 16px',
              borderBottom: '1px solid var(--border-subtle)',
              background: 'var(--bg-elevated)',
            }}
          >
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari ringkasan atau topik forum..."
              className="group-form-input"
              style={{ fontSize: '0.85rem', padding: '8px 12px' }}
            />
          </div>
        )}

        {/* Scrollable Body */}
        <div
          className="group-modal-body"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            padding: '16px 20px',
            paddingBottom: 'max(20px, env(safe-area-inset-bottom, 0px))',
          }}
        >
          {isLoading ? (
            <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
              <div className="spinner" style={{ margin: '0 auto 12px' }} />
              <p style={{ fontSize: '0.85rem', margin: 0 }}>Memuat arsip memori grup...</p>
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
                onClick={loadMemories}
                className="btn btn-secondary"
                style={{ fontSize: '0.75rem', padding: '4px 10px' }}
              >
                Coba lagi
              </button>
            </div>
          ) : filteredMemories.length === 0 ? (
            <div style={{ padding: '48px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: '10px' }}>🏛️</span>
              <p style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 6px' }}>
                {searchQuery ? 'Tidak ada memori yang cocok' : 'Belum Ada Memori Terpublikasi'}
              </p>
              <p
                style={{
                  fontSize: '0.8rem',
                  maxWidth: '320px',
                  margin: '0 auto',
                  lineHeight: 1.5,
                  color: 'var(--text-muted)',
                }}
              >
                {searchQuery
                  ? 'Coba gunakan kata kunci pencarian yang lain.'
                  : 'Ketika topik forum diskusi kedaluwarsa dan divalidasi oleh admin, ringkasan dan keputusannya akan muncul di sini.'}
              </p>
            </div>
          ) : (
            filteredMemories.map((mem) => (
              <div
                key={mem.id}
                onClick={() => onSelectMemory(mem.id)}
                style={{
                  padding: '14px 16px',
                  borderRadius: '14px',
                  backgroundColor: 'var(--bg-elevated)',
                  border: '1px solid var(--border-default)',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  transition: 'border-color var(--transition-fast) ease, transform var(--transition-fast) ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.45)'
                  e.currentTarget.style.transform = 'translateY(-1px)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-default)'
                  e.currentTarget.style.transform = 'none'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <h3
                      style={{
                        margin: 0,
                        fontSize: '0.92rem',
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <span>📌</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {mem.forum_title}
                      </span>
                    </h3>
                    <p style={{ margin: '4px 0 0', fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                      Divalidasi oleh {mem.approved_by_name || 'Admin'} ·{' '}
                      {new Date(mem.approved_at).toLocaleDateString('id-ID', { dateStyle: 'medium' })}
                    </p>
                  </div>
                  <ConfidenceBadge confidence={mem.snapshot_summary_conf} showLabel={false} />
                </div>

                <p
                  style={{
                    margin: 0,
                    fontSize: '0.82rem',
                    lineHeight: 1.5,
                    color: 'var(--text-secondary)',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {mem.snapshot_summary}
                </p>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingTop: '8px',
                    borderTop: '1px solid var(--border-subtle)',
                    fontSize: '0.75rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: '12px',
                        fontWeight: 500,
                        backgroundColor: 'rgba(59, 130, 246, 0.12)',
                        color: 'var(--accent-400)',
                      }}
                    >
                      🎯 {mem.decision_count} Keputusan
                    </span>
                    {mem.has_human_edits && (
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontWeight: 500,
                          backgroundColor: 'rgba(245, 158, 11, 0.12)',
                          color: 'var(--color-warning)',
                        }}
                      >
                        Telah Disunting
                      </span>
                    )}
                  </div>

                  <span
                    style={{
                      fontWeight: 600,
                      color: 'var(--accent-400)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    Baca Memori →
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )

  // Render ke #modal-portal-root via portal agar bebas dari
  // stacking context parent (.chat-app-container / .chat-main-pane)
  if (!portalTarget) return null
  return createPortal(modalContent, portalTarget)
}

export default GroupMemoryListModal
