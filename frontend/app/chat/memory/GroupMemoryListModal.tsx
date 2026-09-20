'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
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

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center p-0 sm:p-4 transition-opacity"
      style={{
        backgroundColor: 'rgba(9, 13, 22, 0.85)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <div
        className="w-full h-full sm:h-auto sm:max-h-[85vh] sm:max-w-xl flex flex-col rounded-none sm:rounded-2xl overflow-hidden shadow-2xl transition-all"
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
            <span className="text-xl">🧠</span>
            <div className="min-w-0">
              <h2 className="text-base font-bold truncate" style={{ color: 'var(--text-primary)' }}>
                Arsip Memori Pengetahuan
              </h2>
              <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                {groupName} · {memories.length} memori terpublikasi
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

        {/* Search Bar */}
        {memories.length > 3 && (
          <div className="p-3 border-b" style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-surface)' }}>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari keputusan atau topik forum..."
              className="w-full px-3 py-2 rounded-lg text-xs transition-colors focus:outline-none"
              style={{
                backgroundColor: 'var(--bg-base)',
                border: '1px solid var(--border-default)',
                color: 'var(--text-primary)',
              }}
            />
          </div>
        )}

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3">
          {isLoading ? (
            <div className="py-16 text-center space-y-3">
              <div
                className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin mx-auto"
                style={{ borderColor: 'var(--accent-500)', borderTopColor: 'transparent' }}
              />
              <p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                Memuat arsip memori grup...
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
                onClick={loadMemories}
                className="text-xs underline font-medium"
              >
                Coba lagi
              </button>
            </div>
          ) : filteredMemories.length === 0 ? (
            <div className="py-16 text-center space-y-2 text-slate-400">
              <span className="text-3xl block mb-2">🏛️</span>
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                {searchQuery ? 'Tidak ada memori yang cocok' : 'Belum Ada Memori Terpublikasi'}
              </p>
              <p className="text-xs max-w-xs mx-auto" style={{ color: 'var(--text-muted)' }}>
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
                className="p-4 rounded-xl transition-all cursor-pointer hover:border-slate-500/50 space-y-2.5"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-default)',
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold flex items-center gap-1.5" style={{ color: 'var(--text-primary)' }}>
                      <span>📌</span> {mem.forum_title}
                    </h3>
                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      Divalidasi oleh {mem.approved_by_name || 'Admin'} · {new Date(mem.approved_at).toLocaleDateString('id-ID', { dateStyle: 'medium' })}
                    </p>
                  </div>
                  <ConfidenceBadge confidence={mem.snapshot_summary_conf} showLabel={false} />
                </div>

                <p
                  className="text-xs line-clamp-2 leading-relaxed"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {mem.snapshot_summary}
                </p>

                <div className="flex items-center justify-between pt-1 text-[11px] border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                  <div className="flex items-center gap-2">
                    <span
                      className="px-2 py-0.5 rounded-full font-medium"
                      style={{ backgroundColor: 'rgba(59, 130, 246, 0.12)', color: 'var(--accent-400)' }}
                    >
                      🎯 {mem.decision_count} Keputusan
                    </span>
                    {mem.has_human_edits && (
                      <span
                        className="px-2 py-0.5 rounded-full font-medium"
                        style={{ backgroundColor: 'rgba(245, 158, 11, 0.12)', color: 'var(--color-warning)' }}
                      >
                        Telah Disunting
                      </span>
                    )}
                  </div>

                  <span className="font-semibold flex items-center gap-1" style={{ color: 'var(--accent-400)' }}>
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
}

export default GroupMemoryListModal
