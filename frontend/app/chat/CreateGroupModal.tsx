'use client'

import React, { useState, useEffect, useRef } from 'react'
import { User, GroupDetails } from '@/lib/types'
import { apiRequest } from '@/lib/api'
import { UserAvatar } from './UserAvatar'
import { VerifiedBadge } from './VerifiedBadge'

interface CreateGroupModalProps {
  isOpen: boolean
  onClose: () => void
  onGroupCreated: (newGroup: GroupDetails) => void
  recentContacts: User[]
}

const PRESET_EMOJI_AVATARS = ['👥', '🚀', '💼', '💻', '🎨', '🔥', '⚡', '☕', '🎮', '⚽', '📚', '🌟']

export default function CreateGroupModal({
  isOpen,
  onClose,
  onGroupCreated,
  recentContacts,
}: CreateGroupModalProps) {
  const [step, setStep] = useState<1 | 2>(1)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [avatarEmoji, setAvatarEmoji] = useState('👥')
  const [isPublic, setIsPublic] = useState(false)
  const [groupUsername, setGroupUsername] = useState('')
  
  // Selection
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set())
  const [selectedUsersMap, setSelectedUsersMap] = useState<Map<string, User>>(new Map())

  // Search
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<User[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Loading & Error
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    if (isOpen) {
      setStep(1)
      setTitle('')
      setDescription('')
      setAvatarEmoji('👥')
      setIsPublic(false)
      setGroupUsername('')
      setSelectedUserIds(new Set())
      setSelectedUsersMap(new Map())
      setSearchQuery('')
      setSearchResults([])
      setErrorMessage('')
      setIsLoading(false)
    }
  }, [isOpen])

  // Live search users
  useEffect(() => {
    const trimmed = searchQuery.trim()
    if (!trimmed) {
      setSearchResults([])
      setIsSearching(false)
      return
    }

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    setIsSearching(true)
    searchTimeoutRef.current = setTimeout(async () => {
      const { data, error } = await apiRequest<User[]>(`/api/users/search?q=${encodeURIComponent(trimmed)}`)
      setIsSearching(false)
      if (data && Array.isArray(data)) {
        setSearchResults(data)
      } else {
        setSearchResults([])
      }
    }, 300)

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [searchQuery])

  if (!isOpen) return null

  const toggleSelectUser = (user: User) => {
    setSelectedUserIds(prev => {
      const next = new Set(prev)
      if (next.has(user.id)) {
        next.delete(user.id)
        setSelectedUsersMap(map => {
          const newMap = new Map(map)
          newMap.delete(user.id)
          return newMap
        })
      } else {
        next.add(user.id)
        setSelectedUsersMap(map => {
          const newMap = new Map(map)
          newMap.set(user.id, user)
          return newMap
        })
      }
      return next
    })
  }

  const handleNextStep = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) {
      setErrorMessage('Nama grup wajib diisi')
      return
    }
    if (isPublic && groupUsername.trim()) {
      const clean = groupUsername.trim().replace(/^@/, '')
      if (!/^[a-zA-Z0-9_]{3,32}$/.test(clean)) {
        setErrorMessage('Username grup harus 3-32 karakter alfanumerik / underscore')
        return
      }
    }
    setErrorMessage('')
    setStep(2)
  }

  const handleCreateGroup = async () => {
    if (isLoading) return
    setIsLoading(true)
    setErrorMessage('')

    const cleanUsername = isPublic ? groupUsername.trim().replace(/^@/, '') : ''
    const avatarUrl = `emoji:${avatarEmoji}`

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)

    try {
      const { data, error } = await apiRequest<{ success: boolean; group: GroupDetails }>('/api/groups', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          avatar_url: avatarUrl,
          is_public: isPublic,
          group_username: cleanUsername,
          member_ids: Array.from(selectedUserIds),
        }),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)
      setIsLoading(false)

      if (data?.success && data.group) {
        onGroupCreated(data.group)
        onClose()
      } else {
        setErrorMessage(error || 'Gagal membuat grup')
      }
    } catch (err: any) {
      clearTimeout(timeoutId)
      setIsLoading(false)
      if (err.name === 'AbortError') {
        setErrorMessage('Koneksi server lambat (timeout 15 detik). Silakan periksa koneksi Anda.')
      } else {
        setErrorMessage('Terjadi kesalahan jaringan saat membuat grup.')
      }
    }
  }

  return (
    <div className="group-modal-backdrop" onClick={onClose}>
      <div 
        className="group-modal-card" 
        onClick={e => e.stopPropagation()}
      >
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
              👥
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                {step === 1 ? 'Buat Grup Baru' : 'Pilih Anggota Grup'}
              </h2>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {step === 1 ? 'Langkah 1 dari 2: Info Grup' : `Langkah 2 dari 2: ${selectedUserIds.size} Anggota Dipilih`}
              </span>
            </div>
          </div>
          <button className="group-modal-close-btn" onClick={onClose} aria-label="Tutup">✕</button>
        </div>

        {errorMessage && (
          <div className="alert-box error" style={{ margin: '12px 20px 0', padding: '8px 12px', fontSize: '0.85rem' }}>
            ⚠️ {errorMessage}
          </div>
        )}

        {step === 1 ? (
          <form onSubmit={handleNextStep} style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '18px 20px' }}>
            {/* Ikon Grup Picker */}
            <div>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'block', marginBottom: 8, fontWeight: 500 }}>
                Ikon Grup
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                <div style={{
                  width: 54,
                  height: 54,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #3b82f6, #818cf8)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.8rem',
                  boxShadow: '0 4px 14px rgba(59,130,246,0.35)',
                  border: '2px solid rgba(255,255,255,0.15)',
                  flexShrink: 0
                }}>
                  {avatarEmoji}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1 }}>
                  {PRESET_EMOJI_AVATARS.map(emoji => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => setAvatarEmoji(emoji)}
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 10,
                        border: avatarEmoji === emoji ? '2px solid var(--accent-400)' : '1px solid rgba(255,255,255,0.08)',
                        background: avatarEmoji === emoji ? 'rgba(59,130,246,0.25)' : 'rgba(255,255,255,0.04)',
                        fontSize: '1.15rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Nama Grup */}
            <div>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'block', marginBottom: 6, fontWeight: 500 }}>
                Nama Grup <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="text"
                className="group-form-input"
                placeholder="Contoh: Tim Bisnis & Marketing"
                value={title}
                onChange={e => setTitle(e.target.value)}
                maxLength={128}
                autoFocus
                required
              />
            </div>

            {/* Deskripsi Grup */}
            <div>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'block', marginBottom: 6, fontWeight: 500 }}>
                Deskripsi Grup (Opsional)
              </label>
              <textarea
                className="group-form-textarea"
                placeholder="Tuliskan tujuan atau aturan obrolan grup ini..."
                value={description}
                onChange={e => setDescription(e.target.value)}
                maxLength={500}
                rows={2}
              />
            </div>

            {/* Visibilitas: Privat vs Publik */}
            <div>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'block', marginBottom: 8, fontWeight: 500 }}>
                Tipe Visibilitas Grup
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setIsPublic(false)}
                  style={{
                    padding: '12px 14px',
                    borderRadius: 12,
                    border: !isPublic ? '2px solid #3b82f6' : '1px solid rgba(255,255,255,0.08)',
                    background: !isPublic ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.03)',
                    color: !isPublic ? '#fff' : 'var(--text-muted)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                    🔒 Privat
                  </div>
                  <div style={{ fontSize: '0.75rem', opacity: 0.8, marginTop: 4 }}>
                    Hanya yang diundang yang bisa masuk
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setIsPublic(true)}
                  style={{
                    padding: '12px 14px',
                    borderRadius: 12,
                    border: isPublic ? '2px solid #818cf8' : '1px solid rgba(255,255,255,0.08)',
                    background: isPublic ? 'rgba(129,140,248,0.15)' : 'rgba(255,255,255,0.03)',
                    color: isPublic ? '#fff' : 'var(--text-muted)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                    🌐 Publik
                  </div>
                  <div style={{ fontSize: '0.75rem', opacity: 0.8, marginTop: 4 }}>
                    Bisa dicari & dimasuki siapa saja
                  </div>
                </button>
              </div>
            </div>

            {/* Username Grup (jika Publik) */}
            {isPublic && (
              <div style={{ animation: 'fadeIn 0.2s ease' }}>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'block', marginBottom: 6, fontWeight: 500 }}>
                  Username Publik Grup (Opsional)
                </label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 14, top: 11, color: 'var(--text-muted)' }}>@</span>
                  <input
                    type="text"
                    className="group-form-input"
                    placeholder="nama_grup_unik"
                    value={groupUsername}
                    onChange={e => setGroupUsername(e.target.value)}
                    style={{ paddingLeft: 32 }}
                  />
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
                  Memudahkan orang lain menemukan grup Anda di kolom pencarian.
                </span>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10, paddingTop: 14, borderTop: '1px solid var(--border-subtle)' }}>
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                Batal
              </button>
              <button type="submit" className="btn btn-primary" style={{ width: 'auto', padding: '10px 20px' }}>
                Lanjut: Pilih Anggota →
              </button>
            </div>
          </form>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '16px 20px' }}>
            {/* Selected Chips */}
            {selectedUserIds.size > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', maxHeight: 80, overflowY: 'auto', padding: '4px 0' }}>
                {Array.from(selectedUsersMap.values()).map(u => (
                  <div
                    key={u.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      background: 'rgba(59,130,246,0.2)',
                      border: '1px solid rgba(59,130,246,0.4)',
                      borderRadius: 20,
                      padding: '4px 10px 4px 6px',
                      fontSize: '0.8rem'
                    }}
                  >
                    <UserAvatar name={u.display_name || u.username} avatarUrl={u.avatar_url} size={20} />
                    <span>{u.display_name || u.username}</span>
                    <button
                      type="button"
                      onClick={() => toggleSelectUser(u)}
                      style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 0, fontSize: '0.9rem', marginLeft: 2 }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Search Input */}
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 12, top: 10, color: 'var(--text-muted)' }}>🔍</span>
              <input
                type="text"
                className="group-form-input"
                placeholder="Cari username atau nama pengguna..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ paddingLeft: 36, fontSize: '0.9rem' }}
              />
              {isSearching && (
                <div className="spinner" style={{ width: 16, height: 16, position: 'absolute', right: 12, top: 12 }} />
              )}
            </div>

            {/* Contact List */}
            <div style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, paddingRight: 4 }}>
              {searchQuery.trim() ? (
                // Hasil Pencarian
                searchResults.length > 0 ? (
                  searchResults.map(user => {
                    const isSelected = selectedUserIds.has(user.id)
                    return (
                      <div
                        key={user.id}
                        onClick={() => toggleSelectUser(user)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px 12px',
                          borderRadius: 10,
                          background: isSelected ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.03)',
                          border: isSelected ? '1px solid rgba(59,130,246,0.4)' : '1px solid transparent',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <UserAvatar name={user.display_name || user.username} avatarUrl={user.avatar_url} size={36} />
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                              {user.display_name}
                              {user.is_verified && <VerifiedBadge size={14} />}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              @{user.username}
                            </div>
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          style={{ width: 18, height: 18, accentColor: '#3b82f6', cursor: 'pointer' }}
                        />
                      </div>
                    )
                  })
                ) : (
                  <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    {isSearching ? 'Mencari pengguna...' : 'Tidak ada pengguna yang cocok.'}
                  </div>
                )
              ) : (
                // Kontak Terkini (Recent Contacts)
                recentContacts && recentContacts.length > 0 ? (
                  <>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>
                      Kontak Obrolan Terkini
                    </div>
                    {recentContacts.map(user => {
                      const isSelected = selectedUserIds.has(user.id)
                      return (
                        <div
                          key={user.id}
                          onClick={() => toggleSelectUser(user)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '8px 12px',
                            borderRadius: 10,
                            background: isSelected ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.03)',
                            border: isSelected ? '1px solid rgba(59,130,246,0.4)' : '1px solid transparent',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <UserAvatar name={user.display_name || user.username} avatarUrl={user.avatar_url} size={36} />
                            <div>
                              <div style={{ fontWeight: 600, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                                {user.display_name}
                                {user.is_verified && <VerifiedBadge size={14} />}
                              </div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                @{user.username}
                              </div>
                            </div>
                          </div>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}}
                            style={{ width: 18, height: 18, accentColor: '#3b82f6', cursor: 'pointer' }}
                          />
                        </div>
                      )
                    })}
                  </>
                ) : (
                  <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    Belum ada obrolan terkini. Ketik username di kolom pencarian di atas untuk mencari teman.
                  </div>
                )
              )}
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 14, borderTop: '1px solid var(--border-subtle)' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setStep(1)}
                disabled={isLoading}
              >
                ← Kembali
              </button>

              <button
                type="button"
                className="btn btn-primary"
                onClick={handleCreateGroup}
                disabled={isLoading}
                style={{ width: 'auto', minWidth: 150, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 20px' }}
              >
                {isLoading ? (
                  <>
                    <div className="spinner" style={{ width: 16, height: 16 }} />
                    <span>Membuat...</span>
                  </>
                ) : (
                  <span>Buat Grup ({selectedUserIds.size})</span>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
