'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { SubGroupItem, JoinRequestItem } from '@/lib/types'
import { apiRequest } from '@/lib/api'

interface SubGroupListDrawerProps {
  isOpen: boolean
  onClose: () => void
  parentGroupId: string
  parentGroupName: string
  onSelectSubGroup: (subGroupId: string, title: string) => void
  onOpenCreateModal: () => void
  currentUserId?: string
  currentUserRole?: string
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
  currentUserId,
  currentUserRole,
}: SubGroupListDrawerProps) {
  const canCreateTopic = currentUserRole === 'creator' || currentUserRole === 'admin'
  const [subgroups, setSubgroups] = useState<SubGroupItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [joiningId, setJoiningId] = useState<string | null>(null)
  const [requestingId, setRequestingId] = useState<string | null>(null)

  // Sub-state untuk panel peninjauan izin bergabung (Admin/Creator)
  const [reviewSubGroup, setReviewSubGroup] = useState<SubGroupItem | null>(null)
  const [joinRequests, setJoinRequests] = useState<JoinRequestItem[]>([])
  const [isLoadingRequests, setIsLoadingRequests] = useState(false)
  const [actionReqId, setActionReqId] = useState<string | null>(null)
  const [successToast, setSuccessToast] = useState<string>('')

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
        setErrorMessage('Gagal memuat topik forum (timeout 15s). Silakan muat ulang.')
      } else {
        setErrorMessage(errObj?.message || 'Gagal memuat daftar forum')
      }
    } finally {
      setIsLoading(false)
    }
  }, [parentGroupId])

  useEffect(() => {
    if (isOpen) {
      setReviewSubGroup(null)
      fetchSubgroups()
    }
  }, [isOpen, fetchSubgroups])

  // ESC key listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        if (reviewSubGroup) {
          setReviewSubGroup(null)
        } else {
          onClose()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, reviewSubGroup, onClose])

  if (!isOpen) return null

  const handleOpenOrJoin = async (sub: SubGroupItem) => {
    if (sub.is_member) {
      onSelectSubGroup(sub.id, sub.title)
      onClose()
      return
    }

    // Jika subgrup privat dan bukan member, jangan langsung panggil /join
    if (sub.is_public === false) {
      return
    }

    // Jika publik dan belum member, panggil join endpoint
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
      alert(errObj?.message || 'Gagal bergabung ke topik forum')
    } finally {
      setJoiningId(null)
    }
  }

  const handleRequestJoin = async (sub: SubGroupItem) => {
    setRequestingId(sub.id)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)

    try {
      const { error } = await apiRequest<{ success: boolean; message: string }>(
        `/api/groups/${encodeURIComponent(sub.id)}/join-request`,
        {
          method: 'POST',
          signal: controller.signal,
        }
      )
      clearTimeout(timeoutId)
      if (error) {
        throw new Error(error)
      }
      setSubgroups((prev) =>
        prev.map((s) => (s.id === sub.id ? { ...s, has_pending_request: true } : s))
      )
      setSuccessToast('Permohonan izin bergabung terkirim ke admin forum.')
      setTimeout(() => setSuccessToast(''), 4000)
    } catch (err: unknown) {
      clearTimeout(timeoutId)
      const errObj = err as { message?: string }
      alert(errObj?.message || 'Gagal mengajukan izin bergabung')
    } finally {
      setRequestingId(null)
    }
  }

  const openReviewPanel = async (sub: SubGroupItem) => {
    setReviewSubGroup(sub)
    setIsLoadingRequests(true)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)

    try {
      const { data, error } = await apiRequest<{ success: boolean; requests: JoinRequestItem[] }>(
        `/api/groups/${encodeURIComponent(sub.id)}/join-requests`,
        { signal: controller.signal }
      )
      clearTimeout(timeoutId)
      if (error) {
        throw new Error(error)
      }
      setJoinRequests(data?.requests || [])
    } catch (err: unknown) {
      clearTimeout(timeoutId)
      const errObj = err as { message?: string }
      alert(errObj?.message || 'Gagal memuat daftar permohonan izin')
    } finally {
      setIsLoadingRequests(false)
    }
  }

  const handleRespondRequest = async (requestId: string, approve: boolean) => {
    if (!reviewSubGroup) return
    setActionReqId(requestId)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)

    try {
      const { error } = await apiRequest<{ success: boolean; message: string }>(
        `/api/groups/${encodeURIComponent(reviewSubGroup.id)}/join-requests/${encodeURIComponent(requestId)}/action`,
        {
          method: 'POST',
          body: JSON.stringify({ approve }),
          signal: controller.signal,
        }
      )
      clearTimeout(timeoutId)
      if (error) {
        throw new Error(error)
      }
      setJoinRequests((prev) => prev.filter((r) => r.id !== requestId))
      if (approve) {
        setSubgroups((prev) =>
          prev.map((s) => (s.id === reviewSubGroup.id ? { ...s, member_count: s.member_count + 1 } : s))
        )
      }
      setSuccessToast(approve ? 'Permohonan disetujui!' : 'Permohonan ditolak.')
      setTimeout(() => setSuccessToast(''), 3000)
    } catch (err: unknown) {
      clearTimeout(timeoutId)
      const errObj = err as { message?: string }
      alert(errObj?.message || 'Gagal memproses permohonan')
    } finally {
      setActionReqId(null)
    }
  }

  return (
    <div className="group-modal-backdrop" onClick={onClose} style={{ zIndex: 1100 }}>
      <div 
        className="group-modal-card" 
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 480, maxHeight: '88vh', padding: 0 }}
        aria-label="Forum Grup"
      >
        {/* Toast Notifikasi */}
        {successToast && (
          <div
            style={{
              position: 'absolute',
              top: 14,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 1200,
              background: 'rgba(16, 185, 129, 0.95)',
              color: '#ffffff',
              padding: '8px 16px',
              borderRadius: '20px',
              fontSize: '0.8rem',
              fontWeight: 600,
              boxShadow: '0 4px 14px rgba(0, 0, 0, 0.3)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>✅</span> {successToast}
          </div>
        )}

        {/* JIKA SEDANG DALAM MODE REVIEW JOIN REQUESTS */}
        {reviewSubGroup ? (
          <>
            <div className="group-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setReviewSubGroup(null)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-primary)',
                    fontSize: '1.2rem',
                    cursor: 'pointer',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                  title="Kembali ke forum"
                >
                  ←
                </button>
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Permohonan Izin Masuk
                  </h2>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    Topik Forum: <strong style={{ color: 'var(--text-primary)' }}>{reviewSubGroup.title}</strong>
                  </span>
                </div>
              </div>
              <button 
                className="group-modal-close-btn" 
                onClick={onClose}
                aria-label="Tutup panel"
              >
                ✕
              </button>
            </div>

            <div className="group-modal-body" style={{ padding: '16px 20px' }}>
              {isLoadingRequests ? (
                <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <div className="spinner" style={{ margin: '0 auto 12px' }} />
                  <p style={{ fontSize: '0.85rem' }}>Memuat daftar permohonan...</p>
                </div>
              ) : joinRequests.length === 0 ? (
                <div style={{ padding: '40px 10px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <span style={{ fontSize: '2rem', display: 'block', marginBottom: '8px' }}>🎉</span>
                  <p style={{ margin: 0, fontSize: '0.85rem' }}>Tidak ada permohonan yang menunggu persetujuan.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {joinRequests.map((req) => {
                    const isProcessing = actionReqId === req.id
                    return (
                      <div
                        key={req.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '12px',
                          borderRadius: '12px',
                          background: 'rgba(255, 255, 255, 0.04)',
                          border: '1px solid rgba(255, 255, 255, 0.08)',
                          gap: '10px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                          <div
                            style={{
                              width: 38,
                              height: 38,
                              borderRadius: '50%',
                              background: 'var(--bg-surface-elevated, #2a2a38)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 600,
                              fontSize: '0.9rem',
                              flexShrink: 0,
                              color: 'var(--text-primary)',
                            }}
                          >
                            {req.display_name?.charAt(0).toUpperCase() || req.username?.charAt(0).toUpperCase() || '?'}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <strong 
                              style={{ 
                                display: 'block', 
                                fontSize: '0.88rem', 
                                color: 'var(--text-primary)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {req.display_name || req.username}
                            </strong>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              @{req.username}
                            </span>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                          <button
                            type="button"
                            onClick={() => handleRespondRequest(req.id, false)}
                            disabled={isProcessing}
                            style={{
                              padding: '6px 10px',
                              borderRadius: '8px',
                              border: '1px solid rgba(239, 68, 68, 0.3)',
                              background: 'rgba(239, 68, 68, 0.1)',
                              color: 'var(--color-error)',
                              fontSize: '0.78rem',
                              fontWeight: 600,
                              cursor: isProcessing ? 'not-allowed' : 'pointer',
                            }}
                          >
                            Tolak
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRespondRequest(req.id, true)}
                            disabled={isProcessing}
                            style={{
                              padding: '6px 12px',
                              borderRadius: '8px',
                              border: 'none',
                              background: '#10b981',
                              color: '#ffffff',
                              fontSize: '0.78rem',
                              fontWeight: 600,
                              cursor: isProcessing ? 'not-allowed' : 'pointer',
                            }}
                          >
                            {isProcessing ? '...' : 'Setujui'}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        ) : (
          /* TAMPILAN UTAMA LIST SUBGRUP */
          <>
            {/* Header Modal */}
            <div className="group-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 38,
                  height: 38,
                  borderRadius: 12,
                  background: 'linear-gradient(135deg, rgba(59,130,246,0.25), rgba(129,140,248,0.25))',
                  border: '1px solid rgba(59,130,246,0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.25rem',
                  boxShadow: '0 2px 10px rgba(59,130,246,0.2)'
                }}>
                  🏛️
                </div>
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Forum & Topik Diskusi
                  </h2>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Ruang diskusi di dalam <strong style={{ color: 'var(--text-primary)' }}>{parentGroupName}</strong>
                  </span>
                </div>
              </div>
              <button 
                className="group-modal-close-btn" 
                onClick={onClose} 
                aria-label="Tutup panel"
              >
                ✕
              </button>
            </div>

            {/* Action Button: + Buat Forum (Khusus Admin & Pembuat Grup) */}
            {canCreateTopic && (
              <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>
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
                  <span>➕</span> Buat Topik Forum Baru
                </button>
              </div>
            )}

            {/* List Forum */}
            <div className="group-modal-body" style={{ padding: '16px 20px' }}>
              {isLoading ? (
                <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <div className="spinner" style={{ margin: '0 auto 12px' }} />
                  <p style={{ fontSize: '0.85rem' }}>Memuat topik forum aktif...</p>
                </div>
              ) : errorMessage ? (
                <div style={{ padding: '30px 10px', textAlign: 'center' }}>
                  <p style={{ color: 'var(--color-error)', fontSize: '0.85rem', marginBottom: '12px' }}>
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
                <span style={{ fontSize: '2.5rem' }}>🏛️</span>
                <div>
                  <h4 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                    Belum Ada Topik Forum Aktif
                  </h4>
                  <p style={{ margin: '6px 0 0', fontSize: '0.8rem', lineHeight: '1.4' }}>
                    {canCreateTopic
                      ? 'Buat topik forum dengan masa aktif 1 minggu atau 1 bulan untuk diskusi yang lebih terfokus.'
                      : 'Belum ada ruang diskusi aktif. Hanya admin atau pembuat grup yang dapat membuat topik forum baru.'}
                  </p>
                </div>
              </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {subgroups.map((sub) => {
                    const rem = formatRemainingTime(sub.remaining_seconds)
                    const isJoining = joiningId === sub.id
                    const isRequesting = requestingId === sub.id
                    const isPublic = sub.is_public !== false
                    const canAdmin = currentUserRole === 'creator' || currentUserRole === 'admin' || (currentUserId && sub.created_by === currentUserId)

                    return (
                      <div
                        key={sub.id}
                        style={{
                          background: 'var(--bg-elevated, rgba(255, 255, 255, 0.04))',
                          border: '1px solid var(--border-default, rgba(255, 255, 255, 0.08))',
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
                                  maxWidth: '180px',
                                }} 
                                title={sub.title}
                              >
                                {sub.title}
                              </strong>

                              {/* Badge Hak Akses: 🌐 Terbuka vs 🔒 Privat */}
                              <span
                                style={{
                                  fontSize: '0.68rem',
                                  fontWeight: 600,
                                  padding: '2px 7px',
                                  borderRadius: '6px',
                                  background: isPublic ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.12)',
                                  color: isPublic ? 'var(--color-online)' : 'var(--color-warning)',
                                  border: isPublic ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid rgba(245, 158, 11, 0.25)',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '3px',
                                }}
                              >
                                {isPublic ? '🌐 Terbuka' : '🔒 Privat'}
                              </span>
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
                              color: rem.isUrgent ? 'var(--color-warning)' : 'var(--color-online)',
                              border: rem.isUrgent ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid rgba(16, 185, 129, 0.3)',
                            }}
                          >
                            ⏳ {rem.text}
                          </span>
                        </div>

                        {/* Meta Info & Tombol Aksi */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2px', flexWrap: 'wrap', gap: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              👥 {sub.member_count} anggota
                            </span>

                            {/* Tombol Kelola Izin untuk Admin/Creator (khusus subgrup privat) */}
                            {!isPublic && canAdmin && (
                              <button
                                type="button"
                                onClick={() => openReviewPanel(sub)}
                                style={{
                                  background: 'rgba(245, 158, 11, 0.1)',
                                  border: '1px solid rgba(245, 158, 11, 0.3)',
                                  color: 'var(--color-warning)',
                                  borderRadius: '6px',
                                  padding: '2px 8px',
                                  fontSize: '0.72rem',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                }}
                              >
                                📋 Kelola Izin
                              </button>
                            )}
                          </div>

                          {/* Tombol Status / Aksi Join */}
                          {sub.is_member ? (
                            <button
                              type="button"
                              className="btn btn-primary"
                              onClick={() => handleOpenOrJoin(sub)}
                              style={{
                                fontSize: '0.8rem',
                                padding: '6px 14px',
                                borderRadius: '8px',
                                fontWeight: 600,
                                background: 'rgba(59, 130, 246, 0.2)',
                                color: 'var(--accent-400)',
                                border: '1px solid rgba(59, 130, 246, 0.4)',
                              }}
                            >
                              Buka Obrolan →
                            </button>
                          ) : isPublic ? (
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
                              }}
                            >
                              {isJoining ? (
                                <>
                                  <span className="spinner-small" /> Bergabung...
                                </>
                              ) : (
                                'Gabung & Buka'
                              )}
                            </button>
                          ) : sub.has_pending_request ? (
                            <button
                              type="button"
                              disabled
                              style={{
                                fontSize: '0.78rem',
                                padding: '6px 12px',
                                borderRadius: '8px',
                                fontWeight: 600,
                                background: 'rgba(245, 158, 11, 0.1)',
                                color: 'var(--color-warning)',
                                border: '1px solid rgba(245, 158, 11, 0.3)',
                                cursor: 'not-allowed',
                              }}
                            >
                              ⏳ Menunggu Izin
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleRequestJoin(sub)}
                              disabled={isRequesting}
                              style={{
                                fontSize: '0.78rem',
                                padding: '6px 14px',
                                borderRadius: '8px',
                                fontWeight: 600,
                                background: 'rgba(245, 158, 11, 0.18)',
                                color: 'var(--color-warning)',
                                border: '1px solid rgba(245, 158, 11, 0.4)',
                                cursor: isRequesting ? 'not-allowed' : 'pointer',
                              }}
                            >
                              {isRequesting ? (
                                <>
                                  <span className="spinner-small" /> Mengajukan...
                                </>
                              ) : (
                                '🔒 Minta Izin Gabung'
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

