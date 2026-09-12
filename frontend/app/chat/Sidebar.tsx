'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { apiRequest } from '@/lib/api'
import { useAuth, User } from '@/lib/auth-context'
import type { Message } from '@/lib/types'

export interface ConversationItem {
  id: string
  type: 'direct' | 'group'
  title: string
  peer_id?: string
  peer_nickname?: string
  last_message?: string
  last_sender?: string
  unread_count?: number
  updated_at: string
}

interface SidebarProps {
  activeRoomId: string
  onSelectRoom: (roomId: string) => void
  isOpenMobile?: boolean
  onCloseMobile?: () => void
  lastIncomingMessage?: Message | null
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
  const [conversations, setConversations] = useState<ConversationItem[]>([])
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({})
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<User[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

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
      setConversations(prev => {
        const index = prev.findIndex(c => c.id === room)
        const updatedItem: ConversationItem = index >= 0
          ? {
              ...prev[index],
              last_message: lastIncomingMessage.content,
              last_sender: lastIncomingMessage.nickname || 'Pengguna',
              updated_at: lastIncomingMessage.timestamp?.toString() || new Date().toISOString(),
            }
          : {
              id: room,
              type: 'direct',
              title: lastIncomingMessage.nickname || room,
              last_message: lastIncomingMessage.content,
              last_sender: lastIncomingMessage.nickname || 'Pengguna',
              updated_at: lastIncomingMessage.timestamp?.toString() || new Date().toISOString(),
            }

        const remaining = prev.filter(c => c.id !== room)
        return [updatedItem, ...remaining]
      })
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

  return (
    <aside className={`chat-sidebar ${isOpenMobile ? 'sidebar-open' : ''}`}>
      {/* Header Profil User */}
      <div className="sidebar-header">
        <div className="sidebar-user-info">
          <div className="sidebar-avatar">
            {(user?.display_name || user?.username || 'A')[0].toUpperCase()}
          </div>
          <div className="sidebar-user-details">
            <span className="sidebar-user-name">{user?.display_name || user?.username || 'Pengguna'}</span>
            <span className="sidebar-user-handle">@{user?.username || 'guest'}</span>
          </div>
        </div>
        {user ? (
          <button
            type="button"
            onClick={() => {
              logout()
              router.push('/login')
            }}
            className="sidebar-logout-btn"
            title="Keluar dari akun"
          >
            ⏻
          </button>
        ) : (
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

      {/* Input Pencarian Kontak */}
      <div className="sidebar-search-box">
        <input
          type="text"
          className="sidebar-search-input"
          placeholder="🔍 Cari kontak atau username..."
          value={searchQuery}
          onChange={e => handleSearch(e.target.value)}
        />
      </div>

      {/* Daftar Obrolan atau Hasil Pencarian */}
      <div className="sidebar-body">
        {isSearching ? (
          <div className="search-results-pane">
            <p className="sidebar-section-title">Hasil Pencarian</p>
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
                    <div className="sidebar-avatar">
                      {(u.display_name || u.username)[0].toUpperCase()}
                    </div>
                    <div className="conv-details">
                      <span className="conv-name">{u.display_name}</span>
                      <span className="conv-last-msg">@{u.username} • Klik untuk chat</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="conversations-pane">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 8px 8px' }}>
              <span className="sidebar-section-title">Obrolan Terbaru</span>
              <button
                type="button"
                onClick={loadConversations}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.75rem' }}
                title="Refresh daftar obrolan"
              >
                🔄
              </button>
            </div>

            {conversations.length === 0 ? (
              <div className="sidebar-empty">
                <p>Belum ada percakapan.</p>
                <p style={{ fontSize: '0.75rem', marginTop: '4px' }}>
                  Gunakan kolom pencarian di atas untuk mencari teman dan memulai obrolan!
                </p>
              </div>
            ) : (
              <ul className="conversations-list">
                {conversations.map(c => {
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
                          {timeStr && <span className="conv-time">{timeStr}</span>}
                        </div>
                        <div className="conv-bottom">
                          <span className="conv-last-msg">
                            {c.last_message ? (
                              <>
                                {c.last_sender ? <strong>{c.last_sender}: </strong> : null}
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
    </aside>
  )
}

