'use client'

import { useEffect, useReducer, useState, useCallback, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { WsClient } from '@/lib/ws-client'
import type { Message, ConnectionStatus, SessionInfo, RoomUser, MessageReceiptStatus, ReactionItem, ConversationItem, User, ActiveCallInfo } from '@/lib/types'
import { StatusBar } from './StatusBar'
import { ChatWindow } from './ChatWindow'
import { MessageInput } from './MessageInput'
import { MemberListModal } from './MemberListModal'
import { ImageLightboxModal } from './ImageLightboxModal'
import { IncomingCallModal } from './IncomingCallModal'
import { AudioCallOverlay } from './AudioCallOverlay'
import { Sidebar } from './Sidebar'
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
  cacheMessages,
  cacheMessage,
  updateCachedMessageStatus,
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
  | { type: 'SET_MESSAGES'; payload: Message[] }
  | { type: 'SET_PEER_NICKNAME'; payload: string }
  | { type: 'SET_PEER_TYPING'; payload: { typing: boolean; nickname?: string | null } }
  | { type: 'SET_ROOM_USERS'; payload: RoomUser[] }

const initialState: ChatState = {
  messages: [],
  session: null,
  status: 'connecting',
  peerNickname: null,
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
    case 'SET_MESSAGES': {
      return { ...state, messages: action.payload }
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
  }, [searchParamRoom])

  const roomId = selectedRoomId
  const { user, isLoading: isAuthLoading, logout } = useAuth()

  const [state, dispatch] = useReducer(chatReducer, initialState)
  const [isMemberListOpen, setIsMemberListOpen] = useState(false)
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)
  const [lastIncomingMessage, setLastIncomingMessage] = useState<Message | null>(null)
  const [replyingTo, setReplyingTo] = useState<Message | null>(null)
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
          if (profile && profile.public_key) {
            pubKey = profile.public_key
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
  // 1. Efek Perpindahan Ruang Obrolan (Room Switcher): 0ms Load & Join
  //    Dijalankan saat `roomId` berubah TANPA disconnect WebSocket!
  // ----------------------------------------------------------------
  useEffect(() => {
    if (!roomId) {
      dispatch({ type: 'SET_MESSAGES', payload: [] })
      dispatch({ type: 'SET_ROOM_USERS', payload: [] })
      dispatch({ type: 'SET_PEER_NICKNAME', payload: '' })
      setReplyingTo(null)
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
    dispatch({ type: 'SET_PEER_NICKNAME', payload: '' })
    setReplyingTo(null)
    setLightboxData(null)
    setIsMemberListOpen(false)
    setIsLoadingHistory(true)
    setIsHistoryError(false)

    // Cache-First Instant Load: Baca riwayat pesan dari IndexedDB lokal (0ms)
    getCachedMessages(roomId).then((cached) => {
      if (cached.length > 0 && roomIdRef.current === roomId) {
        const cachedMsgs: Message[] = cached.map((c: CachedMessageRecord) => ({
          id: c.id,
          room_id: c.room_id,
          conversation_id: c.room_id,
          content: c.content,
          sender_id: c.sender_id,
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

    if (historyTimeoutRef.current) clearTimeout(historyTimeoutRef.current)
    historyTimeoutRef.current = setTimeout(() => {
      setIsLoadingHistory(false)
      setIsHistoryError(true)
    }, 7500)

    // Bergabung ke room di WebSocket yang sedang aktif (0ms reconnect!)
    if (clientRef.current) {
      clientRef.current.send({
        type: 'join',
        nickname,
        room: roomId,
      })

      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        clientRef.current.send({
          type: 'receipt',
          room: roomId,
          status: 'read',
        })
      }
    }
  }, [roomId, user?.display_name, user?.username])

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
        client.send({
          type: 'join',
          nickname,
          room: currentRoom,
        })

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
          const clientId = idMatch ? idMatch[1] : (msg.to && msg.to !== 'server' && /^[a-f0-9-]{36}$/i.test(msg.to) ? msg.to : 'user')
          if (clientId) {
            dispatch({
              type: 'SET_SESSION',
              payload: {
                clientId,
                nickname,
                peerId: currentRoom,
              },
            })
          }
          break
        }

        case 'room_users': {
          if (msg.users && currentRoom && (msg.room === currentRoom || !msg.room)) {
            dispatch({ type: 'SET_ROOM_USERS', payload: msg.users })
            const otherUsers = msg.users.filter(u => u.nickname !== nickname)
            if (otherUsers.length === 1) {
              dispatch({ type: 'SET_PEER_NICKNAME', payload: otherUsers[0].nickname })
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

              // SAFE-MERGE DENGAN INDEXEDDB CACHE (E2EE Continuity Protection):
              // Ambil cache pesan lokal yang tersimpan dalam status terdekripsi
              const localCachedList = await getCachedMessages(currentRoom).catch(() => [])
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

              dispatch({ type: 'SET_MESSAGES', payload: decryptedList })

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
              const otherMsg = msg.messages.slice().reverse().find((m: Message) => 
                m.nickname && 
                m.nickname !== nickname && 
                m.nickname !== user?.display_name && 
                m.nickname !== user?.username
              )
              if (otherMsg && otherMsg.nickname) {
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
            if (msg.nickname && msg.nickname !== nickname) {
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

            if (msg.nickname && msg.nickname !== nickname) {
              dispatch({ type: 'SET_PEER_NICKNAME', payload: msg.nickname })
            }
          } else {
            setLastIncomingMessage(msg)
          }

          if (msg.nickname && msg.nickname !== nickname && msg.id) {
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
            peerId: msg.nickname || '',
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
          resolvePeerKeyAndDecrypt(potentialPeerId)
        }
      }
    }

    apiRequest<ConversationItem[]>('/api/conversations').then(async ({ data }) => {
      if (data && Array.isArray(data)) {
        const found = data.find(c => c.id === roomId)
        if (found) {
          if (found.title) {
            dispatch({ type: 'SET_PEER_NICKNAME', payload: found.title })
          }

          if (found.peer_id) {
            resolvePeerKeyAndDecrypt(found.peer_id, found.peer_public_key)
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
  }, [roomId, user])

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

  const handleSend = useCallback(async (content: string, media?: { url: string; media_type: string; file_name: string; file_size: number }) => {
    if (!roomId) return
    const session = state.session
    const msgId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'msg-' + Date.now()

    let outgoingContent = content

    // Enkripsi pesan teks via AES-256-GCM jika percakapan E2EE direct aktif
    let key = roomAESKeyRef.current
    if (!key && user?.id && activePeerRef.current?.id && activePeerRef.current?.publicKey) {
      key = await getSharedRoomAESKey(user.id, activePeerRef.current.id, activePeerRef.current.publicKey, roomId)
      roomAESKeyRef.current = key
    }

    // Fail-Closed Guard: Jika percakapan direct dan key tidak dapat dibuat, jangan kirim pesan!
    if (activePeerRef.current?.id && !key) {
      alert('Sesi enkripsi pada perangkat ini belum valid. Pesan tidak dikirim demi melindungi keamanan E2EE Anda.')
      setDeviceConflict({ isOpen: true, isRotated: false })
      return
    }

    if (key && content && content.trim() !== '') {
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
    setActiveCall({
      room: roomId,
      peerId: peerName,
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
    setSelectedRoomId(newRoomId)
    if (!newRoomId) {
      dispatch({ type: 'SET_MESSAGES', payload: [] })
      dispatch({ type: 'SET_PEER_NICKNAME', payload: '' })
      dispatch({ type: 'SET_ROOM_USERS', payload: [] })
      roomAESKeyRef.current = null
      activePeerRef.current = null
      if (typeof window !== 'undefined') {
        window.history.pushState(null, '', '/chat')
      }
      router.push('/chat')
    } else {
      if (typeof window !== 'undefined') {
        window.history.pushState(null, '', `/chat?room=${encodeURIComponent(newRoomId)}`)
      }
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
          <>
            <StatusBar
              status={state.status}
              session={state.session}
              peerNickname={state.peerNickname}
              roomId={roomId}
              roomUsers={state.roomUsers}
              isPeerTyping={state.isPeerTyping}
              typingNickname={state.typingNickname}
              currentUserId={user?.id}
              peerPublicKeyJWK={peerPublicKeyJWK}
              onOpenMemberList={() => setIsMemberListOpen(true)}
              onBack={() => handleSelectRoom('')}
              onStartAudioCall={handleStartAudioCall}
            />

            <ChatWindow
              messages={state.messages}
              selfId={state.session?.clientId ?? ''}
              selfNickname={state.session?.nickname ?? user.display_name ?? user.username ?? ''}
              isPeerTyping={state.isPeerTyping}
              typingNickname={state.typingNickname}
              isLoadingHistory={isLoadingHistory}
              isHistoryError={isHistoryError}
              isE2EE={Boolean(roomId && (roomId.startsWith('dm_') || !roomId.startsWith('room-')))}
              onRetryHistory={handleRetryHistory}
              onReply={setReplyingTo}
              onReact={handleReact}
              onImageClick={(url, name) => setLightboxData({ url, fileName: name })}
              onDeleteMessage={handleDeleteMessage}
            />

            <MessageInput
              onSend={handleSend}
              onTyping={handleTyping}
              disabled={!isConnected}
              replyTo={replyingTo}
              onCancelReply={() => setReplyingTo(null)}
              stagedExternalFile={draggedFile}
              onClearStagedExternalFile={() => setDraggedFile(null)}
            />

            <MemberListModal
              isOpen={isMemberListOpen}
              onClose={() => setIsMemberListOpen(false)}
              users={state.roomUsers}
              currentNickname={state.session?.nickname}
              roomId={roomId}
            />

            <ImageLightboxModal
              isOpen={!!lightboxData}
              imageUrl={lightboxData?.url || ''}
              fileName={lightboxData?.fileName}
              onClose={() => setLightboxData(null)}
            />
          </>
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
