'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { apiRequest } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import type { Message, User, ConversationItem } from '@/lib/types'
import { ProfileModal } from './ProfileModal'

interface SidebarProps {
  activeRoomId: string
  onSelectRoom: (roomId: string) => void
  isOpenMobile?: boolean
  onCloseMobile?: () => void
  lastIncomingMessage?: Message | null
}

function renderReceipt(status?: Message['status']) {
  switch (status) {
    case 'pending':
      return <span className="receipt-icon receipt-pending" title="Sedang dikirim..." style={{ marginRight: 4 }}>🕒</span>
    case 'delivered':
      return <span className="receipt-icon receipt-delivered" title="Tersampaikan" style={{ marginRight: 4 }}>✓✓</span>
    case 'read':
      return <span className="receipt-icon receipt-read" title="Dibaca" style={{ marginRight: 4 }}>✓✓</span>
    case 'sent':
    default:
      return <span className="receipt-icon receipt-sent" title="Terkirim ke server" style={{ marginRight: 4 }}>✓</span>
  }
}

function formatConvTime(dateStr?: string): string {
  if (!dateStr) return ''
  try {
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return ''
    const now = new Date()
    const isToday = date.toDateString() === now.toDateString()
    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
    return date.toLocaleDateString([], { day: '2-digit', month: '2-digit' })
  } catch {
    return ''
  }
}

export function Sidebar({
  activeRoomId,
  onSelectRoom,
  isOpenMobile,
  onCloseMobile,
  lastIncomingMessage,
}: SidebarProps) {
  const router = useRouter()
  const { user, logout } = useAuth()
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [conversations, setConversations] = useState<ConversationItem[]>([])
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({})
  const [activeFilter, setActiveFilter] = useState<'all' | 'unread' | 'groups' | 'direct'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<User[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false)
  const [confirmDeleteConv, setConfirmDeleteConv] = useState<ConversationItem | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Eksekusi hapus percakapan (Delete for Me)
  const handleExecuteDeleteConversation = async () => {
    if (!confirmDeleteConv) return
    setIsDeleting(true)
    const { error } = await apiRequest(`/api/conversations?id=${encodeURIComponent(confirmDeleteConv.id)}`, {
      method: 'DELETE',
    })
    setIsDeleting(false)
    if (!error) {
      setConversations(prev => prev.filter(c => c.id !== confirmDeleteConv.id))
      if (activeRoomId === confirmDeleteConv.id) {
        onSelectRoom('')
      }
      setConfirmDeleteConv(null)
    }
  }


  // Fetch daftar obrolan aktif beserta unread counts dari database
  const loadConversations = async () => {
    if (!user) return
    setIsLoading(true)
    const { data } = await apiRequest<ConversationItem[]>('/api/conversations')
    if (data) {
      setConversations(data)
      const initialUnread: Record<string, number> = {}
      data.forEach(c => {
        if (c.unread_count && c.unread_count > 0 && c.id !== activeRoomId) {
          initialUnread[c.id] = c.unread_count
        }
      })
      setUnreadCounts(prev => ({ ...initialUnread, ...prev }))
    }
    setIsLoading(false)
  }

  useEffect(() => {
    if (user) {
      loadConversations()
    }
  }, [user])

  // Reset unread counter untuk room yang sedang aktif dibuka
  useEffect(() => {
    if (activeRoomId) {
      setUnreadCounts(prev => {
        if (!prev[activeRoomId]) return prev
        const next = { ...prev }
        delete next[activeRoomId]
        return next
      })
    }
  }, [activeRoomId])

  // Real-time update snippet & unread counter saat ada pesan masuk
  useEffect(() => {
    if (!lastIncomingMessage || !lastIncomingMessage.room) return

    const room = lastIncomingMessage.room
    const isFromOther = lastIncomingMessage.nickname !== user?.username && lastIncomingMessage.nickname !== user?.display_name
    const isInactiveRoom = room !== activeRoomId

    // Jika pesan masuk ke room yang sedang tidak aktif dibuka, naikkan badge unread
    if (isInactiveRoom && isFromOther && lastIncomingMessage.type === 'message') {
      setUnreadCounts(prev => ({
        ...prev,
        [room]: (prev[room] || 0) + 1,
      }))
    }

    // Update snippet & pindahkan percakapan ke urutan teratas
    if (lastIncomingMessage.type === 'message') {
      const snippet = lastIncomingMessage.content && lastIncomingMessage.content.trim() !== ''
        ? lastIncomingMessage.content
        : lastIncomingMessage.media_type === 'image'
        ? '📷 Foto'
        : lastIncomingMessage.media_type === 'audio'
        ? '🎙️ Pesan Suara'
        : lastIncomingMessage.media_type === 'video'
        ? '🎥 Video'
        : lastIncomingMessage.media_url
        ? `📎 ${lastIncomingMessage.file_name || 'Berkas'}`
        : ''

      setConversations(prev => {
        const index = prev.findIndex(c => c.id === room)
        const updatedItem: ConversationItem = index >= 0
          ? {
              ...prev[index],
              last_message: snippet,
              last_sender: lastIncomingMessage.nickname || 'Pengguna',
              last_status: lastIncomingMessage.status || 'sent',
              updated_at: lastIncomingMessage.timestamp?.toString() || new Date().toISOString(),
            }
          : {
              id: room,
              type: 'direct',
              title: lastIncomingMessage.nickname || room,
              last_message: snippet,
              last_sender: lastIncomingMessage.nickname || 'Pengguna',
              last_status: lastIncomingMessage.status || 'sent',
              updated_at: lastIncomingMessage.timestamp?.toString() || new Date().toISOString(),
            }

        const remaining = prev.filter(c => c.id !== room)
        return [updatedItem, ...remaining]
      })
    } else if (lastIncomingMessage.type === 'receipt' && lastIncomingMessage.status) {
      // Update tanda centang pesan terakhir di sidebar secara real-time
      setConversations(prev =>
        prev.map(c => {
          if (c.id === room) {
            return { ...c, last_status: lastIncomingMessage.status }
          }
          return c
        })
      )
    }
  }, [lastIncomingMessage, activeRoomId, user?.username, user?.display_name])

  const [searchError, setSearchError] = useState('')

  // Cari user lain
  const handleSearch = async (query: string) => {
    setSearchQuery(query)
    setSearchError('')
    if (!query.trim()) {
      setSearchResults([])
      setIsSearching(false)
      return
    }

    setIsSearching(true)
    const { data, error } = await apiRequest<User[]>(`/api/users/search?q=${encodeURIComponent(query.trim())}`)
    if (data) {
      setSearchResults(Array.isArray(data) ? data : [])
    } else if (error) {
      setSearchError(error)
    }
  }

  // Mulai direct chat dengan user hasil pencarian
  const handleStartDirectChat = async (targetUser: User) => {
    const { data, error } = await apiRequest<{ room_id: string }>('/api/conversations', {
      method: 'POST',
      body: JSON.stringify({ target_user_id: targetUser.id }),
    })

    if (data?.room_id) {
      setSearchQuery('')
      setIsSearching(false)
      setSearchResults([])
      await loadConversations()
      onSelectRoom(data.room_id)
      if (onCloseMobile) onCloseMobile()
    } else if (error) {
      alert(error)
    }
  }

  // Filter percakapan berdasarkan tab aktif (Semua, Belum Dibaca, Langsung, Grup)
  const filteredConversations = conversations.filter(c => {
    if (activeFilter === 'unread') {
      const unread = unreadCounts[c.id] || 0
      return unread > 0 || (c.unread_count && c.unread_count > 0)
    }
    if (activeFilter === 'groups') {
      return c.type === 'group' || (c.id.startsWith('room-') && !c.id.startsWith('dm_'))
    }
    if (activeFilter === 'direct') {
      return c.type === 'direct' || c.id.startsWith('dm_')
    }
    return true
  })

  const totalUnread = Object.values(unreadCounts).reduce((a, b) => a + b, 0)

  return (
    <aside className={`chat-sidebar ${isOpenMobile ? 'sidebar-open' : ''}`}>
      {/* WhatsApp-Style Top Header */}
      <div className="sidebar-header">
        <div className="sidebar-brand-row">
          <div className="sidebar-brand-title">
            <span className="brand-wuzz">Wuzz</span><span className="brand-chat">Chat</span>
          </div>
          <div className="sidebar-brand-actions">
            <button
              type="button"
              className="sidebar-header-btn"
              onClick={() => setIsProfileModalOpen(true)}
              title="Profil & Pengaturan"
            >
              ⚙️
            </button>
            {!user && (
              <button
                type="button"
                onClick={() => router.push('/login')}
                className="btn btn-primary"
                style={{ fontSize: '0.75rem', padding: '4px 8px' }}
              >
                Masuk
              </button>
            )}
          </div>
        </div>

        {/* User Card Summary Bar (Desktop / Profile Quick Click) */}
        <div
          className="sidebar-user-info"
          onClick={() => setIsProfileModalOpen(true)}
          style={{ cursor: 'pointer', marginTop: 'var(--space-2)' }}
          title="Klik untuk mengedit profil & status bio"
        >
          <div className="sidebar-avatar" style={{ fontSize: user?.avatar_url ? '1.25rem' : '0.9rem' }}>
            {user?.avatar_url || (user?.display_name || user?.username || 'A')[0].toUpperCase()}
          </div>
          <div className="sidebar-user-details" style={{ overflow: 'hidden' }}>
            <span className="sidebar-user-name">{user?.display_name || user?.username || 'Pengguna'}</span>
            <span
              className="sidebar-user-handle"
              style={{
                fontSize: '0.75rem',
                color: 'var(--text-muted)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                display: 'block',
              }}
              title={user?.status_message || 'Tersedia untuk mengobrol'}
            >
              {user?.status_message ? user.status_message : `@${user?.username || 'guest'}`}
            </span>
          </div>
        </div>
      </div>

      {/* Input Pencarian WhatsApp Style */}
      <div className="sidebar-search-box">
        <div className="search-input-wrapper">
          <span className="search-input-icon">🔍</span>
          <input
            ref={searchInputRef}
            type="text"
            className="sidebar-search-input"
            placeholder="Cari kontak atau obrolan..."
            value={searchQuery}
            onChange={e => handleSearch(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="search-clear-btn"
              onClick={() => handleSearch('')}
              title="Bersihkan pencarian"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Filter Pills WhatsApp Style */}
      {!isSearching && (
        <div className="sidebar-filter-pills">
          <button
            type="button"
            className={`filter-pill ${activeFilter === 'all' ? 'active' : ''}`}
            onClick={() => setActiveFilter('all')}
          >
            Semua
          </button>
          <button
            type="button"
            className={`filter-pill ${activeFilter === 'unread' ? 'active' : ''}`}
            onClick={() => setActiveFilter('unread')}
          >
            Belum Dibaca
            {totalUnread > 0 && (
              <span className="filter-pill-badge">{totalUnread}</span>
            )}
          </button>
          <button
            type="button"
            className={`filter-pill ${activeFilter === 'direct' ? 'active' : ''}`}
            onClick={() => setActiveFilter('direct')}
          >
            Langsung
          </button>
          <button
            type="button"
            className={`filter-pill ${activeFilter === 'groups' ? 'active' : ''}`}
            onClick={() => setActiveFilter('groups')}
          >
            Grup
          </button>
        </div>
      )}

      {/* Daftar Obrolan atau Hasil Pencarian */}
      <div className="sidebar-body">
        {isSearching ? (
          <div className="search-results-pane">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 8px 8px' }}>
              <span className="sidebar-section-title">Hasil Pencarian Kontak</span>
              <button
                type="button"
                onClick={() => {
                  setIsSearching(false)
                  setSearchQuery('')
                  setSearchResults([])
                }}
                style={{ background: 'none', border: 'none', color: 'var(--accent-400)', cursor: 'pointer', fontSize: '0.8125rem' }}
              >
                Tutup
              </button>
            </div>
            {searchError ? (
              <p className="sidebar-empty" style={{ color: 'var(--color-error)' }}>{searchError}</p>
            ) : searchResults.length === 0 ? (
              <p className="sidebar-empty">Tidak ada pengguna ditemukan</p>
            ) : (
              <ul className="conversations-list">
                {searchResults.map(u => (
                  <li
                    key={u.id}
                    className="conversation-item"
                    onClick={() => handleStartDirectChat(u)}
                  >
                    <div className="sidebar-avatar" style={{ fontSize: u.avatar_url ? '1.25rem' : '0.9rem' }}>
                      {u.avatar_url || (u.display_name || u.username)[0].toUpperCase()}
                    </div>
                    <div className="conv-details">
                      <div className="conv-top">
                        <span className="conv-name">{u.display_name || u.username}</span>
                        <span className="conv-time" style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>@{u.username}</span>
                      </div>
                      <div className="conv-bottom">
                        <span className="conv-last-msg" title={u.status_message || 'Tersedia untuk mengobrol'}>
                          {u.status_message || 'Tersedia untuk mengobrol'}
                        </span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="conversations-pane">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 8px 8px' }}>
              <span className="sidebar-section-title">
                {activeFilter === 'unread' ? 'Belum Dibaca' : activeFilter === 'groups' ? 'Grup Obrolan' : activeFilter === 'direct' ? 'Obrolan Langsung' : 'Semua Obrolan'}
              </span>
              <button
                type="button"
                onClick={loadConversations}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.75rem' }}
                title="Refresh daftar obrolan"
              >
                🔄
              </button>
            </div>

            {filteredConversations.length === 0 ? (
              <div className="sidebar-empty">
                <p>Belum ada percakapan {activeFilter !== 'all' ? `pada kategori ini` : ''}.</p>
                <p style={{ fontSize: '0.75rem', marginTop: '4px' }}>
                  Gunakan kolom pencarian di atas atau tombol + di bawah untuk memulai obrolan!
                </p>
              </div>
            ) : (
              <ul className="conversations-list">
                {filteredConversations.map(c => {
                  const isActive = c.id === activeRoomId
                  const initial = (c.title || '#')[0].toUpperCase()
                  const unread = unreadCounts[c.id] || 0
                  const timeStr = formatConvTime(c.updated_at)

                  return (
                    <li
                      key={c.id}
                      className={`conversation-item ${isActive ? 'active' : ''}`}
                      onClick={() => {
                        onSelectRoom(c.id)
                        if (onCloseMobile) onCloseMobile()
                      }}
                    >
                      <div className="sidebar-avatar">
                        {initial}
                      </div>
                      <div className="conv-details">
                        <div className="conv-top">
                          <span className="conv-name">{c.title || c.id}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            {timeStr && <span className="conv-time">{timeStr}</span>}
                            <div className="conv-actions">
                              <button
                                type="button"
                                className="conv-delete-btn"
                                title="Hapus percakapan dari daftar Anda"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setConfirmDeleteConv(c)
                                }}
                              >
                                🗑️
                              </button>
                            </div>
                          </div>
                        </div>
                        <div className="conv-bottom">
                          <span className="conv-last-msg">
                            {c.last_message ? (
                              <>
                                {(() => {
                                  const isSelf = c.last_sender === user?.display_name || c.last_sender === user?.username || c.last_sender === 'Kamu'
                                  if (isSelf) {
                                    return renderReceipt(c.last_status)
                                  }
                                  return c.last_sender ? <strong>{c.last_sender}: </strong> : null
                                })()}
                                {c.last_message}
                              </>
                            ) : (
                              'Belum ada pesan'
                            )}
                          </span>
                          {unread > 0 && (
                            <span className="conv-unread-badge" aria-label={`${unread} pesan belum dibaca`}>
                              {unread > 99 ? '99+' : unread}
                            </span>
                          )}
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* WhatsApp Floating Action Button (FAB) di Mobile */}
      <button
        type="button"
        className="sidebar-fab"
        onClick={() => {
          setIsSearching(true)
          setTimeout(() => {
            searchInputRef.current?.focus()
          }, 100)
        }}
        aria-label="Mulai obrolan baru"
        title="Mulai obrolan baru / Cari kontak"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          <line x1="12" y1="8" x2="12" y2="14"></line>
          <line x1="9" y1="11" x2="15" y2="11"></line>
        </svg>
      </button>

      {/* WhatsApp Mobile Bottom Navigation */}
      <nav className="mobile-bottom-nav">
        <button
          type="button"
          className={`bottom-nav-item ${!isSearching ? 'active' : ''}`}
          onClick={() => {
            setIsSearching(false)
            setSearchQuery('')
          }}
        >
          <span className="bottom-nav-icon">💬</span>
          <span className="bottom-nav-label">Chats</span>
          {totalUnread > 0 && (
            <span className="bottom-nav-badge">{totalUnread}</span>
          )}
        </button>
        <button
          type="button"
          className={`bottom-nav-item ${isSearching ? 'active' : ''}`}
          onClick={() => {
            setIsSearching(true)
            setTimeout(() => {
              searchInputRef.current?.focus()
            }, 100)
          }}
        >
          <span className="bottom-nav-icon">🔍</span>
          <span className="bottom-nav-label">Kontak</span>
        </button>
        <button
          type="button"
          className="bottom-nav-item"
          onClick={() => setIsProfileModalOpen(true)}
        >
          <span className="bottom-nav-icon">👤</span>
          <span className="bottom-nav-label">Profil</span>
        </button>
      </nav>

      <ProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
      />

      {/* Modal Konfirmasi Hapus Percakapan */}
      {confirmDeleteConv && (
        <div className="modal-overlay" onClick={() => !isDeleting && setConfirmDeleteConv(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h3 style={{ fontSize: '1.1rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>🗑️</span> Hapus Percakapan?
              </h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => !isDeleting && setConfirmDeleteConv(null)}
                disabled={isDeleting}
              >
                ✕
              </button>
            </div>
            <div className="modal-body" style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              <p>
                Apakah Anda yakin ingin menghapus percakapan dengan <strong>{confirmDeleteConv.title}</strong>?
              </p>
              <div style={{ marginTop: 12, padding: '10px 12px', background: 'rgba(16, 185, 129, 0.08)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(16, 185, 129, 0.2)', fontSize: '0.8125rem', color: 'var(--accent-300)' }}>
                ℹ️ Riwayat obrolan ini hanya akan dibersihkan untuk akun Anda dan <strong>tidak akan terhapus</strong> di sisi lawan bicara.
              </div>
            </div>
            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setConfirmDeleteConv(null)}
                disabled={isDeleting}
              >
                Batal
              </button>
              <button
                type="button"
                className="btn"
                style={{ background: 'var(--color-error)', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 600 }}
                onClick={handleExecuteDeleteConversation}
                disabled={isDeleting}
              >
                {isDeleting ? 'Menghapus...' : 'Hapus Percakapan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}


