'use client'

import { useEffect, useReducer, useState, useCallback, useRef, useMemo, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { WsClient } from '@/lib/ws-client'
import type { Message, MessageType, ConnectionStatus, SessionInfo, RoomUser, MessageReceiptStatus, ReactionItem, ConversationItem, User, ActiveCallInfo, GroupDetails, PinnedMessage } from '@/lib/types'
import { StatusBar } from './StatusBar'
import { ChatWindow } from './ChatWindow'
import { MessageInput } from './MessageInput'
import { MemberListModal } from './MemberListModal'
import { ImageLightboxModal } from './ImageLightboxModal'
import { IncomingCallModal } from './IncomingCallModal'
import { AudioCallOverlay } from './AudioCallOverlay'
import { Sidebar } from './Sidebar'
import { GroupInfoDrawer } from './GroupInfoDrawer'
import CreateSubGroupModal from './CreateSubGroupModal'
import SubGroupListDrawer from './SubGroupListDrawer'
import GroupPreviewModal from './GroupPreviewModal'
import { ForwardMessageModal } from './ForwardMessageModal'
import { soundManager, playOutgoingRing, playIncomingRing, stopCallSounds } from '@/lib/sound'
import { WebRTCAudioSession } from '@/lib/webrtc/webrtcAudio'
import { useAuth } from '@/lib/auth-context'
import { deleteMessageApi, apiRequest } from '@/lib/api'
import { isEncryptedMessage, encryptText, decryptText } from '@/lib/crypto/e2ee'
import {
  initUserE2EE,
  getSharedRoomAESKey,
  cachePeerPublicKey,
  getCachedPeerPublicKey,
  forceResetUserE2EE,
  clearLocalKeyPair,
  getOrCreateDeviceId,
  E2EEDeviceConflictError,
} from '@/lib/crypto/keyStore'
import { autoSyncPushSubscription } from '@/lib/pushNotification'
import { DeviceConflictModal } from './DeviceConflictModal'
import {
  getCachedMessages,
  getLastCachedMessageTimestamp,
  cacheMessages,
  cacheMessage,
  updateCachedMessageStatus,
  updateMessageContentInCache,
  deleteCachedMessage,
  toCachedRecord,
  type CachedMessageRecord,
} from '@/lib/messageCache'

// ----------------------------------------------------------------
// State & Reducer
// ----------------------------------------------------------------

interface ChatState {
  messages: Message[]
  session: SessionInfo | null
  status: ConnectionStatus
  peerNickname: string | null
  peerAvatarUrl?: string | null
  peerUserId?: string | null
  peerIsVerified?: boolean
  isPeerTyping: boolean
  typingNickname: string | null
  roomUsers: RoomUser[]
}

type ChatAction =
  | { type: 'SET_STATUS'; payload: ConnectionStatus }
  | { type: 'SET_SESSION'; payload: SessionInfo }
  | { type: 'ADD_MESSAGE'; payload: Message }
  | { type: 'UPDATE_MESSAGE_STATUS'; payload: { id?: string; status: MessageReceiptStatus } }
  | { type: 'UPDATE_MESSAGE_REACTIONS'; payload: { id: string; reactions: ReactionItem[] } }
  | { type: 'DELETE_MESSAGE_LOCAL'; payload: { id: string } }
  | { type: 'UPDATE_MESSAGE_DELETED'; payload: { id: string; content?: string } }
  | { type: 'EDIT_MESSAGE'; payload: { id: string; newContent: string; editedAt?: string } }
  | { type: 'SET_MESSAGES'; payload: Message[] }
  | { type: 'SET_PEER_INFO'; payload: { nickname?: string; avatarUrl?: string; userId?: string; isVerified?: boolean } }
  | { type: 'SET_PEER_NICKNAME'; payload: string }
  | { type: 'SET_PEER_TYPING'; payload: { typing: boolean; nickname?: string | null } }
  | { type: 'SET_ROOM_USERS'; payload: RoomUser[] }

const initialState: ChatState = {
  messages: [],
  session: null,
  status: 'connecting',
  peerNickname: null,
  peerAvatarUrl: null,
  peerUserId: null,
  peerIsVerified: false,
  isPeerTyping: false,
  typingNickname: null,
  roomUsers: [],
}

const statusWeight: Record<MessageReceiptStatus, number> = {
  pending: 0,
  sent: 1,
  delivered: 2,
  read: 3,
}

function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'SET_STATUS':
      return { ...state, status: action.payload }
    case 'SET_SESSION':
      return { ...state, session: action.payload }
    case 'ADD_MESSAGE': {
      // Jika pesan sudah ada berdasarkan ID (misal optimistic vs ACK server), update status & datanya
      if (action.payload.id && state.messages.some(m => m.id === action.payload.id)) {
        return {
          ...state,
          messages: state.messages.map(m =>
            m.id === action.payload.id ? { ...m, ...action.payload } : m
          ),
        }
      }
      return { ...state, messages: [...state.messages, action.payload] }
    }
    case 'UPDATE_MESSAGE_STATUS': {
      const { id, status } = action.payload
      const targetWeight = statusWeight[status] || 0

      // Jika id kosong, ini adalah bulk status update untuk seluruh pesan di room
      if (!id) {
        return {
          ...state,
          messages: state.messages.map(m => {
            const currentWeight = m.status ? (statusWeight[m.status] ?? 1) : 1
            if (targetWeight >= currentWeight) {
              return { ...m, status }
            }
            return m
          }),
        }
      }

      return {
        ...state,
        messages: state.messages.map(m => {
          if (m.id === id) {
            const currentWeight = m.status ? (statusWeight[m.status] ?? 1) : 1
            // Status hanya boleh bergerak maju (pending -> sent -> delivered -> read)
            if (targetWeight >= currentWeight) {
              return { ...m, status }
            }
          }
          return m
        }),
      }
    }
    case 'UPDATE_MESSAGE_REACTIONS': {
      const { id, reactions } = action.payload
      return {
        ...state,
        messages: state.messages.map(m => (m.id === id ? { ...m, reactions } : m)),
      }
    }
    case 'DELETE_MESSAGE_LOCAL': {
      return {
        ...state,
        messages: state.messages.filter(m => m.id !== action.payload.id),
      }
    }
    case 'UPDATE_MESSAGE_DELETED': {
      return {
        ...state,
        messages: state.messages.map(m =>
          m.id === action.payload.id
            ? {
                ...m,
                is_deleted: true,
                content: action.payload.content || '🚫 Pesan ini telah dihapus',
                media_url: undefined,
                reactions: [],
              }
            : m
        ),
      }
    }
    case 'EDIT_MESSAGE': {
      return {
        ...state,
        messages: state.messages.map(m =>
          m.id === action.payload.id
            ? {
                ...m,
                content: action.payload.newContent,
                is_edited: true,
                edited_at: action.payload.editedAt || new Date().toISOString(),
              }
            : m
        ),
      }
    }
    case 'SET_MESSAGES': {
      return { ...state, messages: action.payload }
    }
    case 'SET_PEER_INFO':
      return {
        ...state,
        ...(action.payload.nickname !== undefined ? { peerNickname: action.payload.nickname } : {}),
        ...(action.payload.avatarUrl !== undefined ? { peerAvatarUrl: action.payload.avatarUrl } : {}),
        ...(action.payload.userId !== undefined ? { peerUserId: action.payload.userId } : {}),
        ...(action.payload.isVerified !== undefined ? { peerIsVerified: action.payload.isVerified } : {}),
      }
    case 'SET_PEER_NICKNAME':
      return { ...state, peerNickname: action.payload }
    case 'SET_PEER_TYPING':
      return {
        ...state,
        isPeerTyping: action.payload.typing,
        typingNickname: action.payload.typing ? (action.payload.nickname || state.typingNickname) : null,
      }
    case 'SET_ROOM_USERS':
      return { ...state, roomUsers: action.payload }
    default:
      return state
  }
}

// ----------------------------------------------------------------
// E2EE Helper Dekripsi Pesan
// ----------------------------------------------------------------

async function decryptSingleMessage(m: Message, key: CryptoKey | null): Promise<Message> {
  const cipher = m.raw_content || m.content || ''
  if (!isEncryptedMessage(cipher)) {
    return m
  }
  if (!key) {
    return {
      ...m,
      raw_content: cipher,
      content: '🔒 [Pesan Terenkripsi]',
    }
  }
  try {
    const plain = await decryptText(key, cipher)
    let plainReply = m.reply_to?.content
    if (plainReply && isEncryptedMessage(plainReply)) {
      try {
        plainReply = await decryptText(key, plainReply)
      } catch {}
    }
    return {
      ...m,
      raw_content: cipher,
      content: plain,
      reply_to: m.reply_to ? { ...m.reply_to, content: plainReply || '' } : undefined,
    }
  } catch (err) {
    return {
      ...m,
      raw_content: cipher,
      content: '🔒 [Pesan Terenkripsi]',
    }
  }
}

// ----------------------------------------------------------------
// Chat Page Component
// ----------------------------------------------------------------

function ChatPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const searchParamRoom = searchParams.get('room') || searchParams.get('peer') || ''
  const [selectedRoomId, setSelectedRoomId] = useState<string>(searchParamRoom)

  // Sinkronkan state saat URL query param berubah dari navigasi luar/browser back
  useEffect(() => {
    setSelectedRoomId(searchParamRoom)
    setPrivateGroupDenied(null)
  }, [searchParamRoom])

  const roomId = selectedRoomId
  const { user, isLoading: isAuthLoading, logout } = useAuth()

  const [state, dispatch] = useReducer(chatReducer, initialState)
  const [isMemberListOpen, setIsMemberListOpen] = useState(false)
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)
  const [lastIncomingMessage, setLastIncomingMessage] = useState<Message | null>(null)
  const [replyingTo, setReplyingTo] = useState<Message | null>(null)
  const [editingMessage, setEditingMessage] = useState<{ id: string; content: string } | null>(null)
  const [forwardingMessage, setForwardingMessage] = useState<Message | null>(null)
  const [forwardConversations, setForwardConversations] = useState<ConversationItem[]>([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(Boolean(roomId))
  const [isHistoryError, setIsHistoryError] = useState(false)
  const [peerPublicKeyJWK, setPeerPublicKeyJWK] = useState<string>('')
  const [deviceConflict, setDeviceConflict] = useState<{
    isOpen: boolean
    isRotated?: boolean
    keyVersion?: number
  }>({ isOpen: false })
  const [e2eeVerified, setE2eeVerified] = useState(false)
  const [activeCall, setActiveCall] = useState<ActiveCallInfo | null>(null)
  const [isCallMuted, setIsCallMuted] = useState(false)
  const [groupDetails, setGroupDetails] = useState<GroupDetails | null>(null)
  const [isGroupInfoOpen, setIsGroupInfoOpen] = useState(false)
  const [isSubGroupListOpen, setIsSubGroupListOpen] = useState(false)
  const [isCreateSubGroupOpen, setIsCreateSubGroupOpen] = useState(false)
  const [directPreviewGroup, setDirectPreviewGroup] = useState<GroupDetails | null>(null)
  const [privateGroupDenied, setPrivateGroupDenied] = useState<{ id: string; error?: string } | null>(null)
  const [pinnedMessages, setPinnedMessages] = useState<PinnedMessage[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<string[]>([])
  const [searchIndex, setSearchIndex] = useState(0)
  const activeCallRef = useRef<ActiveCallInfo | null>(null)
  const webrtcAudioRef = useRef<WebRTCAudioSession | null>(null)
  const pendingOfferSdpRef = useRef<string | null>(null)
  const earlyIceCandidatesRef = useRef<string[]>([])
  const clientRef = useRef<WsClient | null>(null)
  const roomAESKeyRef = useRef<CryptoKey | null>(null)
  const activePeerRef = useRef<{ id: string; publicKey: string } | null>(null)
  // Menyimpan public key terakhir yang diketahui per peer, untuk deteksi perubahan kunci keamanan
  // Format localStorage key: wuzz_peer_pk_<peerId>
  const lastKnownPeerKeyRef = useRef<Record<string, string>>({})
  const messagesRef = useRef<Message[]>([])

  // Selalu sinkronkan activeCallRef dengan activeCall
  useEffect(() => {
    activeCallRef.current = activeCall
  }, [activeCall])

  // Selalu sinkronkan messagesRef dengan state.messages
  useEffect(() => {
    messagesRef.current = state.messages
  }, [state.messages])

  // Selalu sinkronkan roomIdRef dengan roomId aktif agar callback WS tidak stale
  const roomIdRef = useRef<string>(roomId)
  useEffect(() => {
    roomIdRef.current = roomId
  }, [roomId])

  // Muat detail grup saat berpindah ke room grup atau saat menerima notifikasi aktivitas grup
  const fetchGroupDetails = useCallback(async (targetRoomId: string, signal?: AbortSignal) => {
    if (!targetRoomId || (!targetRoomId.startsWith('grp_') && !targetRoomId.startsWith('sub_'))) return
    try {
      const { data, error, status } = await apiRequest<GroupDetails>(`/api/groups/${targetRoomId}`, { signal })
      if (error) {
        if (targetRoomId.startsWith('grp_') || targetRoomId.startsWith('sub_')) {
          const isAccessDenied = status === 403 || 
            error.toLowerCase().includes('akses ditolak') || 
            error.toLowerCase().includes('bukan anggota')
          if (isAccessDenied) {
            setPrivateGroupDenied({ id: targetRoomId, error })
            setGroupDetails(null)
            setIsLoadingHistory(false)
            setIsHistoryError(false)
            if (historyTimeoutRef.current) {
              clearTimeout(historyTimeoutRef.current)
              historyTimeoutRef.current = null
            }
          } else {
            alert(error)
            setSelectedRoomId('')
            router.replace('/chat')
          }
        }
        return
      }
      if (data) {
        setPrivateGroupDenied(null)
        setGroupDetails(data)
        dispatch({
          type: 'SET_PEER_INFO',
          payload: {
            nickname: data.title || data.name || '',
            avatarUrl: data.avatar_url || '',
            userId: '',
          },
        })
        // Jika grup publik dan pengguna belum bergabung (my_role kosong), tampilkan preview modal
        if (targetRoomId.startsWith('grp_') && data.is_public && !data.my_role) {
          setDirectPreviewGroup(data)
        } else {
          setDirectPreviewGroup(null)
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('[Group] Gagal memuat/refresh detail grup:', err)
      }
    }
  }, [dispatch, router])

  const fetchGroupDetailsRef = useRef(fetchGroupDetails)
  useEffect(() => {
    fetchGroupDetailsRef.current = fetchGroupDetails
  }, [fetchGroupDetails])

  const [parentGroupName, setParentGroupName] = useState('')
  const [parentGroupRole, setParentGroupRole] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (groupDetails?.parent_id) {
      apiRequest<GroupDetails>(`/api/groups/${groupDetails.parent_id}`)
        .then(({ data }) => {
          if (data) {
            setParentGroupName(data.title || data.name || 'Grup Utama')
            setParentGroupRole(data.my_role)
          }
        })
        .catch(() => {
          setParentGroupName('Grup Utama')
          setParentGroupRole(undefined)
        })
    } else {
      setParentGroupName('')
      setParentGroupRole(undefined)
    }
  }, [groupDetails?.parent_id])

  useEffect(() => {
    if (!roomId || (!roomId.startsWith('grp_') && !roomId.startsWith('sub_'))) {
      setGroupDetails(null)
      setIsGroupInfoOpen(false)
      setIsSubGroupListOpen(false)
      setIsCreateSubGroupOpen(false)
      return
    }

    const controller = new AbortController()
    fetchGroupDetails(roomId, controller.signal)

    return () => {
      controller.abort()
    }
  }, [roomId, fetchGroupDetails])

  // Lacak peer info terbaru (nickname, avatar, id) agar terhindar dari stale overwrite
  const peerInfoRef = useRef<{ nickname: string | null; avatarUrl: string | null; userId: string | null }>({
    nickname: null,
    avatarUrl: null,
    userId: null,
  })
  useEffect(() => {
    peerInfoRef.current = {
      nickname: state.peerNickname,
      avatarUrl: state.peerAvatarUrl || null,
      userId: state.peerUserId || null,
    }
  }, [state.peerNickname, state.peerAvatarUrl, state.peerUserId])

  // Kunci scroll window ke (0,0) untuk mencegah pergeseran layout / header terangkat saat keyboard Android muncul
  useEffect(() => {
    if (typeof window === 'undefined') return

    if ('scrollRestoration' in history) {
      history.scrollRestoration = 'manual'
    }

    const resetWindowScroll = () => {
      if (window.scrollY !== 0 || window.scrollX !== 0) {
        window.scrollTo(0, 0)
      }
      if (document.body.scrollTop !== 0) {
        document.body.scrollTop = 0
      }
      if (document.documentElement.scrollTop !== 0) {
        document.documentElement.scrollTop = 0
      }
    }

    resetWindowScroll()

    window.addEventListener('scroll', resetWindowScroll, { passive: true })
    window.visualViewport?.addEventListener('scroll', resetWindowScroll, { passive: true })
    window.visualViewport?.addEventListener('resize', resetWindowScroll, { passive: true })

    return () => {
      window.removeEventListener('scroll', resetWindowScroll)
      window.visualViewport?.removeEventListener('scroll', resetWindowScroll)
      window.visualViewport?.removeEventListener('resize', resetWindowScroll)
    }
  }, [roomId])

  // Inisialisasi E2EE Identity Keys & Push Notification saat user login
  useEffect(() => {
    if (user?.id) {
      const token = typeof window !== 'undefined' ? localStorage.getItem('wuzz_auth_token') || '' : ''
      initUserE2EE(user.id, token)
        .then(() => {
          setE2eeVerified(true)
        })
        .catch(err => {
          setE2eeVerified(false)
          if (err instanceof E2EEDeviceConflictError) {
            setDeviceConflict({
              isOpen: true,
              isRotated: err.isRotated,
              keyVersion: err.keyVersion,
            })
            return
          }
          console.warn('[E2EE] Inisialisasi kunci lokal gagal:', err)
        })
      autoSyncPushSubscription().catch(err => {
        console.warn('[Push] Auto-sync push notification gagal:', err)
      })
    }
  }, [user?.id])

  // Timer untuk matikan typing indicator setelah 3 detik
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Timer timeout sinkronisasi riwayat pesan (7.5 detik)
  const historyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Resolusi kunci publik lawan bicara & auto-dekripsi reaktif
  const resolvePeerKeyAndDecrypt = useCallback(async (peerId: string, pubKeyParam?: string) => {
    if (!user?.id || !roomId || !peerId) return

    let pubKey = pubKeyParam || ''
    if (!pubKey) {
      const cached = getCachedPeerPublicKey(peerId)
      if (cached) {
        pubKey = cached
      } else {
        try {
          const { data: profile } = await apiRequest<User>(`/api/users/profile?id=${encodeURIComponent(peerId)}`)
          if (profile) {
            if (profile.public_key) {
              pubKey = profile.public_key
            }
            dispatch({
              type: 'SET_PEER_INFO',
              payload: {
                nickname: profile.display_name || profile.username,
                avatarUrl: profile.avatar_url || '',
                userId: profile.id,
              },
            })
          }
        } catch (err) {
          console.warn('[E2EE] Gagal fetch profil peer:', err)
        }
      }
    }

    if (pubKey) {
      cachePeerPublicKey(peerId, pubKey)
      setPeerPublicKeyJWK(pubKey)
      activePeerRef.current = { id: peerId, publicKey: pubKey }

      // ----------------------------------------------------------------
      // Deteksi Perubahan Kunci Keamanan (Milestone 4)
      // Bandingkan public key saat ini dengan yang terakhir diketahui.
      // Jika berbeda, inject pesan sistem ke timeline sebagai notifikasi.
      // ----------------------------------------------------------------
      const lsKey = `wuzz_peer_pk_${peerId}`
      const storedKey = lastKnownPeerKeyRef.current[peerId]
        || (typeof window !== 'undefined' ? localStorage.getItem(lsKey) || '' : '')

      if (storedKey && storedKey !== pubKey) {
        // Kunci berubah! Inject pesan sistem ke timeline
        const securityNoticeMsg: Message = {
          id: `security-notice-${peerId}-${Date.now()}`,
          type: 'system',
          content: '🔒 Kode keamanan lawan bicara ini telah berubah. Mereka mungkin menggunakan perangkat baru. Verifikasi Safety Number jika perlu.',
          timestamp: new Date().toISOString(),
          room: roomId,
        }
        dispatch({ type: 'ADD_MESSAGE', payload: securityNoticeMsg })
      }

      // Perbarui last known key di memory ref dan localStorage
      lastKnownPeerKeyRef.current[peerId] = pubKey
      if (typeof window !== 'undefined') {
        localStorage.setItem(lsKey, pubKey)
      }

      const aesKey = await getSharedRoomAESKey(user.id, peerId, pubKey, roomId)
      if (aesKey) {
        roomAESKeyRef.current = aesKey

        // Re-dekripsi semua pesan yang sedang tampil di layar secara instan
        const currentList = messagesRef.current
        if (currentList && currentList.length > 0) {
          const hasEncrypted = currentList.some(m => isEncryptedMessage(m.raw_content || m.content))
          if (hasEncrypted) {
            const decryptedList = await Promise.all(
              currentList.map(m => decryptSingleMessage(m, aesKey))
            )
            dispatch({ type: 'SET_MESSAGES', payload: decryptedList })
          }
        }
      }
    }
  }, [user?.id, roomId])

  // Handler konfirmasi reset kunci keamanan E2EE pada perangkat ini
  const handleConfirmDeviceReset = useCallback(async () => {
    if (!user?.id) return
    await forceResetUserE2EE(user.id)
    setDeviceConflict({ isOpen: false })
    setE2eeVerified(true)
    if (activePeerRef.current?.id) {
      resolvePeerKeyAndDecrypt(activePeerRef.current.id, activePeerRef.current.publicKey)
    }
  }, [user?.id, resolvePeerKeyAndDecrypt])

  // Handler logout saat terjadi konflik perangkat
  const handleDeviceConflictLogout = useCallback(async () => {
    try {
      if (user?.id) {
        await clearLocalKeyPair(user.id)
      }
      await logout()
    } catch {}
    if (typeof window !== 'undefined') {
      window.location.href = '/login'
    }
  }, [logout])

  // ----------------------------------------------------------------
  // Pinned Messages & In-Chat Search Handlers (Milestone 8.3D & 8.3E)
  // ----------------------------------------------------------------
  const fetchPinnedMessages = useCallback(async (currentRoomId: string) => {
    if (!currentRoomId) {
      setPinnedMessages([])
      return
    }
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('wuzz_auth_token') || '' : ''
      const res = await fetch(`/api/messages/pinned?room_id=${encodeURIComponent(currentRoomId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        if (data.pinned) {
          setPinnedMessages(data.pinned)
        }
      }
    } catch {}
  }, [])

  const handlePinMessage = useCallback(async (message: Message) => {
    if (!roomId || !message.id) return
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('wuzz_auth_token') || '' : ''
      const res = await fetch('/api/messages/pin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          conversation_id: roomId,
          message_id: message.id,
          duration_hours: 0,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.pinned) {
          setPinnedMessages((prev) => {
            const filtered = prev.filter((p) => p.message_id !== message.id)
            return [data.pinned as PinnedMessage, ...filtered].slice(0, 3)
          })
        }
      } else {
        const err = await res.json().catch(() => ({}))
        alert(err.error || 'Gagal menyematkan pesan')
      }
    } catch {
      alert('Terjadi kesalahan saat menyematkan pesan')
    }
  }, [roomId])

  const handleUnpinMessage = useCallback(async (messageId: string) => {
    if (!roomId || !messageId) return
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('wuzz_auth_token') || '' : ''
      const res = await fetch('/api/messages/unpin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          conversation_id: roomId,
          message_id: messageId,
        }),
      })
      if (res.ok) {
        setPinnedMessages((prev) => prev.filter((p) => p.message_id !== messageId && p.id !== messageId))
      }
    } catch {}
  }, [roomId])

  const handleJumpToMessage = useCallback((messageId: string) => {
    const el = document.getElementById(`msg-${messageId}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.remove('msg-highlight-glow')
      void el.offsetWidth
      el.classList.add('msg-highlight-glow')
      setTimeout(() => {
        el.classList.remove('msg-highlight-glow')
      }, 2400)
    }
  }, [])

  const scrollToSearchMatch = useCallback((targetId: string) => {
    if (typeof document === 'undefined') return
    document.querySelectorAll('.msg-search-highlight').forEach((el) => {
      el.classList.remove('msg-search-highlight')
    })
    const el = document.getElementById(`msg-${targetId}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.add('msg-search-highlight')
    }
  }, [])

  const handleSearchChange = useCallback((q: string) => {
    setSearchQuery(q)
    const qLower = q.trim().toLowerCase()
    if (!qLower) {
      setSearchResults([])
      setSearchIndex(0)
      if (typeof document !== 'undefined') {
        document.querySelectorAll('.msg-search-highlight').forEach((el) => {
          el.classList.remove('msg-search-highlight')
        })
      }
      return
    }

    const matches = state.messages
      .filter((m) => !m.is_deleted && m.content?.toLowerCase().includes(qLower))
      .map((m) => m.id!)
      .filter(Boolean)

    setSearchResults(matches)
    setSearchIndex(0)
    if (matches.length > 0) {
      scrollToSearchMatch(matches[0])
    } else if (typeof document !== 'undefined') {
      document.querySelectorAll('.msg-search-highlight').forEach((el) => {
        el.classList.remove('msg-search-highlight')
      })
    }
  }, [state.messages, scrollToSearchMatch])

  const handleNextSearchMatch = useCallback(() => {
    if (searchResults.length === 0) return
    const nextIdx = (searchIndex + 1) % searchResults.length
    setSearchIndex(nextIdx)
    scrollToSearchMatch(searchResults[nextIdx])
  }, [searchResults, searchIndex, scrollToSearchMatch])

  const handlePrevSearchMatch = useCallback(() => {
    if (searchResults.length === 0) return
    const prevIdx = (searchIndex - 1 + searchResults.length) % searchResults.length
    setSearchIndex(prevIdx)
    scrollToSearchMatch(searchResults[prevIdx])
  }, [searchResults, searchIndex, scrollToSearchMatch])

  const handleCloseSearch = useCallback(() => {
    setIsSearching(false)
    setSearchQuery('')
    setSearchResults([])
    setSearchIndex(0)
    if (typeof document !== 'undefined') {
      document.querySelectorAll('.msg-search-highlight').forEach((el) => {
        el.classList.remove('msg-search-highlight')
      })
    }
  }, [])

  // ----------------------------------------------------------------
  // 1. Efek Perpindahan Ruang Obrolan (Room Switcher): 0ms Load & Join
  //    Dijalankan saat `roomId` berubah TANPA disconnect WebSocket!
  // ----------------------------------------------------------------
  useEffect(() => {
    if (!roomId) {
      dispatch({ type: 'SET_MESSAGES', payload: [] })
      dispatch({ type: 'SET_ROOM_USERS', payload: [] })
      dispatch({ type: 'SET_PEER_INFO', payload: { nickname: '', avatarUrl: '', userId: '' } })
      setReplyingTo(null)
      setEditingMessage(null)
      setLightboxData(null)
      setIsMemberListOpen(false)
      setIsLoadingHistory(false)
      setIsHistoryError(false)
      return
    }

    const nickname = user?.display_name || user?.username || ''

    // Reset pesan & UI state saat berpindah room
    dispatch({ type: 'SET_MESSAGES', payload: [] })
    dispatch({ type: 'SET_ROOM_USERS', payload: [] })
    dispatch({ type: 'SET_PEER_INFO', payload: { nickname: '', avatarUrl: '', userId: '' } })
    setReplyingTo(null)
    setEditingMessage(null)
    setLightboxData(null)
    setIsMemberListOpen(false)
    setIsLoadingHistory(true)
    setIsHistoryError(false)
    setPinnedMessages([])
    setIsSearching(false)
    setSearchQuery('')
    setSearchResults([])
    setSearchIndex(0)
    fetchPinnedMessages(roomId)

    // Cache-First Instant Load: Baca riwayat pesan dari IndexedDB lokal (0ms)
    getCachedMessages(roomId).then((cached) => {
      if (cached.length > 0 && roomIdRef.current === roomId) {
        const cachedMsgs: Message[] = cached.map((c: CachedMessageRecord) => ({
          id: c.id,
          room_id: c.room_id,
          conversation_id: c.room_id,
          content: c.content,
          sender_id: c.sender_id,
          from: c.sender_id,
          nickname: c.sender_display_name || c.sender_username || '',
          display_name: c.sender_display_name,
          username: c.sender_username,
          avatar_url: c.sender_avatar_url,
          created_at: c.created_at,
          status: c.status as Message['status'],
          type: c.type as Message['type'],
          media_url: c.media_url,
          media_mime_type: c.media_mime_type,
          media_file_name: c.media_file_name,
          media_size: c.media_size,
          reply_to: c.reply_to
            ? {
                id: c.reply_to.id,
                content: c.reply_to.content,
                sender_id: c.reply_to.sender_id,
                nickname: c.reply_to.sender_display_name || '',
              }
            : undefined,
          reactions: c.reactions as Message['reactions'],
        }))
        dispatch({ type: 'SET_MESSAGES', payload: cachedMsgs })
      }
    }).catch(() => {})

    if (privateGroupDenied?.id === roomId) {
      setIsLoadingHistory(false)
      setIsHistoryError(false)
      return
    }

    if (historyTimeoutRef.current) clearTimeout(historyTimeoutRef.current)
    historyTimeoutRef.current = setTimeout(() => {
      setIsLoadingHistory(false)
      setIsHistoryError(true)
    }, 7500)

    // Bergabung ke room di WebSocket yang sedang aktif (0ms reconnect!)
    if (clientRef.current) {
      if (roomId.startsWith('grp_') && groupDetails?.is_public && !groupDetails?.my_role) {
        // Sedang menunggu konfirmasi pratinjau grup publik
        return
      }
      if (privateGroupDenied?.id === roomId) {
        // Akses ditolak: grup privat dan bukan anggota
        return
      }
      getLastCachedMessageTimestamp(roomId).then(sinceTimestamp => {
        clientRef.current?.send({
          type: 'join',
          nickname,
          room: roomId,
          since: sinceTimestamp,
        })
      }).catch(() => {
        clientRef.current?.send({
          type: 'join',
          nickname,
          room: roomId,
        })
      })

      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        clientRef.current.send({
          type: 'receipt',
          room: roomId,
          status: 'read',
        })
      }
    }
  }, [roomId, user?.display_name, user?.username, privateGroupDenied])

  // ----------------------------------------------------------------
  // 2. Efek Tunggal Inisialisasi WebSocket (Single Connection Lifecycle)
  //    Dibuat satu kali saat login & E2EE valid; bebas dari re-connect saat ganti room.
  // ----------------------------------------------------------------
  useEffect(() => {
    if (isAuthLoading) return

    if (!user) {
      const currentRoom = roomIdRef.current
      const targetUrl = currentRoom ? `/login?room=${encodeURIComponent(currentRoom)}` : '/login'
      if (typeof window !== 'undefined') {
        window.location.href = targetUrl
      } else {
        router.replace(targetUrl)
      }
      return
    }

    // STRICT GATEKEEPER: Tahan inisialisasi WebSocket sampai kunci E2EE terverifikasi sah!
    if (!e2eeVerified || deviceConflict.isOpen) {
      return
    }

    const nickname = user.display_name || user.username

    const token = typeof window !== 'undefined' ? localStorage.getItem('wuzz_auth_token') || '' : ''
    const customWsBase = process.env.NEXT_PUBLIC_WS_URL
    let wsEndpoint = ''
    if (customWsBase) {
      wsEndpoint = customWsBase
    } else {
      const protocol = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      wsEndpoint = `${protocol}//${typeof window !== 'undefined' ? window.location.host : 'localhost:3047'}/ws`
    }
    const deviceId = getOrCreateDeviceId()
    const wsUrl = `${wsEndpoint}${wsEndpoint.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}&device_id=${encodeURIComponent(deviceId)}`
    const client = new WsClient(wsUrl)
    clientRef.current = client

    // Subscribe status
    client.onStatus(status => {
      dispatch({ type: 'SET_STATUS', payload: status })

      if (status === 'connected') {
        const currentRoom = roomIdRef.current || ''
        dispatch({
          type: 'SET_SESSION',
          payload: {
            clientId: user.id || nickname,
            nickname,
            peerId: currentRoom,
          },
        })
        const sendJoin = (sinceTimestamp?: string) => {
          client.send({
            type: 'join',
            nickname,
            room: currentRoom,
            since: sinceTimestamp,
          })
        }
        if (currentRoom) {
          getLastCachedMessageTimestamp(currentRoom).then(sendJoin).catch(() => sendJoin())
        } else {
          sendJoin()
        }

        if (currentRoom && typeof document !== 'undefined' && document.visibilityState === 'visible') {
          client.send({
            type: 'receipt',
            room: currentRoom,
            status: 'read',
          })
        }
      }
    })

    // Subscribe pesan masuk
    client.onMessage(msg => {
      const currentRoom = roomIdRef.current || ''
      switch (msg.type) {
        case 'system': {
          if (msg.content?.includes('SESSION_REPLACED')) {
            client.destroy()
            setDeviceConflict({
              isOpen: true,
              isRotated: true,
            })
            return
          }

          const idMatch = msg.content?.match(/ID kamu: ([a-f0-9-]{36})/i)
          const isInitialWelcome = Boolean(idMatch || (msg.content && msg.content.includes('ID kamu:')))
          const clientId = idMatch ? idMatch[1] : (msg.to && msg.to !== 'server' && /^[a-f0-9-]{36}$/i.test(msg.to) ? msg.to : '')
          if (clientId && isInitialWelcome) {
            dispatch({
              type: 'SET_SESSION',
              payload: {
                clientId,
                nickname,
                peerId: currentRoom,
              },
            })
            break
          }

          // Notifikasi aktivitas sistem grup (member joined, member removed, role updated, info updated)
          if (msg.room && msg.content && !isInitialWelcome) {
            const systemMsg: Message = {
              id: msg.id || `sys-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
              room: msg.room,
              from: 'server',
              nickname: 'Sistem',
              content: msg.content,
              timestamp: msg.timestamp || new Date().toISOString(),
              type: 'system',
              status: 'delivered',
            }

            if (currentRoom && msg.room === currentRoom) {
              dispatch({ type: 'ADD_MESSAGE', payload: systemMsg })
              setLastIncomingMessage(systemMsg)

              // Jika berada di dalam room grup, refresh detail grup & anggota
              if (msg.room.startsWith('grp_') || msg.room.startsWith('sub_')) {
                fetchGroupDetailsRef.current?.(msg.room)
              }

              // Simpan ke IndexedDB lokal
              cacheMessage(toCachedRecord({
                id: systemMsg.id!,
                room_id: msg.room,
                content: systemMsg.content || '',
                sender_id: 'server',
                sender_display_name: 'Sistem',
                sender_username: 'system',
                created_at: systemMsg.timestamp || new Date().toISOString(),
                status: 'delivered',
                type: 'system',
              })).catch(() => {})
            } else {
              setLastIncomingMessage(systemMsg)
            }
          }
          break
        }

        case 'room_users': {
          if (msg.users && currentRoom && (msg.room === currentRoom || !msg.room)) {
            dispatch({ type: 'SET_ROOM_USERS', payload: msg.users })
            const myUserId = state.session?.clientId || user?.id
            const otherUsers = msg.users.filter(u => myUserId ? u.id !== myUserId : u.nickname !== nickname)
            if (otherUsers.length === 1) {
              dispatch({
                type: 'SET_PEER_INFO',
                payload: {
                  nickname: otherUsers[0].nickname,
                  avatarUrl: otherUsers[0].avatar_url || '',
                  userId: otherUsers[0].id || '',
                },
              })
              if (otherUsers[0].id) {
                resolvePeerKeyAndDecrypt(otherUsers[0].id)
              }
            } else if (otherUsers.length > 1) {
              dispatch({ type: 'SET_PEER_NICKNAME', payload: `${otherUsers.length} Peserta` })
            }
          }
          break
        }

        case 'history': {
          if (historyTimeoutRef.current) clearTimeout(historyTimeoutRef.current)
          setIsLoadingHistory(false)
          setIsHistoryError(false)

          if (currentRoom && (msg.room === currentRoom || !msg.room)) {
            const rawMessages = msg.messages || []

            const processHistory = async () => {
              let key = roomAESKeyRef.current
              if (!key && user?.id && activePeerRef.current?.id && activePeerRef.current?.publicKey) {
                key = await getSharedRoomAESKey(user.id, activePeerRef.current.id, activePeerRef.current.publicKey, currentRoom)
                roomAESKeyRef.current = key
              }

              // SAFE-MERGE DENGAN INDEXEDDB CACHE (E2EE Continuity Protection & Delta Sync):
              // Ambil cache pesan lokal yang tersimpan dalam status terdekripsi
              const localCachedList = await getCachedMessages(currentRoom).catch(() => [])

              // Jika respons history kosong dan kita sudah punya pesan di cache lokal:
              // Ini berarti tidak ada pesan baru sejak checkpoint `since` -> pertahankan riwayat yang ada
              if (rawMessages.length === 0 && localCachedList.length > 0) {
                return
              }

              const localCacheMap = new Map<string, string>()
              localCachedList.forEach(c => {
                if (c.content && c.content !== '🔒 [Pesan Terenkripsi]') {
                  localCacheMap.set(c.id, c.content)
                }
              })

              const decryptedList = await Promise.all(
                rawMessages.map(async (m: Message) => {
                  const dec = await decryptSingleMessage(m, key)
                  // JIKA server history gagal didekripsi (misal lawan bicara ganti kunci perangkat),
                  // TETAPI kita punya teks aslinya di IndexedDB lokal:
                  // PERTAHANKAN TEKS ASLI DARI CACHE LOKAL!
                  if (dec.content === '🔒 [Pesan Terenkripsi]' && dec.id && localCacheMap.has(dec.id)) {
                    dec.content = localCacheMap.get(dec.id)!
                  }
                  return dec
                })
              )

              // Gabungkan pesan lokal dengan pesan delta baru dari server (Anti-Overwriting Delta Sync)
              const messageMap = new Map<string, Message>()
              localCachedList.forEach(c => {
                messageMap.set(c.id, {
                  id: c.id,
                  room: c.room_id,
                  type: (c.type === 'text' ? 'message' : c.type) as MessageType,
                  from: c.sender_id,
                  nickname: c.sender_display_name || c.sender_username,
                  content: c.content,
                  timestamp: c.created_at,
                  status: c.status as MessageReceiptStatus,
                  media_url: c.media_url,
                  media_type: c.media_mime_type,
                  file_name: c.media_file_name,
                  file_size: c.media_size,
                  reply_to: c.reply_to ? {
                    id: c.reply_to.id,
                    nickname: c.reply_to.sender_display_name || '',
                    content: c.reply_to.content,
                  } : undefined,
                  reactions: c.reactions ? Object.entries(c.reactions).map(([emoji, users]) => ({
                    emoji,
                    users,
                    count: users.length,
                  })) : undefined,
                })
              })

              decryptedList.forEach(m => {
                if (m.id) {
                  messageMap.set(m.id, m)
                }
              })

              const finalList = Array.from(messageMap.values())
              finalList.sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''))

              dispatch({ type: 'SET_MESSAGES', payload: finalList })

              // Write-Through ke IndexedDB
              const toCache = decryptedList
                .filter((m: Message) => m.id && m.content && m.content !== '🔒 [Pesan Terenkripsi]')
                .map((m: Message) => toCachedRecord({
                  id: m.id!,
                  room_id: currentRoom,
                  content: m.content || '',
                  sender_id: m.from || '',
                  sender_display_name: m.nickname || '',
                  sender_username: m.nickname || '',
                  created_at: m.timestamp || new Date().toISOString(),
                  status: m.status || 'sent',
                  type: (m.type === 'message' ? 'text' : m.type) || 'text',
                  media_url: m.media_url,
                  media_mime_type: m.media_type,
                  media_file_name: m.file_name,
                  media_size: m.file_size,
                  reply_to: m.reply_to
                    ? {
                        id: m.reply_to.id,
                        content: m.reply_to.content,
                        sender_id: '',
                        sender_display_name: m.reply_to.nickname,
                      }
                    : undefined,
                  reactions: m.reactions
                    ? Object.fromEntries(m.reactions.map(r => [r.emoji, r.users]))
                    : undefined,
                }))
              if (toCache.length > 0) {
                cacheMessages(toCache).catch(() => {})
              }
            }

            processHistory()

            if (msg.messages && msg.messages.length > 0) {
              const myUserId = state.session?.clientId || user?.id
              const otherMsg = msg.messages.slice().reverse().find((m: Message) => {
                const senderId = m.from || m.sender_id
                // UUID-first: selalu bandingkan menggunakan senderId vs myUserId (UUID)
                // Jika senderId tidak ada (data legacy), skip pesan tersebut
                if (!senderId || !myUserId) return false
                return senderId !== myUserId
              })
              // JANGAN menimpa peerNickname jika sudah diketahui dari percakapan / profil database
              if (otherMsg && otherMsg.nickname && !peerInfoRef.current.nickname) {
                dispatch({ type: 'SET_PEER_NICKNAME', payload: otherMsg.nickname })
              }

              if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
                client.send({
                  type: 'receipt',
                  room: currentRoom,
                  status: 'read',
                })
              }
            }
          }
          break
        }

        case 'receipt': {
          if (currentRoom && (msg.room === currentRoom || !msg.room)) {
            setLastIncomingMessage(msg)
            if (msg.status) {
              dispatch({
                type: 'UPDATE_MESSAGE_STATUS',
                payload: { id: msg.id, status: msg.status },
              })
              if (msg.id) {
                updateCachedMessageStatus(msg.id, msg.status).catch(() => {})
              }
            }
          }
          break
        }

        case 'reaction': {
          if (msg.id && msg.reactions) {
            dispatch({
              type: 'UPDATE_MESSAGE_REACTIONS',
              payload: { id: msg.id, reactions: msg.reactions },
            })
            const myUserId = state.session?.clientId || user?.id
            const isFromOther = (msg.from && myUserId)
              ? msg.from !== myUserId
              : Boolean(msg.nickname && msg.nickname !== nickname)
            if (isFromOther) {
              soundManager.playReceive()
            }
          }
          break
        }

        case 'message': {
          if (currentRoom && msg.room === currentRoom) {
            if (historyTimeoutRef.current) clearTimeout(historyTimeoutRef.current)
            setIsLoadingHistory(false)
            setIsHistoryError(false)

            const processIncomingMsg = async () => {
              let key = roomAESKeyRef.current
              if (!key && user?.id && activePeerRef.current?.id && activePeerRef.current?.publicKey) {
                key = await getSharedRoomAESKey(user.id, activePeerRef.current.id, activePeerRef.current.publicKey, currentRoom)
                roomAESKeyRef.current = key
              }

              const decryptedMsg = await decryptSingleMessage(msg, key)
              dispatch({ type: 'ADD_MESSAGE', payload: decryptedMsg })
              setLastIncomingMessage(decryptedMsg)

              if (decryptedMsg.id && decryptedMsg.content && decryptedMsg.content !== '🔒 [Pesan Terenkripsi]') {
                cacheMessage(toCachedRecord({
                  id: decryptedMsg.id,
                  room_id: currentRoom,
                  content: decryptedMsg.content || '',
                  sender_id: decryptedMsg.from || '',
                  sender_display_name: decryptedMsg.nickname || '',
                  sender_username: decryptedMsg.nickname || '',
                  created_at: decryptedMsg.timestamp || new Date().toISOString(),
                  status: decryptedMsg.status || 'sent',
                  type: (decryptedMsg.type === 'message' ? 'text' : decryptedMsg.type) || 'text',
                  media_url: decryptedMsg.media_url,
                  media_mime_type: decryptedMsg.media_type,
                  media_file_name: decryptedMsg.file_name,
                  media_size: decryptedMsg.file_size,
                  reply_to: decryptedMsg.reply_to
                    ? {
                        id: decryptedMsg.reply_to.id,
                        content: decryptedMsg.reply_to.content,
                        sender_id: '',
                        sender_display_name: decryptedMsg.reply_to.nickname,
                      }
                    : undefined,
                  reactions: decryptedMsg.reactions
                    ? Object.fromEntries(decryptedMsg.reactions.map(r => [r.emoji, r.users]))
                    : undefined,
                })).catch(() => {})
              }
            }

            processIncomingMsg()

            const myUserId = state.session?.clientId || user?.id
            const incomingSenderId = msg.from || msg.sender_id
            const isFromPeer = (incomingSenderId && myUserId)
              ? incomingSenderId !== myUserId
              : Boolean(msg.nickname && msg.nickname !== nickname)

            if (isFromPeer && msg.nickname) {
              dispatch({ type: 'SET_PEER_NICKNAME', payload: msg.nickname })
            }
          } else {
            setLastIncomingMessage(msg)
          }

          const myUserId = state.session?.clientId || user?.id
          const incomingSenderId = msg.from || msg.sender_id
          const isFromPeer = (incomingSenderId && myUserId)
            ? incomingSenderId !== myUserId
            : Boolean(msg.nickname && msg.nickname !== nickname)

          if (isFromPeer && msg.id) {
            soundManager.playReceive()

            client.send({
              type: 'receipt',
              id: msg.id,
              room: msg.room || currentRoom,
              status: 'delivered',
            })

            if (currentRoom && msg.room === currentRoom && typeof document !== 'undefined' && document.visibilityState === 'visible') {
              client.send({
                type: 'receipt',
                id: msg.id,
                room: msg.room || currentRoom,
                status: 'read',
              })
            }
          }

          dispatch({ type: 'SET_PEER_TYPING', payload: { typing: false } })
          break
        }

        case 'typing': {
          if (currentRoom && msg.room === currentRoom) {
            dispatch({
              type: 'SET_PEER_TYPING',
              payload: { typing: true, nickname: msg.nickname || null },
            })
            if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
            typingTimerRef.current = setTimeout(() => {
              dispatch({ type: 'SET_PEER_TYPING', payload: { typing: false } })
            }, 2500)
          }
          break
        }

        case 'message_deleted': {
          if (msg.id) {
            dispatch({
              type: 'UPDATE_MESSAGE_DELETED',
              payload: { id: msg.id, content: msg.content },
            })
            updateCachedMessageStatus(msg.id, 'deleted').catch(() => {})
          }
          break
        }

        case 'message_edited': {
          const editId = msg.id
          const editContent = msg.new_content || msg.content
          if (editId && editContent) {
            dispatch({
              type: 'EDIT_MESSAGE',
              payload: { id: editId, newContent: editContent, editedAt: msg.edited_at },
            })
            updateMessageContentInCache(editId, editContent, msg.edited_at).catch(() => {})
          }
          break
        }

        case 'message_pinned': {
          if (msg.room === currentRoom && msg.pinned) {
            setPinnedMessages((prev) => {
              const newPin = msg.pinned as PinnedMessage
              const filtered = prev.filter((p) => p.message_id !== newPin.message_id && p.id !== newPin.id)
              return [newPin, ...filtered].slice(0, 3)
            })
          }
          break
        }

        case 'message_unpinned': {
          if (msg.room === currentRoom && msg.id) {
            setPinnedMessages((prev) => prev.filter((p) => p.message_id !== msg.id && p.id !== msg.id))
          }
          break
        }

        case 'leave': {
          dispatch({ type: 'SET_PEER_TYPING', payload: { typing: false } })
          break
        }

        case 'call_offer': {
          const currentCall = activeCallRef.current
          if (currentCall && currentCall.status !== 'ended' && currentCall.status !== 'idle') {
            client.send({
              type: 'call_busy',
              room: msg.room || currentRoom,
            })
            break
          }
          pendingOfferSdpRef.current = msg.sdp || null
          setActiveCall({
            room: msg.room || currentRoom,
            peerId: msg.from || state.peerUserId || msg.nickname || '',
            peerNickname: msg.nickname || 'Pengguna',
            mediaType: 'audio',
            isCaller: false,
            status: 'incoming_ringing',
          })
          playIncomingRing()
          break
        }

        case 'call_answer': {
          stopCallSounds()
          if (msg.sdp && webrtcAudioRef.current) {
            webrtcAudioRef.current.handleAnswer(msg.sdp).catch((err: unknown) => {
              console.error('[WebRTC] Gagal proses remote answer:', err)
            })
          }
          setActiveCall(prev => (prev ? { ...prev, status: 'connected', startTime: Date.now() } : null))
          break
        }

        case 'ice_candidate': {
          if (msg.candidate) {
            if (webrtcAudioRef.current) {
              webrtcAudioRef.current.addIceCandidate(msg.candidate).catch((err: unknown) => {
                console.error('[WebRTC] Gagal proses ICE candidate:', err)
              })
            } else {
              earlyIceCandidatesRef.current.push(msg.candidate)
            }
          }
          break
        }

        case 'call_reject': {
          stopCallSounds()
          earlyIceCandidatesRef.current = []
          if (webrtcAudioRef.current) {
            webrtcAudioRef.current.cleanup()
            webrtcAudioRef.current = null
          }
          setActiveCall(prev => (prev ? { ...prev, status: 'ended' } : null))
          setTimeout(() => {
            setActiveCall(null)
          }, 1500)
          break
        }

        case 'call_end': {
          stopCallSounds()
          earlyIceCandidatesRef.current = []
          if (webrtcAudioRef.current) {
            webrtcAudioRef.current.cleanup()
            webrtcAudioRef.current = null
          }
          setActiveCall(prev => (prev ? { ...prev, status: 'ended' } : null))
          setTimeout(() => {
            setActiveCall(null)
          }, 1200)
          break
        }

        case 'call_busy': {
          stopCallSounds()
          if (webrtcAudioRef.current) {
            webrtcAudioRef.current.cleanup()
            webrtcAudioRef.current = null
          }
          setActiveCall(prev => (prev ? { ...prev, status: 'ended' } : null))
          alert('Pengguna sedang sibuk dalam panggilan lain.')
          setTimeout(() => {
            setActiveCall(null)
          }, 1500)
          break
        }
      }
    })

    const handleVisibilityChange = () => {
      const currentRoom = roomIdRef.current
      if (typeof document !== 'undefined' && document.visibilityState === 'visible' && currentRoom && clientRef.current) {
        clientRef.current.send({
          type: 'receipt',
          room: currentRoom,
          status: 'read',
        })
      }
    }

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange)
    }

    client.connect()

    return () => {
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange)
      }
      client.destroy()
      clientRef.current = null
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
      if (historyTimeoutRef.current) clearTimeout(historyTimeoutRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthLoading, user?.id, user?.display_name, user?.username, e2eeVerified, deviceConflict.isOpen, resolvePeerKeyAndDecrypt])

  // Muat detail judul percakapan / kontak & kunci E2EE lawan bicara saat room berubah
  useEffect(() => {
    if (!roomId || !user?.id) {
      dispatch({ type: 'SET_PEER_NICKNAME', payload: '' })
      setPeerPublicKeyJWK('')
      roomAESKeyRef.current = null
      activePeerRef.current = null
      return
    }

    // Resolusi instan dari roomId jika berbentuk dm_userA_userB
    if (roomId.startsWith('dm_')) {
      const parts = roomId.replace('dm_', '').split('_')
      if (parts.length === 2) {
        const potentialPeerId = parts[0] === user.id ? parts[1] : parts[0]
        if (potentialPeerId) {
          dispatch({ type: 'SET_PEER_INFO', payload: { userId: potentialPeerId } })
          resolvePeerKeyAndDecrypt(potentialPeerId)
          // Selalu periksa data profil terbaru dari server
          apiRequest<User>(`/api/users/profile?id=${encodeURIComponent(potentialPeerId)}`).then(({ data: profile }) => {
            if (profile) {
              dispatch({
                type: 'SET_PEER_INFO',
                payload: {
                  nickname: profile.display_name || profile.username,
                  avatarUrl: profile.avatar_url || '',
                  userId: profile.id,
                },
              })
            }
          }).catch(() => {})
        }
      }
    }

    apiRequest<ConversationItem[]>('/api/conversations').then(async ({ data }) => {
      if (data && Array.isArray(data)) {
        const found = data.find(c => c.id === roomId)
        if (found) {
          dispatch({
            type: 'SET_PEER_INFO',
            payload: {
              nickname: found.title || found.peer_nickname || '',
              avatarUrl: found.peer_avatar_url || '',
              userId: found.peer_id || '',
              isVerified: found.peer_is_verified || false,
            },
          })

          if (found.peer_id) {
            resolvePeerKeyAndDecrypt(found.peer_id, found.peer_public_key)
            // Segarkan profil lawan bicara di background agar nama & foto selalu 100% sinkron
            apiRequest<User>(`/api/users/profile?id=${encodeURIComponent(found.peer_id)}`).then(({ data: profile }) => {
              if (profile) {
                dispatch({
                  type: 'SET_PEER_INFO',
                  payload: {
                    nickname: profile.display_name || profile.username,
                    avatarUrl: profile.avatar_url || '',
                    userId: profile.id,
                    isVerified: profile.is_verified || false,
                  },
                })
              }
            }).catch(() => {})
          }
        }
      }
    })
  }, [roomId, user?.id, resolvePeerKeyAndDecrypt])

  const [lightboxData, setLightboxData] = useState<{ url: string; fileName?: string } | null>(null)
  const [draggedFile, setDraggedFile] = useState<File | null>(null)
  const [isDraggingOver, setIsDraggingOver] = useState(false)

  // Callback untuk mencoba ulang sinkronisasi riwayat pesan
  const handleRetryHistory = useCallback(() => {
    if (!roomId || !user) return
    if (privateGroupDenied?.id === roomId) return
    setIsLoadingHistory(true)
    setIsHistoryError(false)

    if (historyTimeoutRef.current) clearTimeout(historyTimeoutRef.current)
    historyTimeoutRef.current = setTimeout(() => {
      setIsLoadingHistory(false)
      setIsHistoryError(true)
    }, 7500)

    const nickname = user.display_name || user.username
    clientRef.current?.send({
      type: 'join',
      nickname,
      room: roomId,
    })
  }, [roomId, user, privateGroupDenied])

  const handleDeleteMessage = useCallback(async (messageId: string, type: 'for_me' | 'for_everyone') => {
    try {
      const res = await deleteMessageApi(messageId, type)
      if (res.error) {
        alert(res.error)
        return
      }
      if (type === 'for_me') {
        dispatch({ type: 'DELETE_MESSAGE_LOCAL', payload: { id: messageId } })
        // Write-Through: hapus dari cache IndexedDB (hanya untuk saya)
        deleteCachedMessage(messageId).catch(() => {})
      } else {
        dispatch({ type: 'UPDATE_MESSAGE_DELETED', payload: { id: messageId } })
        // Write-Through: tandai sebagai deleted di cache (hapus untuk semua)
        updateCachedMessageStatus(messageId, 'deleted').catch(() => {})
      }
    } catch (err: any) {
      alert(err.message || 'Gagal menghapus pesan')
    }
  }, [])

  const handleSaveEdit = useCallback(async (messageId: string, newContent: string) => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('wuzz_auth_token') : null
      const res = await fetch('/api/messages/edit', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message_id: messageId, new_content: newContent }),
        signal: AbortSignal.timeout(15000),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Gagal mengedit pesan')
      }
      const data = await res.json()
      dispatch({
        type: 'EDIT_MESSAGE',
        payload: { id: messageId, newContent: data.new_content || newContent, editedAt: data.edited_at },
      })
      updateMessageContentInCache(messageId, data.new_content || newContent, data.edited_at).catch(() => {})
      setEditingMessage(null)
    } catch (err: any) {
      alert(err.message || 'Gagal mengedit pesan')
      throw err
    }
  }, [])

  const handleOpenForward = useCallback(async (msg: Message) => {
    setForwardingMessage(msg)
    try {
      const { data } = await apiRequest<ConversationItem[]>('/api/conversations')
      if (data && Array.isArray(data)) {
        setForwardConversations(data)
      }
    } catch (err) {
      console.error('Failed to load conversations for forward:', err)
    }
  }, [])

  const handleForwardMessage = useCallback(async (messageId: string, targetRoomIds: string[]) => {
    // Ambil plaintext dari pesan yang sedang di-forward.
    // message.content sudah berisi teks ter-decrypt (dirender di UI).
    // message.raw_content adalah ciphertext asli — jika berbeda dari content, berarti sudah berhasil di-decrypt.
    // Kirim plaintext ini ke backend agar tidak menyalin ciphertext E2EE antar room yang berbeda kunci AES-nya.
    const plaintextContent = forwardingMessage?.content || ''

    const { data, error } = await apiRequest<{ success: boolean; messages: any[] }>('/api/messages/forward', {
      method: 'POST',
      body: JSON.stringify({
        message_id: messageId,
        target_room_ids: targetRoomIds,
        plaintext_content: plaintextContent, // plaintext override — fix E2EE cross-room forward bug
      }),
    })
    if (error) {
      throw new Error(error)
    }
    if (data?.messages && Array.isArray(data.messages)) {
      for (const m of data.messages) {
        if (m.room_id === roomId) {
          dispatch({
            type: 'ADD_MESSAGE',
            payload: {
              id: m.id,
              type: 'message',
              from: m.from_id,
              nickname: m.nickname,
              room: m.room_id,
              content: m.content,
              status: m.status || 'sent',
              media_url: m.media_url,
              media_type: m.media_type,
              file_name: m.file_name,
              file_size: m.file_size,
              media_status: m.media_status,
              is_forwarded: true,
              timestamp: m.timestamp,
            },
          })
        }
      }
    }
  }, [roomId, forwardingMessage])

  const handleSend = useCallback(async (content: string, media?: { url: string; media_type: string; file_name: string; file_size: number }, mentions?: string[]) => {
    if (!roomId) return
    const session = state.session
    const msgId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'msg-' + Date.now()

    let outgoingContent = content
    const isGroupChat = roomId.startsWith('grp_') || roomId.startsWith('sub_') || roomId.startsWith('room-')

    // Fail-Closed Write Gate di Frontend jika subgrup kedaluwarsa
    if (groupDetails?.status === 'expired') {
      alert('Topik forum ini telah kedaluwarsa dan terkunci. Pesan tidak dapat dikirim.')
      return
    }

    // Enkripsi pesan teks via AES-256-GCM jika percakapan E2EE direct aktif (bukan grup)
    let key = roomAESKeyRef.current
    if (!isGroupChat && !key && user?.id && activePeerRef.current?.id && activePeerRef.current?.publicKey) {
      key = await getSharedRoomAESKey(user.id, activePeerRef.current.id, activePeerRef.current.publicKey, roomId)
      roomAESKeyRef.current = key
    }

    // Fail-Closed Guard: Jika percakapan direct dan key tidak dapat dibuat, jangan kirim pesan!
    if (!isGroupChat && activePeerRef.current?.id && !key) {
      alert('Sesi enkripsi pada perangkat ini belum valid. Pesan tidak dikirim demi melindungi keamanan E2EE Anda.')
      setDeviceConflict({ isOpen: true, isRotated: false })
      return
    }

    if (!isGroupChat && key && content && content.trim() !== '') {
      try {
        outgoingContent = await encryptText(key, content)
      } catch (err) {
        console.warn('[E2EE] Enkripsi pesan gagal:', err)
        alert('Gagal mengenkripsi pesan. Pengiriman dibatalkan demi keamanan.')
        return
      }
    }

    const replyPayload = replyingTo
      ? {
          id: replyingTo.id || '',
          nickname: replyingTo.nickname || '',
          content: replyingTo.content || '',
        }
      : undefined

    clientRef.current?.send({
      id: msgId,
      type: 'message',
      content: outgoingContent,
      room: roomId,
      nickname: session?.nickname,
      reply_to: replyPayload,
      media_url: media?.url,
      media_type: media?.media_type,
      file_name: media?.file_name,
      file_size: media?.file_size,
      mentions: mentions,
    })

    // Mainkan suara pop pengiriman pesan
    soundManager.playSend()

    // Optimistic local render dengan teks asli (plaintext)
    if (session) {
      const localMsg: Message = {
        id: msgId,
        type: 'message',
        from: session.clientId,
        nickname: session.nickname,
        content,
        room: roomId,
        status: 'sent',
        reply_to: replyPayload,
        media_url: media?.url,
        media_type: media?.media_type,
        file_name: media?.file_name,
        file_size: media?.file_size,
        mentions: mentions,
        timestamp: new Date().toISOString(),
      }
      dispatch({
        type: 'ADD_MESSAGE',
        payload: localMsg,
      })
      setLastIncomingMessage(localMsg)

      // Write-Through: simpan pesan terkirim ke cache IndexedDB secara optimistic
      cacheMessage(toCachedRecord({
        id: msgId,
        room_id: roomId,
        content,
        sender_id: session.clientId,
        sender_display_name: session.nickname || '',
        sender_username: session.nickname || '',
        created_at: new Date().toISOString(),
        status: 'sent',
        type: media?.media_type ? media.media_type.split('/')[0] || 'text' : 'text',
        media_url: media?.url,
        media_mime_type: media?.media_type,
        media_file_name: media?.file_name,
        media_size: media?.file_size,
        reply_to: replyPayload
          ? {
              id: replyPayload.id,
              content: replyPayload.content,
              sender_id: '',
              sender_display_name: replyPayload.nickname,
            }
          : undefined,
      })).catch(() => {})
    }

    setReplyingTo(null)
  }, [state.session, roomId, replyingTo, user?.id])

  const handleTyping = useCallback(() => {
    if (!roomId) return
    clientRef.current?.send({
      type: 'typing',
      room: roomId,
      nickname: state.session?.nickname,
    })
  }, [roomId, state.session?.nickname])

  const handleReact = useCallback((messageId: string, emoji: string) => {
    if (!roomId) return
    clientRef.current?.send({
      type: 'reaction',
      room: roomId,
      reaction: {
        message_id: messageId,
        emoji,
      },
    })
  }, [roomId])

  // ----------------------------------------------------------------
  // WebRTC Audio Call Action Handlers
  // ----------------------------------------------------------------

  const handleEndCall = useCallback(() => {
    stopCallSounds()
    const call = activeCallRef.current
    if (call && clientRef.current) {
      clientRef.current.send({
        type: 'call_end',
        room: call.room,
      })
    }
    if (webrtcAudioRef.current) {
      webrtcAudioRef.current.cleanup()
      webrtcAudioRef.current = null
    }
    setActiveCall(prev => (prev ? { ...prev, status: 'ended' } : null))
    setTimeout(() => {
      setActiveCall(null)
    }, 1200)
  }, [])

  const handleStartAudioCall = useCallback(async () => {
    if (!roomId || !user?.id || !clientRef.current) return
    if (activeCallRef.current && activeCallRef.current.status !== 'idle' && activeCallRef.current.status !== 'ended') return

    const peerName = state.peerNickname || 'Teman Obrolan'
    const targetPeerId = state.peerUserId || activePeerRef.current?.id || peerName
    setActiveCall({
      room: roomId,
      peerId: targetPeerId,
      peerNickname: peerName,
      mediaType: 'audio',
      isCaller: true,
      status: 'outgoing_ringing',
    })
    setIsCallMuted(false)
    playOutgoingRing()

    try {
      const session = new WebRTCAudioSession(
        () => {
          // Audio remote stream auto-attached by WebRTCAudioSession
        },
        (connState: RTCPeerConnectionState) => {
          if (connState === 'connected') {
            stopCallSounds()
            setActiveCall(prev => (prev ? { ...prev, status: 'connected', startTime: prev.startTime || Date.now() } : null))
          } else if (connState === 'failed') {
            handleEndCall()
          }
        }
      )

      webrtcAudioRef.current = session
      const offerSdp = await session.createOffer((candidateJson: string) => {
        clientRef.current?.send({
          type: 'ice_candidate',
          room: roomId,
          candidate: candidateJson,
        })
      })

      clientRef.current.send({
        type: 'call_offer',
        room: roomId,
        nickname: user.display_name || user.username || 'Pengguna',
        sdp: offerSdp,
      })
    } catch (err) {
      console.error('[WebRTC] Start audio call error:', err)
      stopCallSounds()
      if (webrtcAudioRef.current) {
        webrtcAudioRef.current.cleanup()
        webrtcAudioRef.current = null
      }
      setActiveCall(null)
      alert('Gagal mengakses mikrofon untuk panggilan suara. Pastikan izin mikrofon telah diberikan pada browser.')
    }
  }, [roomId, user?.id, user?.display_name, user?.username, state.peerNickname, handleEndCall])

  const handleAcceptCall = useCallback(async () => {
    stopCallSounds()
    const call = activeCallRef.current
    if (!call || !clientRef.current || !pendingOfferSdpRef.current) return

    setActiveCall(prev => (prev ? { ...prev, status: 'connecting' } : null))
    setIsCallMuted(false)

    try {
      const session = new WebRTCAudioSession(
        () => {
          // Audio remote stream auto-attached by WebRTCAudioSession
        },
        (connState: RTCPeerConnectionState) => {
          if (connState === 'connected') {
            setActiveCall(prev => (prev ? { ...prev, status: 'connected', startTime: prev.startTime || Date.now() } : null))
          } else if (connState === 'failed') {
            handleEndCall()
          }
        }
      )

      webrtcAudioRef.current = session
      const answerSdp = await session.handleOfferAndCreateAnswer(
        pendingOfferSdpRef.current,
        (candidateJson: string) => {
          clientRef.current?.send({
            type: 'ice_candidate',
            room: call.room,
            candidate: candidateJson,
          })
        }
      )

      // Flush seluruh ICE candidate yang tiba sebelum tombol Terima ditekan
      if (earlyIceCandidatesRef.current.length > 0) {
        for (const earlyCand of earlyIceCandidatesRef.current) {
          session.addIceCandidate(earlyCand).catch((err: unknown) => {
            console.warn('[WebRTC] Gagal proses early candidate:', err)
          })
        }
        earlyIceCandidatesRef.current = []
      }

      clientRef.current.send({
        type: 'call_answer',
        room: call.room,
        nickname: user?.display_name || user?.username || 'Pengguna',
        sdp: answerSdp,
      })
      setActiveCall(prev => (prev ? { ...prev, status: 'connected', startTime: Date.now() } : null))
    } catch (err) {
      console.error('[WebRTC] Accept audio call error:', err)
      if (webrtcAudioRef.current) {
        webrtcAudioRef.current.cleanup()
        webrtcAudioRef.current = null
      }
      setActiveCall(null)
      alert('Gagal mengakses mikrofon untuk menerima panggilan.')
    }
  }, [user?.display_name, user?.username, handleEndCall])

  const handleRejectCall = useCallback(() => {
    stopCallSounds()
    const call = activeCallRef.current
    if (call && clientRef.current) {
      clientRef.current.send({
        type: 'call_reject',
        room: call.room,
      })
    }
    if (webrtcAudioRef.current) {
      webrtcAudioRef.current.cleanup()
      webrtcAudioRef.current = null
    }
    setActiveCall(null)
  }, [])

  const handleToggleCallMute = useCallback(() => {
    if (webrtcAudioRef.current) {
      setIsCallMuted(prev => {
        const next = !prev
        webrtcAudioRef.current?.setMute(next)
        return next
      })
    }
  }, [])

  const handleSelectRoom = (newRoomId: string) => {
    setLightboxData(null)
    setIsMemberListOpen(false)
    setReplyingTo(null)
    setPrivateGroupDenied(null)
    setSelectedRoomId(newRoomId)
    if (!newRoomId) {
      dispatch({ type: 'SET_MESSAGES', payload: [] })
      dispatch({ type: 'SET_PEER_INFO', payload: { nickname: '', avatarUrl: '', userId: '' } })
      dispatch({ type: 'SET_ROOM_USERS', payload: [] })
      roomAESKeyRef.current = null
      activePeerRef.current = null
      // Gunakan router.replace saat kembali ke home agar tidak menambah entry history.
      // Ini memastikan tombol Back langsung keluar dari halaman /chat, bukan looping balik ke home.
      router.replace('/chat')
    } else {
      // Gunakan router.push saat masuk ke room agar satu entry history = satu room.
      // JANGAN gunakan window.history.pushState bersamaan dengan router.push —
      // itu menyebabkan double-entry di history stack sehingga Back harus ditekan 2x.
      router.push(`/chat?room=${encodeURIComponent(newRoomId)}`)
    }
  }

  // Drag & drop file ke area chat
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!isDraggingOver) setIsDraggingOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.currentTarget === e.target) {
      setIsDraggingOver(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDraggingOver(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setDraggedFile(e.dataTransfer.files[0])
    }
  }

  if (isAuthLoading) {
    return (
      <div className="chat-app-container" style={{ alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg-primary)' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '2rem', marginBottom: 'var(--space-3)', animation: 'spin 1.5s linear infinite' }}>💬</div>
          <p>Memverifikasi sesi akun...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="chat-app-container" style={{ alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg-primary)' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 'var(--space-4)' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 'var(--space-3)' }}>🔒</div>
          <p style={{ marginBottom: 'var(--space-4)', color: 'var(--text-primary)', fontWeight: 500 }}>Sesi akun telah berakhir atau belum masuk.</p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              if (typeof window !== 'undefined') {
                window.location.href = '/login'
              }
            }}
          >
            Masuk ke Akun
          </button>
        </div>
      </div>
    )
  }

  // Hard Blocker: Jika terjadi konflik perangkat, kunci layar total dan jangan render chat UI
  if (deviceConflict.isOpen) {
    return (
      <div className="chat-app-container" style={{ alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg-primary)' }}>
        <DeviceConflictModal
          isOpen={deviceConflict.isOpen}
          isRotated={deviceConflict.isRotated}
          keyVersion={deviceConflict.keyVersion}
          currentUserId={user?.id || ''}
          onClose={() => setDeviceConflict({ isOpen: false })}
          onConfirmReset={handleConfirmDeviceReset}
          onLogout={handleDeviceConflictLogout}
          onTransferSuccess={() => {
            setDeviceConflict({ isOpen: false })
            if (typeof window !== 'undefined') {
              window.scrollTo(0, 0)
            }
            window.location.reload()
          }}
        />
      </div>
    )
  }

  const isConnected = state.status === 'connected'

  return (
    <div className={`chat-app-container ${roomId ? 'mobile-chat-active' : 'mobile-list-active'}`}>
      {/* Sidebar Obrolan & Kontak (Fullscreen di Mobile saat tidak ada chat aktif) */}
      <Sidebar
        activeRoomId={roomId}
        onSelectRoom={handleSelectRoom}
        isOpenMobile={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
        lastIncomingMessage={lastIncomingMessage}
      />

      {/* Main Chat Pane (Fullscreen di Mobile saat ada chat aktif) */}
      <main
        className={`chat-main-pane ${isDraggingOver ? 'chat-drag-over' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isDraggingOver && (
          <div className="chat-drag-overlay">
            <div className="drag-overlay-card">
              <span className="drag-overlay-icon">📥</span>
              <p className="drag-overlay-title">Lepaskan file di sini</p>
              <p className="drag-overlay-subtitle">File akan otomatis dilampirkan ke pesan</p>
            </div>
          </div>
        )}

        {roomId ? (
          privateGroupDenied?.id === roomId ? (
            <div 
              className="chat-window chat-status-center" 
              style={{ 
                padding: 'var(--space-4)', 
                flex: 1, 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                background: 'var(--bg-primary, #0b141a)',
                minHeight: '100%'
              }}
            >
              <div
                className="chat-sync-card error"
                style={{
                  maxWidth: '440px',
                  width: '100%',
                  padding: '36px 28px',
                  background: 'rgba(15, 23, 42, 0.94)',
                  backdropFilter: 'blur(20px)',
                  WebkitBackdropFilter: 'blur(20px)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '24px',
                  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 35px rgba(239, 68, 68, 0.15)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  textAlign: 'center',
                  gap: '18px',
                  animation: 'fadeIn 0.25s ease'
                }}
              >
                <div
                  style={{
                    width: '68px',
                    height: '68px',
                    borderRadius: '50%',
                    background: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid rgba(239, 68, 68, 0.35)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '2rem',
                    boxShadow: '0 0 24px rgba(239, 68, 68, 0.25)',
                  }}
                >
                  🔒
                </div>
                <div>
                  <h3 style={{ margin: '0 0 8px 0', fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Grup Ini Bersifat Privat
                  </h3>
                  <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                    Anda tidak dapat mengakses atau melihat pesan di dalam grup ini karena Anda bukan anggota. Untuk bergabung, minta admin atau pembuat grup untuk mengundang atau menambahkan Anda.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => handleSelectRoom('')}
                  style={{
                    marginTop: '8px',
                    padding: '12px 28px',
                    borderRadius: '14px',
                    fontWeight: 600,
                    fontSize: '0.95rem',
                    background: 'linear-gradient(135deg, var(--accent-500), var(--accent-secondary))',
                    boxShadow: '0 4px 16px rgba(59, 130, 246, 0.35)',
                    border: 'none',
                    color: '#fff',
                    cursor: 'pointer',
                    width: '100%',
                    maxWidth: '280px',
                  }}
                >
                  ← Kembali ke Beranda Obrolan
                </button>
              </div>
            </div>
          ) : (
            <>
              <StatusBar
                status={state.status}
                session={state.session}
                peerNickname={state.peerNickname}
                peerAvatarUrl={state.peerAvatarUrl || ''}
                peerUserId={state.peerUserId || ''}
                peerIsVerified={state.peerIsVerified || false}
                roomId={roomId}
                roomUsers={state.roomUsers}
                isPeerTyping={state.isPeerTyping}
                typingNickname={state.typingNickname}
                currentUserId={user?.id}
                peerPublicKeyJWK={peerPublicKeyJWK}
                isGroup={Boolean(roomId && (roomId.startsWith('grp_') || roomId.startsWith('sub_') || roomId.startsWith('room-')))}
                groupDetails={groupDetails}
                onOpenGroupInfo={() => setIsGroupInfoOpen(true)}
                onOpenMemberList={() => setIsMemberListOpen(true)}
                onOpenSubgroups={() => setIsSubGroupListOpen(true)}
                onBackToParent={() => {
                  if (groupDetails?.parent_id) {
                    handleSelectRoom(groupDetails.parent_id)
                  }
                }}
                parentGroupName={parentGroupName}
                onBack={() => handleSelectRoom('')}
                onStartAudioCall={handleStartAudioCall}
                isSearching={isSearching}
                searchQuery={searchQuery}
                searchMatchCount={searchResults.length}
                currentSearchIndex={searchIndex}
                onToggleSearch={() => setIsSearching((prev) => !prev)}
                onSearchChange={handleSearchChange}
                onNextSearchMatch={handleNextSearchMatch}
                onPrevSearchMatch={handlePrevSearchMatch}
                onCloseSearch={handleCloseSearch}
              />

              <ChatWindow
                messages={state.messages}
                selfId={state.session?.clientId || user.id || ''}
                selfNickname={state.session?.nickname ?? user.display_name ?? user.username ?? ''}
                isPeerTyping={state.isPeerTyping}
                typingNickname={state.typingNickname}
                isLoadingHistory={isLoadingHistory}
                isHistoryError={isHistoryError}
                isE2EE={Boolean(roomId && !roomId.startsWith('grp_') && !roomId.startsWith('sub_') && (roomId.startsWith('dm_') || !roomId.startsWith('room-')))}
                isDirectChat={Boolean(roomId && !roomId.startsWith('grp_') && !roomId.startsWith('sub_') && (roomId.startsWith('dm_') || !roomId.startsWith('room-')))}
                peerAvatarUrl={state.peerAvatarUrl || ''}
                peerNickname={state.peerNickname || ''}
                pinnedMessages={pinnedMessages}
                onPinMessage={handlePinMessage}
                onUnpinMessage={handleUnpinMessage}
                onJumpToMessage={handleJumpToMessage}
                onRetryHistory={handleRetryHistory}
                onReply={setReplyingTo}
                onReact={handleReact}
                onImageClick={(url, name) => setLightboxData({ url, fileName: name })}
                onDeleteMessage={handleDeleteMessage}
                onEditMessage={(msg) => setEditingMessage({ id: msg.id!, content: msg.content || '' })}
                onForwardMessage={handleOpenForward}
                members={groupDetails?.members}
              />

              <MessageInput
                onSend={handleSend}
                onTyping={handleTyping}
                disabled={!isConnected || groupDetails?.status === 'expired'}
                replyTo={replyingTo}
                onCancelReply={() => setReplyingTo(null)}
                editingMessage={editingMessage}
                onCancelEdit={() => setEditingMessage(null)}
                onSaveEdit={handleSaveEdit}
                stagedExternalFile={draggedFile}
                onClearStagedExternalFile={() => setDraggedFile(null)}
                members={groupDetails?.members}
                currentUserId={user?.id || state.session?.clientId || ''}
              />

              <MemberListModal
                isOpen={isMemberListOpen}
                onClose={() => setIsMemberListOpen(false)}
                users={state.roomUsers}
                currentNickname={state.session?.nickname}
                currentUserId={state.session?.clientId || user?.id}
                roomId={roomId}
              />

              <ImageLightboxModal
                isOpen={!!lightboxData}
                imageUrl={lightboxData?.url || ''}
                fileName={lightboxData?.fileName}
                onClose={() => setLightboxData(null)}
              />

              <GroupInfoDrawer
                isOpen={isGroupInfoOpen}
                onClose={() => setIsGroupInfoOpen(false)}
                groupId={roomId}
                currentUserId={user?.id || ''}
                onOpenSubgroups={() => setIsSubGroupListOpen(true)}
                onGroupUpdated={(updated) => {
                  setGroupDetails(updated)
                  dispatch({
                    type: 'SET_PEER_INFO',
                    payload: {
                      nickname: updated.title || updated.name || '',
                      avatarUrl: updated.avatar_url || '',
                      userId: '',
                    },
                  })
                }}
                onLeaveSuccess={() => {
                  handleSelectRoom('')
                }}
              />

              {/* Drawer Daftar Subgrup Aktif */}
              <SubGroupListDrawer
                isOpen={isSubGroupListOpen}
                onClose={() => setIsSubGroupListOpen(false)}
                parentGroupId={groupDetails?.parent_id ? groupDetails.parent_id : (roomId.startsWith('grp_') ? roomId : '')}
                parentGroupName={parentGroupName || groupDetails?.title || 'Grup Utama'}
                currentUserId={user?.id || ''}
                currentUserRole={groupDetails?.parent_id ? parentGroupRole : groupDetails?.my_role}
                onSelectSubGroup={(subId) => {
                  handleSelectRoom(subId)
                }}
                onOpenCreateModal={() => {
                  setIsCreateSubGroupOpen(true)
                }}
              />

              {/* Modal Pembuatan Subgrup Baru */}
              <CreateSubGroupModal
                isOpen={isCreateSubGroupOpen}
                onClose={() => setIsCreateSubGroupOpen(false)}
                parentGroupId={groupDetails?.parent_id ? groupDetails.parent_id : (roomId.startsWith('grp_') ? roomId : '')}
                parentGroupName={parentGroupName || groupDetails?.title || 'Grup Utama'}
                onSubGroupCreated={(newSubGroup) => {
                  handleSelectRoom(newSubGroup.id)
                }}
              />
            </>
          )
        ) : (
          <div className="chat-welcome-placeholder">
            <button
              type="button"
              className="mobile-menu-btn"
              onClick={() => setIsMobileSidebarOpen(true)}
              style={{ position: 'absolute', top: 16, left: 16 }}
            >
              ☰ Buka Obrolan
            </button>
            <div className="welcome-content">
              <div className="welcome-icon">💬</div>
              <h2>Wuzz Chat untuk Web</h2>
              <p>
                Kirim dan terima pesan secara instan dan aman.
              </p>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '8px' }}>
                👈 Pilih percakapan dari daftar di sebelah kiri atau cari kontak baru untuk mulai mengobrol.
              </p>
            </div>
          </div>
        )}
      </main>

      {/* Modal Dialog Panggilan Suara Masuk */}
      <IncomingCallModal
        callInfo={activeCall}
        onAccept={handleAcceptCall}
        onReject={handleRejectCall}
      />

      {/* Layar / Overlay Panggilan Suara Berlangsung */}
      <AudioCallOverlay
        callInfo={activeCall}
        isMuted={isCallMuted}
        onToggleMute={handleToggleCallMute}
        onEndCall={handleEndCall}
      />

      {/* Modal Konflik Perangkat E2EE (Single Active Device) */}
      <DeviceConflictModal
        isOpen={deviceConflict.isOpen}
        isRotated={deviceConflict.isRotated}
        keyVersion={deviceConflict.keyVersion}
        currentUserId={user?.id || ''}
        onClose={() => setDeviceConflict({ isOpen: false })}
        onConfirmReset={handleConfirmDeviceReset}
        onLogout={handleDeviceConflictLogout}
        onTransferSuccess={() => {
          setDeviceConflict({ isOpen: false })
          window.location.reload()
        }}
      />

      {/* Modal Pratinjau & Konfirmasi Gabung Grup Publik (Direct Link Navigation) */}
      <GroupPreviewModal
        isOpen={Boolean(directPreviewGroup)}
        group={directPreviewGroup}
        onClose={() => {
          setDirectPreviewGroup(null)
          setSelectedRoomId('')
          router.replace('/chat')
        }}
        onJoined={async (joinedGroup) => {
          setDirectPreviewGroup(null)
          await fetchGroupDetails(joinedGroup.id)
          if (clientRef.current && user) {
            const nickname = user.display_name || user.username
            clientRef.current.send({
              type: 'join',
              nickname,
              room: joinedGroup.id,
            })
          }
        }}
      />

      {/* Modal Teruskan Pesan (Multi-Contact / Group Max 5) */}
      <ForwardMessageModal
        isOpen={Boolean(forwardingMessage)}
        onClose={() => setForwardingMessage(null)}
        message={forwardingMessage}
        conversations={forwardConversations}
        currentRoomId={roomId}
        onForward={handleForwardMessage}
      />
    </div>
  )
}

// Wrapper Suspense untuk Next.js App Router
export default function ChatPage() {
  return (
    <Suspense fallback={
      <div className="chat-layout" style={{ alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
        Memuat obrolan...
      </div>
    }>
      <ChatPageContent />
    </Suspense>
  )
}
