'use client'

import { useEffect, useReducer, useState, useCallback, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { WsClient } from '@/lib/ws-client'
import type { Message, ConnectionStatus, SessionInfo, RoomUser, MessageReceiptStatus } from '@/lib/types'
import { StatusBar } from './StatusBar'
import { ChatWindow } from './ChatWindow'
import { MessageInput } from './MessageInput'
import { MemberListModal } from './MemberListModal'
import { Sidebar } from './Sidebar'
import { soundManager } from '@/lib/sound'
import { useAuth } from '@/lib/auth-context'

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
  | { type: 'UPDATE_MESSAGE_STATUS'; payload: { id: string; status: MessageReceiptStatus } }
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
      if (!id) return state
      const targetWeight = statusWeight[status] || 0

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
    case 'SET_MESSAGES': {
      // Gabungkan riwayat chat dari database tanpa duplikasi
      const existingKeys = new Set(
        state.messages.map(m => m.id || `${m.from}_${m.timestamp}_${m.content}`)
      )
      const newMessages = action.payload.filter(
        m => !existingKeys.has(m.id || `${m.from}_${m.timestamp}_${m.content}`)
      )
      return { ...state, messages: [...newMessages, ...state.messages] }
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
// Chat Page Component
// ----------------------------------------------------------------

function ChatPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const roomId = searchParams.get('room') || searchParams.get('peer') || ''
  const { user, isLoading: isAuthLoading } = useAuth()

  const [state, dispatch] = useReducer(chatReducer, initialState)
  const [isMemberListOpen, setIsMemberListOpen] = useState(false)
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)
  const [lastIncomingMessage, setLastIncomingMessage] = useState<Message | null>(null)
  const clientRef = useRef<WsClient | null>(null)

  // Timer untuk matikan typing indicator setelah 3 detik
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (isAuthLoading) return

    // Ambil nickname dari user auth atau sessionStorage
    const nickname = user?.display_name || user?.username || (typeof window !== 'undefined' ? sessionStorage.getItem('wuzz_nickname') : '')
    if (!nickname) {
      // Jika tidak ada nickname (misal direct open link tanpa login), arahkan ke login/landing
      router.replace(roomId ? `/?room=${encodeURIComponent(roomId)}` : '/')
      return
    }

    // Reset pesan saat berpindah room
    dispatch({ type: 'SET_MESSAGES', payload: [] })
    dispatch({ type: 'SET_ROOM_USERS', payload: [] })
    dispatch({ type: 'SET_PEER_NICKNAME', payload: '' })

    // Buat koneksi WsClient (selalu aktif untuk menerima notifikasi pesan baru)
    const wsUrl = `ws://${window.location.host}/ws`
    const client = new WsClient(wsUrl)
    clientRef.current = client

    // Subscribe status
    client.onStatus(status => {
      dispatch({ type: 'SET_STATUS', payload: status })

      // Saat terhubung, daftarkan user ke Hub (dan join ke room jika ada)
      if (status === 'connected') {
        client.send({
          type: 'join',
          nickname,
          room: roomId || '',
        })
      }
    })

    // Subscribe pesan masuk
    client.onMessage(msg => {
      switch (msg.type) {
        case 'system': {
          const idMatch = msg.content?.match(/ID kamu: ([a-f0-9-]{36})/i)
          const clientId = idMatch ? idMatch[1] : (msg.to && msg.to !== 'server' && /^[a-f0-9-]{36}$/i.test(msg.to) ? msg.to : 'user')
          if (clientId) {
            dispatch({
              type: 'SET_SESSION',
              payload: {
                clientId,
                nickname,
                peerId: roomId,
              },
            })
          }

          // Deteksi user lain yang join
          const joinMatch = msg.content?.match(/^(.+) telah bergabung ke percakapan/i)
          if (joinMatch && joinMatch[1] !== nickname) {
            dispatch({ type: 'SET_PEER_NICKNAME', payload: joinMatch[1] })
          }

          // Deteksi user lain yang leave
          const leaveMatch = msg.content?.match(/^(.+) telah meninggalkan percakapan/i)
          if (leaveMatch) {
            dispatch({ type: 'SET_PEER_TYPING', payload: { typing: false } })
          }

          if (roomId) {
            dispatch({ type: 'ADD_MESSAGE', payload: msg })
          }
          break
        }

        case 'room_users': {
          // Update daftar member aktif di room
          if (msg.users && roomId) {
            dispatch({ type: 'SET_ROOM_USERS', payload: msg.users })
            // Jika ada member selain kita, set nama peer
            const otherUsers = msg.users.filter(u => u.nickname !== nickname)
            if (otherUsers.length === 1) {
              dispatch({ type: 'SET_PEER_NICKNAME', payload: otherUsers[0].nickname })
            } else if (otherUsers.length > 1) {
              dispatch({ type: 'SET_PEER_NICKNAME', payload: `${otherUsers.length} Peserta` })
            }
          }
          break
        }

        case 'history': {
          // Muat riwayat chat dari Supabase/Database
          if (msg.messages && msg.messages.length > 0 && roomId) {
            dispatch({ type: 'SET_MESSAGES', payload: msg.messages })

            // Kirim tanda 'read' untuk pesan lawan bicara jika jendela chat sedang aktif
            if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
              msg.messages.forEach(m => {
                if (m.id && m.nickname && m.nickname !== nickname && m.status !== 'read') {
                  client.send({
                    type: 'receipt',
                    id: m.id,
                    room: roomId,
                    status: 'read',
                  })
                }
              })
            }
          }
          break
        }

        case 'receipt': {
          // Update status tanda terima pesan (sent -> delivered -> read)
          if (msg.id && msg.status) {
            dispatch({
              type: 'UPDATE_MESSAGE_STATUS',
              payload: { id: msg.id, status: msg.status },
            })
          }
          break
        }

        case 'message': {
          // Teruskan ke snippet sidebar & unread counter
          setLastIncomingMessage(msg)

          // Jika pesan adalah untuk room yang sedang aktif dibuka
          if (roomId && msg.room === roomId) {
            dispatch({ type: 'ADD_MESSAGE', payload: msg })
            if (msg.nickname && msg.nickname !== nickname) {
              dispatch({ type: 'SET_PEER_NICKNAME', payload: msg.nickname })
            }
          }

          // Balas receipt ke pengirim jika pesan dari lawan bicara
          if (msg.nickname && msg.nickname !== nickname && msg.id) {
            soundManager.playReceive()

            // 1. Kirim tanda 'delivered'
            client.send({
              type: 'receipt',
              id: msg.id,
              room: msg.room || roomId,
              status: 'delivered',
            })

            // 2. Jika room ini sedang aktif dibuka & window terlihat, kirim juga status 'read'
            if (roomId && msg.room === roomId && typeof document !== 'undefined' && document.visibilityState === 'visible') {
              client.send({
                type: 'receipt',
                id: msg.id,
                room: msg.room || roomId,
                status: 'read',
              })
            }
          }

          // Reset typing indicator saat pesan baru masuk
          dispatch({ type: 'SET_PEER_TYPING', payload: { typing: false } })
          break
        }

        case 'typing': {
          dispatch({
            type: 'SET_PEER_TYPING',
            payload: { typing: true, nickname: msg.nickname || null },
          })
          if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
          typingTimerRef.current = setTimeout(() => {
            dispatch({ type: 'SET_PEER_TYPING', payload: { typing: false } })
          }, 2500)
          break
        }

        case 'leave': {
          dispatch({ type: 'SET_PEER_TYPING', payload: { typing: false } })
          dispatch({ type: 'ADD_MESSAGE', payload: msg })
          break
        }
      }
    })

    client.connect()

    return () => {
      client.destroy()
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, isAuthLoading, user?.username, user?.display_name])

  const handleSend = useCallback((content: string) => {
    if (!roomId) return
    const session = state.session
    const msgId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'msg-' + Date.now()

    clientRef.current?.send({
      id: msgId,
      type: 'message',
      content,
      room: roomId,
      nickname: session?.nickname,
    })

    // Mainkan suara pop pengiriman pesan
    soundManager.playSend()

    // Optimistic local render dengan status pending
    if (session) {
      const localMsg: Message = {
        id: msgId,
        type: 'message',
        from: session.clientId,
        nickname: session.nickname,
        content,
        room: roomId,
        status: 'pending',
        timestamp: new Date().toISOString(),
      }
      dispatch({
        type: 'ADD_MESSAGE',
        payload: localMsg,
      })
      setLastIncomingMessage(localMsg)
    }
  }, [state.session, roomId])

  const handleTyping = useCallback(() => {
    if (!roomId) return
    clientRef.current?.send({
      type: 'typing',
      room: roomId,
      nickname: state.session?.nickname,
    })
  }, [roomId, state.session?.nickname])

  const handleSelectRoom = (newRoomId: string) => {
    router.push(`/chat?room=${encodeURIComponent(newRoomId)}`)
  }

  const isConnected = state.status === 'connected'

  return (
    <div className="chat-app-container">
      {/* Sidebar Obrolan & Kontak */}
      <Sidebar
        activeRoomId={roomId}
        onSelectRoom={handleSelectRoom}
        isOpenMobile={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
        lastIncomingMessage={lastIncomingMessage}
      />

      {/* Main Chat Pane */}
      <main className="chat-main-pane">
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
              onOpenMemberList={() => setIsMemberListOpen(true)}
              onToggleSidebar={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
            />

            <ChatWindow
              messages={state.messages}
              selfId={state.session?.clientId ?? ''}
              selfNickname={state.session?.nickname ?? (typeof window !== 'undefined' ? sessionStorage.getItem('wuzz_nickname') ?? '' : '')}
              isPeerTyping={state.isPeerTyping}
              typingNickname={state.typingNickname}
            />

            <MessageInput
              onSend={handleSend}
              onTyping={handleTyping}
              disabled={!isConnected || !state.session}
            />

            <MemberListModal
              isOpen={isMemberListOpen}
              onClose={() => setIsMemberListOpen(false)}
              users={state.roomUsers}
              currentNickname={state.session?.nickname}
              roomId={roomId}
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
