'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { apiRequest } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import type { Message, User, ConversationItem } from '@/lib/types'
import { ProfileModal } from './ProfileModal'
import { useModalBackHandler } from '@/lib/useModalBackHandler'
import { isEncryptedMessage, decryptText } from '@/lib/crypto/e2ee'
import { getSharedRoomAESKey, cachePeerPublicKey, getCachedPeerPublicKey } from '@/lib/crypto/keyStore'
import {
  isPushNotificationSupported,
  getNotificationPermission,
  subscribeToPushNotifications,
  unsubscribeFromPushNotifications,
} from '@/lib/pushNotification'
import { clearRoomCache } from '@/lib/messageCache'
import { getAvatarStyle } from '@/lib/avatarColor'

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
  const { user } = useAuth()
  const searchInputRef = useRef<HTMLInputElement>(null)
  const lastHandledMsgIdRef = useRef<string | null>(null)
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const conversationsRef = useRef<ConversationItem[]>([])
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
  const [installPrompt, setInstallPrompt] = useState<any>(null)
  const [isStandalone, setIsStandalone] = useState(true) // default true to avoid flash before check

  // Settings: Push Notification
  const [pushSupported, setPushSupported] = useState(true)
  const [pushPermission, setPushPermission] = useState<NotificationPermission | 'unsupported'>('default')
  const [pushEnabled, setPushEnabled] = useState(false)
  const [isPushLoading, setIsPushLoading] = useState(false)
  const [pushToast, setPushToast] = useState('')

  const handleCloseDeleteConv = useModalBackHandler(
    Boolean(confirmDeleteConv),
    () => setConfirmDeleteConv(null),
    'delete_conv_modal'
  )

  // Sinkronisasi status push notification
  useEffect(() => {
    const checkPushState = () => {
      const supported = isPushNotificationSupported()
      setPushSupported(supported)
      if (supported) {
        const perm = getNotificationPermission()
        setPushPermission(perm)
        const localPref = typeof window !== 'undefined' ? localStorage.getItem('wuzz_push_enabled') : null
        setPushEnabled(perm === 'granted' && localPref !== 'false')
      }
    }

    checkPushState()

    window.addEventListener('focus', checkPushState)
    window.addEventListener('storage', checkPushState)
    return () => {
      window.removeEventListener('focus', checkPushState)
      window.removeEventListener('storage', checkPushState)
    }
  }, [])

  const handleTogglePush = async () => {
    if (!pushSupported) {
      setPushToast('❌ Browser tidak mendukung Push Notification')
      setTimeout(() => setPushToast(''), 3000)
      return
    }

    if (pushPermission === 'denied') {
      setPushToast('⚠️ Izin notifikasi diblokir browser. Izinkan di setelan situs/URL.')
      setTimeout(() => setPushToast(''), 4000)
      return
    }

    setIsPushLoading(true)
    setPushToast('')

    if (!pushEnabled) {
      const res = await subscribeToPushNotifications()
      setIsPushLoading(false)
      if (res.success) {
        setPushEnabled(true)
        setPushPermission('granted')
        setPushToast('🔔 Notifikasi push aktif!')
        setTimeout(() => setPushToast(''), 3000)
      } else {
        setPushEnabled(false)
        setPushPermission(getNotificationPermission())
        setPushToast(`❌ ${res.error || 'Gagal mengaktifkan notifikasi'}`)
        setTimeout(() => setPushToast(''), 4000)
      }
    } else {
      const res = await unsubscribeFromPushNotifications()
      setIsPushLoading(false)
      setPushEnabled(false)
      setPushToast('🔕 Notifikasi push dinonaktifkan')
      setTimeout(() => setPushToast(''), 3000)
    }
  }

  // Deteksi status PWA Standalone & tangkap event beforeinstallprompt
  useEffect(() => {
    const checkStandalone = () => {
      if (typeof window === 'undefined') return
      const isStandaloneMode =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true ||
        document.referrer.includes('android-app://')
      setIsStandalone(isStandaloneMode)
    }

    checkStandalone()

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setInstallPrompt(e)
    }

    const handleAppInstalled = () => {
      setInstallPrompt(null)
      setIsStandalone(true)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  const handleInstallApp = async () => {
    if (installPrompt) {
      try {
        installPrompt.prompt()
        const choice = await installPrompt.userChoice
        if (choice.outcome === 'accepted') {
          setInstallPrompt(null)
          setIsStandalone(true)
        }
      } catch (err) {
        console.warn('Error saat memicu install prompt:', err)
      }
    } else {
      const isIOS = typeof window !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream
      if (isIOS) {
        alert('📲 Untuk memasang Wuzz Chat di iPhone/iPad:\n1. Tekan tombol Bagikan (ikon kotak panah ke atas) di Safari.\n2. Gulir ke bawah dan pilih "Tambahkan ke Layar Utama" (Add to Home Screen).')
      } else {
        alert('📲 Untuk memasang Wuzz Chat sebagai aplikasi:\nTekan menu titik tiga (⋮) di pojok kanan atas browser Anda, lalu pilih "Instal aplikasi" atau "Tambahkan ke Layar Utama".')
      }
    }
  }

  // Sinkronkan ref setiap kali state conversations berubah
  useEffect(() => {
    conversationsRef.current = conversations
  }, [conversations])

  // Eksekusi hapus percakapan (Delete for Me)
  const handleExecuteDeleteConversation = async () => {
    if (!confirmDeleteConv) return
    setIsDeleting(true)
    const { error } = await apiRequest(`/api/conversations?id=${encodeURIComponent(confirmDeleteConv.id)}`, {
      method: 'DELETE',
    })
    setIsDeleting(false)
    if (error) {
      alert(error)
      return
    }
    setConversations(prev => {
      const next = prev.filter(c => c.id !== confirmDeleteConv.id)
      conversationsRef.current = next
      return next
    })
    setUnreadCounts(prev => {
      const next = { ...prev }
      delete next[confirmDeleteConv.id]
      return next
    })
    // Write-Through: bersihkan cache pesan lokal IndexedDB untuk percakapan ini
    clearRoomCache(confirmDeleteConv.id).catch(() => {})
    const isCurrentActive = Boolean(
      activeRoomId && (
        activeRoomId === confirmDeleteConv.id ||
        (confirmDeleteConv.peer_id && (
          activeRoomId === confirmDeleteConv.peer_id ||
          activeRoomId.includes(confirmDeleteConv.peer_id) ||
          (confirmDeleteConv.peer_id.length >= 8 && activeRoomId.includes(confirmDeleteConv.peer_id.substring(0, 8)))
        )) ||
        (confirmDeleteConv.id && (
          activeRoomId === confirmDeleteConv.id ||
          activeRoomId.includes(confirmDeleteConv.id) ||
          confirmDeleteConv.id.includes(activeRoomId)
        ))
      )
    )
    if (isCurrentActive) {
      onSelectRoom('')
    }
    setConfirmDeleteConv(null)
  }

  // Helper dekripsi snippet pesan terakhir percakapan E2EE
  const decryptSnippet = async (
    rawContent?: string,
    roomId?: string,
    peerId?: string,
    peerPublicKey?: string
  ): Promise<string> => {
    if (!rawContent || !isEncryptedMessage(rawContent) || !user?.id || !roomId) {
      return rawContent || ''
    }

    let pId = peerId || ''
    if (!pId) {
      const found = conversationsRef.current.find(c => c.id === roomId)
      pId = found?.peer_id || ''
    }

    if (!pId) return '🔒 Pesan Terenkripsi'

    let peerPub = peerPublicKey || conversationsRef.current.find(c => c.id === roomId)?.peer_public_key || getCachedPeerPublicKey(pId) || ''
    if (!peerPub) {
      try {
        const { data: profile } = await apiRequest<User>(`/api/users/profile?id=${encodeURIComponent(pId)}`)
        if (profile && profile.public_key) {
          peerPub = profile.public_key
          cachePeerPublicKey(pId, peerPub)
        }
      } catch {}
    } else {
      cachePeerPublicKey(pId, peerPub)
    }

    if (peerPub) {
      const aesKey = await getSharedRoomAESKey(user.id, pId, peerPub, roomId)
      if (aesKey) {
        try {
          const plain = await decryptText(aesKey, rawContent)
          return plain
        } catch {
          return '🔒 Pesan Terenkripsi'
        }
      }
    }

    return '🔒 Pesan Terenkripsi'
  }

  // Fetch daftar obrolan aktif beserta unread counts dari database & dekripsi snippet E2EE
  const loadConversations = async () => {
    if (!user) return
    setIsLoading(true)
    const { data } = await apiRequest<ConversationItem[]>('/api/conversations')
    if (data && Array.isArray(data)) {
      const decryptedData = await Promise.all(
        data.map(async (c) => {
          if (c.last_message && isEncryptedMessage(c.last_message)) {
            const plain = await decryptSnippet(c.last_message, c.id, c.peer_id, c.peer_public_key)
            return { ...c, last_message: plain }
          }
          return c
        })
      )

      conversationsRef.current = decryptedData
      setConversations(decryptedData)
      const initialUnread: Record<string, number> = {}
      decryptedData.forEach(c => {
        if (c.unread_count && c.unread_count > 0 && c.id !== activeRoomId) {
          initialUnread[c.id] = c.unread_count
        }
      })
      setUnreadCounts(initialUnread)
    }
    setIsLoading(false)
  }

  useEffect(() => {
    if (user) {
      loadConversations()
    }
    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current)
      }
    }
  }, [user])

  // Reset unread counter untuk room yang sedang aktif dibuka, dan refresh percakapan saat kembali ke Home di HP
  useEffect(() => {
    if (activeRoomId) {
      setUnreadCounts(prev => {
        const next = { ...prev }
        delete next[activeRoomId]
        return next
      })
      setConversations(prev => {
        const next = prev.map(c => (c.id === activeRoomId ? { ...c, unread_count: 0 } : c))
        conversationsRef.current = next
        return next
      })
    } else if (user) {
      // Saat kembali ke Home / Daftar Chat di HP, muat ulang percakapan agar status centang 2 biru & unread 100% sinkron
      loadConversations()
    }
  }, [activeRoomId])

  // Real-time update snippet & unread counter saat ada pesan masuk atau receipt
  useEffect(() => {
    if (!lastIncomingMessage || !lastIncomingMessage.room) return

    const room = lastIncomingMessage.room

    // 1. Update tanda centang receipt (sent -> delivered -> read) secara real-time
    if (lastIncomingMessage.type === 'receipt' && lastIncomingMessage.status) {
      setConversations(prev => {
        const next = prev.map(c => {
          if (c.id === room) {
            return { ...c, last_status: lastIncomingMessage.status }
          }
          return c
        })
        conversationsRef.current = next
        return next
      })
      return
    }

    // 2. Cegah re-processing pesan yang sama saat activeRoomId berubah (misal tombol Back di HP)
    if (lastIncomingMessage.type === 'message') {
      const msgKey = lastIncomingMessage.id || `${lastIncomingMessage.room}_${lastIncomingMessage.timestamp}_${lastIncomingMessage.content}`
      if (lastHandledMsgIdRef.current === msgKey) {
        return
      }
      lastHandledMsgIdRef.current = msgKey

      const isFromOther = lastIncomingMessage.nickname !== user?.username && lastIncomingMessage.nickname !== user?.display_name
      const isInactiveRoom = room !== activeRoomId

      // Jika pesan masuk ke room yang sedang tidak aktif dibuka, naikkan badge unread
      if (isInactiveRoom && isFromOther) {
        setUnreadCounts(prev => ({
          ...prev,
          [room]: (prev[room] || 0) + 1,
        }))
      }

      // Dekripsi snippet pesan teks baru jika terenkripsi E2EE
      const processMessageSnippet = async () => {
        let rawContent = lastIncomingMessage.content || ''
        const foundConv = conversationsRef.current.find(c => c.id === room)

        // Tentukan peerId secara akurat:
        // Jika dari lawan bicara -> lastIncomingMessage.from (atau foundConv.peer_id)
        // Jika dari diri sendiri -> foundConv.peer_id atau lastIncomingMessage.to
        let peerId = foundConv?.peer_id || ''
        if (!peerId) {
          if (lastIncomingMessage.from && lastIncomingMessage.from !== user?.id) {
            peerId = lastIncomingMessage.from
          } else if (lastIncomingMessage.to && lastIncomingMessage.to !== user?.id) {
            peerId = lastIncomingMessage.to
          }
        }

        let peerPub = foundConv?.peer_public_key || (peerId ? getCachedPeerPublicKey(peerId) : '') || ''
        if (!peerPub && peerId) {
          try {
            const { data: profile } = await apiRequest<User>(`/api/users/profile?id=${encodeURIComponent(peerId)}`)
            if (profile && profile.public_key) {
              peerPub = profile.public_key
              cachePeerPublicKey(peerId, peerPub)
            }
          } catch {}
        }

        if (rawContent && isEncryptedMessage(rawContent) && user?.id && peerId) {
          rawContent = await decryptSnippet(rawContent, room, peerId, peerPub)
        }

        const snippet = rawContent && rawContent.trim() !== ''
          ? (isEncryptedMessage(rawContent) ? '🔒 Pesan Terenkripsi' : rawContent)
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
                peer_id: prev[index].peer_id || peerId,
                peer_public_key: prev[index].peer_public_key || peerPub,
                unread_count: isInactiveRoom ? ((prev[index].unread_count || 0) + 1) : 0,
                last_message: snippet,
                last_sender: lastIncomingMessage.nickname || 'Pengguna',
                last_status: lastIncomingMessage.status || 'sent',
                updated_at: lastIncomingMessage.timestamp?.toString() || new Date().toISOString(),
              }
            : {
                id: room,
                type: 'direct',
                title: lastIncomingMessage.nickname || room,
                peer_id: peerId,
                peer_public_key: peerPub,
                unread_count: isInactiveRoom ? 1 : 0,
                last_message: snippet,
                last_sender: lastIncomingMessage.nickname || 'Pengguna',
                last_status: lastIncomingMessage.status || 'sent',
                updated_at: lastIncomingMessage.timestamp?.toString() || new Date().toISOString(),
              }

          const remaining = prev.filter(c => c.id !== room)
          const nextList = [updatedItem, ...remaining]
          conversationsRef.current = nextList
          return nextList
        })
      }

      processMessageSnippet()
    }
  }, [lastIncomingMessage, activeRoomId, user?.id, user?.username, user?.display_name])

  const [searchError, setSearchError] = useState('')

  // Cari user lain dengan debounce 300ms untuk optimasi performa dan mencegah request flooding
  const handleSearch = (query: string) => {
    setSearchQuery(query)
    setSearchError('')

    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current)
    }

    const trimmed = query.trim()
    if (!trimmed) {
      setSearchResults([])
      setIsSearching(false)
      return
    }

    setIsSearching(true)
    searchDebounceRef.current = setTimeout(async () => {
      const { data, error } = await apiRequest<User[]>(`/api/users/search?q=${encodeURIComponent(trimmed)}`)
      setIsSearching(false)
      if (data) {
        setSearchResults(Array.isArray(data) ? data : [])
      } else if (error) {
        setSearchError(error)
      }
    }, 300)
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
      return unread > 0
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
  const isSearchActive = searchQuery.trim().length > 0

  return (
    <aside className={`chat-sidebar ${isOpenMobile ? 'sidebar-open' : ''}`}>
      {/* Ultra-Modern Aurora Top Header */}
      <div className="sidebar-header">
        <div className="sidebar-brand-row">
          <div className="sidebar-brand-title">
            <div className="brand-logo-badge" title="Wuzz Chat">
              <svg className="brand-logo-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" fill="url(#wuzz-lightning-grad)" stroke="rgba(147, 197, 253, 0.5)" strokeWidth="1" />
                <defs>
                  <linearGradient id="wuzz-lightning-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#38bdf8" />
                    <stop offset="50%" stopColor="#60a5fa" />
                    <stop offset="100%" stopColor="#c084fc" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <div className="brand-title-text">
              <span className="brand-wuzz">Wuzz</span><span className="brand-chat">Chat</span>
            </div>
          </div>

          <div className="sidebar-brand-actions">
            {!isStandalone && (
              <button
                type="button"
                className="sidebar-install-btn"
                onClick={handleInstallApp}
                title="Pasang Wuzz Chat sebagai aplikasi mandiri di HP atau Desktop"
              >
                <span className="install-icon">📲</span>
                <span className="install-label">Instal</span>
              </button>
            )}
            <button
              type="button"
              className={`sidebar-action-btn ${pushEnabled ? 'push-active' : ''} ${pushPermission === 'denied' ? 'push-denied' : ''}`}
              onClick={handleTogglePush}
              disabled={isPushLoading}
              title={
                !pushSupported
                  ? 'Peramban ini tidak mendukung Notifikasi Push'
                  : pushPermission === 'denied'
                  ? '⚠️ Izin notifikasi diblokir browser. Klik atau buka setelan browser untuk mengizinkan.'
                  : pushEnabled
                  ? '🔔 Notifikasi Push Aktif (Klik untuk menonaktifkan)'
                  : '🔕 Notifikasi Push Nonaktif (Klik untuk mengaktifkan)'
              }
            >
              {isPushLoading ? '⏳' : pushEnabled ? '🔔' : '🔕'}
            </button>

            {/* Profile Avatar Pill in Header */}
            <button
              type="button"
              className="sidebar-profile-btn"
              onClick={() => setIsProfileModalOpen(true)}
              title={`Profil & Pengaturan: ${user?.display_name || user?.username || 'Saya'}`}
            >
              <div
                className="sidebar-profile-avatar"
                style={getAvatarStyle(user?.display_name || user?.username || 'me')}
              >
                {user?.avatar_url || (user?.display_name || user?.username || 'A')[0].toUpperCase()}
                <span className="sidebar-profile-status-dot" title="Online"></span>
              </div>
            </button>
          </div>
        </div>

        {/* Mini Toast Alert untuk Push Notifications */}
        {pushToast && (
          <div className="sidebar-push-toast">
            {pushToast}
          </div>
        )}
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
      {!isSearchActive && (
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
        {isSearchActive ? (
          <div className="search-results-pane">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 8px 8px' }}>
              <span className="sidebar-section-title">Hasil Pencarian Kontak</span>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('')
                  setSearchResults([])
                  setIsSearching(false)
                  setSearchError('')
                }}
                style={{ background: 'none', border: 'none', color: 'var(--accent-400)', cursor: 'pointer', fontSize: '0.8125rem' }}
              >
                Tutup
              </button>
            </div>
            {isSearching ? (
              <div className="sidebar-empty">
                <p>🔍 Mencari &quot;{searchQuery}&quot;...</p>
              </div>
            ) : searchError ? (
              <p className="sidebar-empty" style={{ color: 'var(--color-error)' }}>{searchError}</p>
            ) : searchResults.length === 0 ? (
              <div className="sidebar-empty">
                <p>Tidak ada pengguna ditemukan untuk &quot;{searchQuery}&quot;</p>
                <p style={{ fontSize: '0.75rem', marginTop: '4px' }}>
                  Coba cari dengan username atau nama tampilan lain.
                </p>
              </div>
            ) : (
              <ul className="conversations-list">
                {searchResults.map(u => (
                  <li
                    key={u.id}
                    className="conversation-item"
                    onClick={() => handleStartDirectChat(u)}
                  >
                    <div
                      className="sidebar-avatar"
                      style={{
                        ...getAvatarStyle(u.display_name || u.username || u.id),
                        fontSize: u.avatar_url ? '1.25rem' : '0.9rem',
                      }}
                    >
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
                        setUnreadCounts(prev => {
                          const next = { ...prev }
                          delete next[c.id]
                          return next
                        })
                        setConversations(prev =>
                          prev.map(item => (item.id === c.id ? { ...item, unread_count: 0 } : item))
                        )
                        onSelectRoom(c.id)
                        if (onCloseMobile) onCloseMobile()
                      }}
                    >
                      <div
                        className="sidebar-avatar"
                        style={getAvatarStyle(c.title || c.id)}
                      >
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
                                {isEncryptedMessage(c.last_message) ? '🔒 Pesan Terenkripsi' : c.last_message}
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
        <div
          className="modal-backdrop"
          onClick={e => {
            if (e.target === e.currentTarget && !isDeleting) handleCloseDeleteConv()
          }}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 120,
            padding: 'var(--space-4)',
          }}
        >
          <div
            className="modal-card"
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--bg-overlay)',
              backdropFilter: 'var(--glass-blur)',
              WebkitBackdropFilter: 'var(--glass-blur)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-lg)',
              width: '100%',
              maxWidth: '420px',
              boxShadow: '0 25px 50px rgba(0,0,0,0.7), 0 0 30px rgba(59, 130, 246, 0.1)',
              overflow: 'hidden',
              animation: 'fadeIn 0.2s ease',
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: 'var(--space-4) var(--space-5)',
                borderBottom: '1px solid var(--border-subtle)',
                background: 'var(--bg-elevated)',
                backdropFilter: 'var(--glass-blur)',
                WebkitBackdropFilter: 'var(--glass-blur)',
              }}
            >
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>🗑️</span> Hapus Percakapan?
              </h3>
              <button
                type="button"
                onClick={() => !isDeleting && handleCloseDeleteConv()}
                disabled={isDeleting}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  fontSize: '1.25rem',
                  cursor: isDeleting ? 'not-allowed' : 'pointer',
                  lineHeight: 1,
                  padding: '4px',
                }}
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: 'var(--space-5)', color: 'var(--text-secondary)', fontSize: '0.875rem', lineHeight: 1.6 }}>
              <p style={{ margin: '0 0 12px 0', color: 'var(--text-primary)' }}>
                Apakah Anda yakin ingin menghapus percakapan dengan <strong>{confirmDeleteConv.title}</strong>?
              </p>
              <div
                style={{
                  padding: '10px 12px',
                  background: 'rgba(16, 185, 129, 0.08)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid rgba(16, 185, 129, 0.2)',
                  fontSize: '0.8125rem',
                  color: 'var(--accent-300)',
                  lineHeight: 1.5,
                }}
              >
                ℹ️ Riwayat obrolan ini hanya akan dibersihkan untuk akun Anda dan <strong>tidak akan terhapus</strong> di sisi lawan bicara.
              </div>

              {/* Modal Footer Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: 'var(--space-5)' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => handleCloseDeleteConv()}
                  disabled={isDeleting}
                  style={{ padding: '8px 16px', fontSize: '0.875rem' }}
                >
                  Batal
                </button>
                <button
                  type="button"
                  style={{
                    background: 'var(--color-error)',
                    color: '#ffffff',
                    border: 'none',
                    padding: '8px 16px',
                    borderRadius: 'var(--radius-md)',
                    cursor: isDeleting ? 'not-allowed' : 'pointer',
                    fontWeight: 600,
                    fontSize: '0.875rem',
                    transition: 'all 0.15s ease',
                    opacity: isDeleting ? 0.7 : 1,
                  }}
                  onClick={handleExecuteDeleteConversation}
                  disabled={isDeleting}
                >
                  {isDeleting ? 'Menghapus...' : 'Hapus Percakapan'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}


