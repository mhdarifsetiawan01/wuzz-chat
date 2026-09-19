'use client'

import React, { useState, useEffect } from 'react'
import { GroupDetails, GroupMember, User } from '@/lib/types'
import { apiRequest } from '@/lib/api'
import { UserAvatar } from './UserAvatar'
import { VerifiedBadge } from './VerifiedBadge'

interface GroupInfoDrawerProps {
  isOpen: boolean
  onClose: () => void
  groupId: string
  currentUserId: string
  onGroupUpdated?: (updated?: any) => void
  onLeaveGroup?: () => void
  onLeaveSuccess?: () => void
  onOpenAddMember?: () => void
  onOpenSubgroups?: () => void
}

export function GroupInfoDrawer({
  isOpen,
  onClose,
  groupId,
  currentUserId,
  onGroupUpdated,
  onLeaveGroup,
  onLeaveSuccess,
  onOpenAddMember,
  onOpenSubgroups,
}: GroupInfoDrawerProps) {
  const [group, setGroup] = useState<GroupDetails | null>(null)
  const [members, setMembers] = useState<GroupMember[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  // Edit Mode
  const [isEditing, setIsEditing] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  // Leave / Kick Confirmation
  const [confirmAction, setConfirmAction] = useState<{ type: 'leave' | 'kick'; targetUser?: GroupMember } | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  const loadGroupData = async () => {
    if (!groupId) return
    setIsLoading(true)
    setError('')

    const { data: groupData, error: groupErr } = await apiRequest<GroupDetails>(`/api/groups/${groupId}`)
    if (groupErr || !groupData) {
      setError(groupErr || 'Gagal memuat detail grup')
      setIsLoading(false)
      return
    }

    setGroup(groupData)
    setEditTitle(groupData.title)
    setEditDesc(groupData.description || '')

    const { data: membersData } = await apiRequest<GroupMember[]>(`/api/groups/${groupId}/members`)
    if (membersData && Array.isArray(membersData)) {
      setMembers(membersData)
    }

    setIsLoading(false)
  }

  useEffect(() => {
    if (isOpen && groupId) {
      loadGroupData()
      setIsEditing(false)
      setConfirmAction(null)
    }
  }, [isOpen, groupId])

  if (!isOpen) return null

  const isCreatorOrAdmin = group?.my_role === 'creator' || group?.my_role === 'admin'
  const isCreator = group?.my_role === 'creator'

  const handleSaveInfo = async () => {
    if (!editTitle.trim() || isSaving) return
    setIsSaving(true)

    const { error: err } = await apiRequest(`/api/groups/${groupId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        title: editTitle.trim(),
        description: editDesc.trim(),
      }),
    })

    setIsSaving(false)
    if (!err) {
      setIsEditing(false)
      loadGroupData()
      if (onGroupUpdated) onGroupUpdated()
    } else {
      alert(err)
    }
  }

  const handleUpdateRole = async (targetUserId: string, newRole: 'admin' | 'member') => {
    const { error: err } = await apiRequest(`/api/groups/${groupId}/members/${targetUserId}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role: newRole }),
    })

    if (!err) {
      loadGroupData()
      if (onGroupUpdated) onGroupUpdated()
    } else {
      alert(err)
    }
  }

  const handleExecuteAction = async () => {
    if (!confirmAction || actionLoading) return
    setActionLoading(true)

    if (confirmAction.type === 'leave') {
      const { error: err } = await apiRequest(`/api/groups/${groupId}/members/${currentUserId}`, {
        method: 'DELETE',
      })
      setActionLoading(false)
      if (!err) {
        setConfirmAction(null)
        onClose()
        if (onLeaveGroup) onLeaveGroup()
        if (onLeaveSuccess) onLeaveSuccess()
      } else {
        alert(err)
      }
    } else if (confirmAction.type === 'kick' && confirmAction.targetUser) {
      const { error: err } = await apiRequest(`/api/groups/${groupId}/members/${confirmAction.targetUser.user_id}`, {
        method: 'DELETE',
      })
      setActionLoading(false)
      if (!err) {
        setConfirmAction(null)
        loadGroupData()
        if (onGroupUpdated) onGroupUpdated()
      } else {
        alert(err)
      }
    }
  }

  return (
    <div className="group-modal-backdrop" onClick={onClose} style={{ zIndex: 1100 }}>
      <div 
        className="group-modal-card" 
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: 480,
          maxHeight: '90vh',
          padding: 0
        }}
      >
        {/* Header Drawer */}
        <div className="group-modal-header">
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)' }}>Info Grup</h3>
          <button className="group-modal-close-btn" onClick={onClose} aria-label="Tutup">✕</button>
        </div>

        {/* Content Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
              <div className="spinner" style={{ margin: '0 auto 12px' }} />
              Memuat data grup...
            </div>
          ) : error ? (
            <div className="alert-box error" style={{ padding: 12 }}>
              ⚠️ {error}
            </div>
          ) : group ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Profile Card Grup */}
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                background: 'rgba(255,255,255,0.03)',
                padding: '20px 16px',
                borderRadius: 16,
                border: '1px solid rgba(255,255,255,0.06)'
              }}>
                {/* Avatar Icon */}
                <div style={{
                  width: 72,
                  height: 72,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, var(--accent-500), var(--accent-secondary))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '2.4rem',
                  boxShadow: '0 8px 24px rgba(59,130,246,0.3)',
                  marginBottom: 12
                }}>
                  {group.avatar_url?.startsWith('emoji:') ? group.avatar_url.replace('emoji:', '') : '👥'}
                </div>

                {isEditing ? (
                  <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <input
                      type="text"
                      className="group-form-input"
                      value={editTitle}
                      onChange={e => setEditTitle(e.target.value)}
                      placeholder="Nama grup"
                      style={{ textAlign: 'center', fontWeight: 600 }}
                    />
                    <textarea
                      className="group-form-textarea"
                      value={editDesc}
                      onChange={e => setEditDesc(e.target.value)}
                      placeholder="Deskripsi grup"
                      rows={2}
                      style={{ fontSize: '0.85rem' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 4 }}>
                      <button type="button" className="btn btn-secondary" onClick={() => setIsEditing(false)} style={{ padding: '6px 14px', fontSize: '0.85rem' }}>
                        Batal
                      </button>
                      <button type="button" className="btn btn-primary" onClick={handleSaveInfo} disabled={isSaving} style={{ width: 'auto', padding: '6px 14px', fontSize: '0.85rem' }}>
                        {isSaving ? 'Menyimpan...' : 'Simpan'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <h2 style={{ margin: '0 0 4px', fontSize: '1.25rem', fontWeight: 700 }}>
                      {group.title}
                    </h2>
                    {group.group_username && (
                      <div style={{ color: 'var(--accent-secondary)', fontSize: '0.85rem', fontWeight: 500, marginBottom: 8 }}>
                        @{group.group_username}
                      </div>
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                      <span style={{
                        fontSize: '0.75rem',
                        padding: '3px 10px',
                        borderRadius: 20,
                        background: group.is_public ? 'rgba(129,140,248,0.2)' : 'rgba(59,130,246,0.2)',
                        color: group.is_public ? 'var(--accent-secondary-soft)' : 'var(--accent-300)',
                        border: '1px solid rgba(255,255,255,0.1)'
                      }}>
                        {group.is_public ? '🌐 Grup Publik' : '🔒 Grup Privat'}
                      </span>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        • {members.length || group.member_count} Anggota
                      </span>
                    </div>

                    {group.description && (
                      <p style={{ margin: '12px 0 0', fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.4, maxWidth: 360 }}>
                        {group.description}
                      </p>
                    )}

                    {isCreatorOrAdmin && (
                      <button
                        type="button"
                        onClick={() => setIsEditing(true)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--accent-500)',
                          fontSize: '0.8rem',
                          cursor: 'pointer',
                          marginTop: 10,
                          textDecoration: 'underline'
                        }}
                      >
                        ✏️ Edit Info Grup
                      </button>
                    )}
                  </>
                )}
              </div>

              {/* Action Buttons Bar */}
              {isCreatorOrAdmin && onOpenAddMember && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={onOpenAddMember}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    padding: '10px 16px',
                    borderRadius: 12,
                    fontSize: '0.9rem'
                  }}
                >
                  <span>➕ Tambah Anggota Baru</span>
                </button>
              )}

              {/* Tombol Akses Topik Subgrup jika grup utama */}
              {!group.parent_id && onOpenSubgroups && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    onClose()
                    onOpenSubgroups()
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    padding: '10px 16px',
                    borderRadius: 12,
                    fontSize: '0.9rem',
                    fontWeight: 600,
                    background: 'rgba(59, 130, 246, 0.1)',
                    color: 'var(--accent-400)',
                    border: '1px solid rgba(59, 130, 246, 0.25)',
                    cursor: 'pointer',
                  }}
                >
                  <span>🏛️</span> Buka Forum & Topik Diskusi
                </button>
              )}

              {/* Members Section */}
              <div>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 10
                }}>
                  <h4 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Daftar Anggota ({members.length})
                  </h4>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {members.map(member => {
                    const isSelf = member.user_id === currentUserId
                    const canManageThisUser = isCreatorOrAdmin && !isSelf && member.role !== 'creator' && !(group.my_role === 'admin' && member.role === 'admin')

                    return (
                      <div
                        key={member.user_id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px 12px',
                          background: 'rgba(255,255,255,0.03)',
                          borderRadius: 12,
                          border: '1px solid rgba(255,255,255,0.05)'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <UserAvatar
                            name={member.display_name || member.username}
                            avatarUrl={member.avatar_url}
                            size={38}
                          />
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span>{member.display_name}</span>
                              {isSelf && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>(Anda)</span>}
                              {member.is_verified && <VerifiedBadge size={14} />}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              @{member.username}
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {/* Role Badge */}
                          <span style={{
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            padding: '3px 8px',
                            borderRadius: 12,
                            textTransform: 'uppercase',
                            background: member.role === 'creator' 
                              ? 'rgba(244,114,182,0.2)' 
                              : member.role === 'admin' 
                              ? 'rgba(59,130,246,0.2)' 
                              : 'rgba(255,255,255,0.08)',
                            color: member.role === 'creator' 
                              ? 'var(--accent-tertiary)' 
                              : member.role === 'admin' 
                              ? 'var(--accent-400)' 
                              : 'var(--text-muted)',
                            border: '1px solid rgba(255,255,255,0.08)'
                          }}>
                            {member.role === 'creator' ? 'Pembuat' : member.role === 'admin' ? 'Admin' : 'Anggota'}
                          </span>

                          {/* Member Actions */}
                          {canManageThisUser && (
                            <div style={{ display: 'flex', gap: 4 }}>
                              {isCreator && (
                                member.role === 'admin' ? (
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateRole(member.user_id, 'member')}
                                    title="Turunkan jadi Anggota"
                                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.85rem', padding: '4px' }}
                                  >
                                    ⬇️
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateRole(member.user_id, 'admin')}
                                    title="Jadikan Admin"
                                    style={{ background: 'none', border: 'none', color: 'var(--accent-500)', cursor: 'pointer', fontSize: '0.85rem', padding: '4px' }}
                                  >
                                    ⬆️
                                  </button>
                                )
                              )}
                              <button
                                type="button"
                                onClick={() => setConfirmAction({ type: 'kick', targetUser: member })}
                                title="Keluarkan dari Grup"
                                style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.9rem', padding: '4px' }}
                              >
                                ✕
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Leave Group Button */}
              <div style={{ marginTop: 10 }}>
                <button
                  type="button"
                  onClick={() => setConfirmAction({ type: 'leave' })}
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: 12,
                    background: 'rgba(239, 68, 68, 0.12)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    color: 'var(--color-error)',
                    fontWeight: 600,
                    fontSize: '0.9rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    transition: 'all 0.15s ease'
                  }}
                >
                  🚪 Keluar dari Grup
                </button>
              </div>
            </div>
          ) : null}
        </div>

        {/* Confirmation Modal Overlay */}
        {confirmAction && (
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
            zIndex: 120,
            borderRadius: 16
          }}>
            <div style={{
              background: '#1e293b',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 16,
              padding: 20,
              maxWidth: 360,
              textAlign: 'center'
            }}>
              <h3 style={{ margin: '0 0 8px', fontSize: '1.1rem' }}>
                {confirmAction.type === 'leave' ? 'Keluar dari Grup?' : `Keluarkan ${confirmAction.targetUser?.display_name}?`}
              </h3>
              <p style={{ margin: '0 0 16px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                {confirmAction.type === 'leave' 
                  ? 'Anda tidak akan menerima pesan baru dari grup ini lagi.' 
                  : 'Pengguna ini akan dikeluarkan dari obrolan grup.'}
              </p>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 10 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setConfirmAction(null)}
                  disabled={actionLoading}
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleExecuteAction}
                  disabled={actionLoading}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 8,
                    background: '#ef4444',
                    color: '#fff',
                    border: 'none',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  {actionLoading ? 'Memproses...' : 'Ya, Lanjutkan'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default GroupInfoDrawer
