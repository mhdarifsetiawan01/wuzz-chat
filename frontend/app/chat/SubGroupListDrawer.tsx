'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { SubGroupItem } from '@/lib/types'
import { apiRequest } from '@/lib/api'

interface SubGroupListDrawerProps {
  isOpen: boolean
  onClose: () => void
  parentGroupId: string
  parentGroupName: string
  onSelectSubGroup: (subGroupId: string, title: string) => void
  onOpenCreateModal: () => void
}

function formatRemainingTime(remainingSeconds: number): { text: string; isUrgent: boolean } {
  if (remainingSeconds <= 0) return { text: 'Kedaluwarsa', isUrgent: true }
  const days = Math.floor(remainingSeconds / 86400)
  if (days >= 1) {
    const hours = Math.floor((remainingSeconds % 86400) / 3600)
    return {
      text: hours > 0 ? `${days}h ${hours}j lagi` : `${days} hari lagi`,
      isUrgent: false,
    }
  }
  const hours = Math.floor(remainingSeconds / 3600)
  if (hours >= 1) {
    const minutes = Math.floor((remainingSeconds % 3600) / 60)
    return {
      text: `${hours}j ${minutes}m lagi`,
      isUrgent: true,
    }
  }
  const minutes = Math.floor(remainingSeconds / 60)
  return {
    text: `${Math.max(1, minutes)} mnt lagi`,
    isUrgent: true,
  }
}

export default function SubGroupListDrawer({
  isOpen,
  onClose,
  parentGroupId,
  parentGroupName,
  onSelectSubGroup,
  onOpenCreateModal,
}: SubGroupListDrawerProps) {
  const [subgroups, setSubgroups] = useState<SubGroupItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [joiningId, setJoiningId] = useState<string | null>(null)

  const fetchSubgroups = useCallback(async () => {
    if (!parentGroupId) return
    setIsLoading(true)
    setErrorMessage('')

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)

    try {
      const { data, error } = await apiRequest<{ success: boolean; subgroups: SubGroupItem[] }>(
        `/api/groups/${encodeURIComponent(parentGroupId)}/subgroups`,
        { signal: controller.signal }
      )
      clearTimeout(timeoutId)
      if (error) {
        throw new Error(error)
      }
      setSubgroups(data?.subgroups || [])
    } catch (err: unknown) {
      clearTimeout(timeoutId)
      const errObj = err as { name?: string; message?: string }
      if (errObj?.name === 'AbortError') {
        setErrorMessage('Gagal memuat subgrup (timeout 15s). Silakan muat ulang.')
      } else {
        setErrorMessage(errObj?.message || 'Gagal memuat daftar subgrup')
      }
    } finally {
      setIsLoading(false)
    }
  }, [parentGroupId])

  useEffect(() => {
    if (isOpen) {
      fetchSubgroups()
    }
  }, [isOpen, fetchSubgroups])

  // ESC key listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const handleOpenOrJoin = async (sub: SubGroupItem) => {
    if (sub.is_member) {
      onSelectSubGroup(sub.id, sub.title)
      onClose()
      return
    }

    // Jika belum menjadi member subgrup, panggil join endpoint terlebih dahulu
    setJoiningId(sub.id)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)

    try {
      const { error } = await apiRequest<{ success: boolean }>(
        `/api/groups/${encodeURIComponent(sub.id)}/join`,
        {
          method: 'POST',
          signal: controller.signal,
        }
      )
      clearTimeout(timeoutId)
      if (error) {
        throw new Error(error)
      }
      onSelectSubGroup(sub.id, sub.title)
      onClose()
    } catch (err: unknown) {
      clearTimeout(timeoutId)
      const errObj = err as { message?: string }
      alert(errObj?.message || 'Gagal bergabung ke subgrup')
    } finally {
      setJoiningId(null)
    }
  }

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <aside 
        className="group-info-drawer"
        onClick={(e) => e.stopPropagation()}
        style={{ width: '420px', maxWidth: '100vw' }}
        aria-label="Daftar Subgrup"
      >
        {/* Header Drawer */}
        <div className="drawer-header" style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.4rem' }}>💬</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>
                Topik & Subgrup Aktif
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                {parentGroupName}
              </p>
            </div>
          </div>
          <button 
            className="drawer-close-btn" 
            onClick={onClose}
            aria-label="Tutup panel"
          >
            ✕
          </button>
        </div>

        {/* Action Button: + Buat Subgrup */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              onClose()
              onOpenCreateModal()
            }}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '11px',
              borderRadius: '12px',
              fontWeight: 600,
              fontSize: '0.9rem',
              boxShadow: '0 4px 14px rgba(59, 130, 246, 0.35)',
            }}
          >
            <span>➕</span> Buat Topik Subgrup Baru
          </button>
        </div>

        {/* List Subgrup */}
        <div className="drawer-content" style={{ padding: '16px 20px', overflowY: 'auto' }}>
          {isLoading ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
              <div className="spinner" style={{ margin: '0 auto 12px' }} />
              <p style={{ fontSize: '0.85rem' }}>Memuat subgrup aktif...</p>
            </div>
          ) : errorMessage ? (
            <div style={{ padding: '30px 10px', textAlign: 'center' }}>
              <p style={{ color: '#f87171', fontSize: '0.85rem', marginBottom: '12px' }}>
                ⚠️ {errorMessage}
              </p>
              <button 
                className="btn btn-secondary" 
                onClick={fetchSubgroups}
                style={{ fontSize: '0.8rem', padding: '6px 14px', borderRadius: '8px' }}
              >
                Coba Lagi
              </button>
            </div>
          ) : subgroups.length === 0 ? (
            <div 
              style={{ 
                padding: '48px 20px', 
                textAlign: 'center', 
                color: 'var(--text-muted)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '12px'
              }}
            >
              <span style={{ fontSize: '2.5rem' }}>📭</span>
              <div>
                <h4 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                  Belum Ada Subgrup Aktif
                </h4>
                <p style={{ margin: '6px 0 0', fontSize: '0.8rem', lineHeight: '1.4' }}>
                  Buat subgrup bertopik dengan masa aktif 1 minggu atau 1 bulan untuk diskusi yang lebih terfokus.
                </p>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {subgroups.map((sub) => {
                const rem = formatRemainingTime(sub.remaining_seconds)
                const isJoining = joiningId === sub.id

                return (
                  <div
                    key={sub.id}
                    style={{
                      background: 'rgba(255, 255, 255, 0.04)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '14px',
                      padding: '14px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    {/* Header Kartu Subgrup */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '1rem' }}>💬</span>
                          <strong 
                            style={{ 
                              fontSize: '0.95rem', 
                              color: 'var(--text-primary)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              maxWidth: '190px',
                            }} 
                            title={sub.title}
                          >
                            {sub.title}
                          </strong>
                        </div>
                        {sub.description && (
                          <p 
                            style={{ 
                              margin: '4px 0 0', 
                              fontSize: '0.78rem', 
                              color: 'var(--text-muted)',
                              lineHeight: '1.3',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                            }}
                          >
                            {sub.description}
                          </p>
                        )}
                      </div>

                      {/* Badge Sisa Waktu */}
                      <span
                        style={{
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          padding: '3px 8px',
                          borderRadius: '20px',
                          whiteSpace: 'nowrap',
                          background: rem.isUrgent ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                          color: rem.isUrgent ? '#fbbf24' : '#34d399',
                          border: rem.isUrgent ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid rgba(16, 185, 129, 0.3)',
                        }}
                      >
                        ⏳ {rem.text}
                      </span>
                    </div>

                    {/* Meta Info & Tombol Aksi */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2px' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        👥 {sub.member_count} anggota
                      </span>

                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => handleOpenOrJoin(sub)}
                        disabled={isJoining}
                        style={{
                          fontSize: '0.8rem',
                          padding: '6px 14px',
                          borderRadius: '8px',
                          fontWeight: 600,
                          background: sub.is_member ? 'rgba(59, 130, 246, 0.2)' : undefined,
                          color: sub.is_member ? '#60a5fa' : undefined,
                          border: sub.is_member ? '1px solid rgba(59, 130, 246, 0.4)' : undefined,
                        }}
                      >
                        {isJoining ? (
                          <>
                            <span className="spinner-small" /> Bergabung...
                          </>
                        ) : sub.is_member ? (
                          'Buka Obrolan →'
                        ) : (
                          'Gabung & Buka'
                        )}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}
