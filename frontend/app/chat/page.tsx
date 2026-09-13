'use client'

import { useEffect, useReducer, useState, useCallback, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { WsClient } from '@/lib/ws-client'
import type { Message, ConnectionStatus, SessionInfo, RoomUser, MessageReceiptStatus, ReactionItem, ConversationItem } from '@/lib/types'
import { StatusBar } from './StatusBar'
import { ChatWindow } from './ChatWindow'
import { MessageInput } from './MessageInput'
import { MemberListModal } from './MemberListModal'
import { ImageLightboxModal } from './ImageLightboxModal'
import { Sidebar } from './Sidebar'
import { soundManager } from '@/lib/sound'
import { useAuth } from '@/lib/auth-context'
import { deleteMessageApi, apiRequest } from '@/lib/api'

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
  const [replyingTo, setReplyingTo] = useState<Message | null>(null)
  const [isLoadingHistory, setIsLoadingHistory] = useState(Boolean(roomId))
  const [isHistoryError, setIsHistoryError] = useState(false)
  const clientRef = useRef<WsClient | null>(null)

  // Timer untuk matikan typing indicator setelah 3 detik
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Timer timeout sinkronisasi riwayat pesan (7.5 detik)
  const historyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (isAuthLoading) return

    if (!user) {
      // Jika user belum login, wajib alihkan ke halaman login
      const targetUrl = roomId ? `/login?room=${encodeURIComponent(roomId)}` : '/login'
      router.replace(targetUrl)
      return
    }

    const nickname = user.display_name || user.username

    // Reset pesan & reply saat berpindah room
    dispatch({ type: 'SET_MESSAGES', payload: [] })
    dispatch({ type: 'SET_ROOM_USERS', payload: [] })
    dispatch({ type: 'SET_PEER_NICKNAME', payload: '' })
    setReplyingTo(null)
    setLightboxData(null)
    setIsMemberListOpen(false)
    setIsLoadingHistory(Boolean(roomId))
    setIsHistoryError(false)

    if (historyTimeoutRef.current) clearTimeout(historyTimeoutRef.current)
    if (roomId) {
      historyTimeoutRef.current = setTimeout(() => {
        setIsLoadingHistory(false)
        setIsHistoryError(true)
      }, 7500)
    }

    // Buat koneksi WsClient (selalu aktif untuk menerima notifikasi pesan baru)
    const token = typeof window !== 'undefined' ? localStorage.getItem('wuzz_auth_token') || '' : ''
    const customWsBase = process.env.NEXT_PUBLIC_WS_URL
    let wsEndpoint = ''
    if (customWsBase) {
      wsEndpoint = customWsBase
    } else {
      const protocol = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      wsEndpoint = `${protocol}//${typeof window !== 'undefined' ? window.location.host : 'localhost:3047'}/ws`
    }
    const wsUrl = `${wsEndpoint}${wsEndpoint.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`
    const client = new WsClient(wsUrl)
    clientRef.current = client

    // Subscribe status
    client.onStatus(status => {
      dispatch({ type: 'SET_STATUS', payload: status })

      // Saat terhubung, daftarkan user ke Hub (dan join ke room jika ada)
      if (status === 'connected') {
        dispatch({
          type: 'SET_SESSION',
          payload: {
            clientId: user.id || nickname,
            nickname,
            peerId: roomId,
          },
        })
        client.send({
          type: 'join',
          nickname,
          room: roomId || '',
        })

        // Jika membuka ruang obrolan saat tab aktif, kirim bulk read receipt seketika
        if (roomId && typeof document !== 'undefined' && document.visibilityState === 'visible') {
          client.send({
            type: 'receipt',
            room: roomId,
            status: 'read',
          })
        }
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
          if (historyTimeoutRef.current) clearTimeout(historyTimeoutRef.current)
          setIsLoadingHistory(false)
          setIsHistoryError(false)

          // Muat riwayat chat dari Supabase/Database
          if (roomId) {
            dispatch({ type: 'SET_MESSAGES', payload: msg.messages || [] })

            if (msg.messages && msg.messages.length > 0) {
              // Jika peerNickname masih kosong, ambil dari nama pengirim pesan yang bukan kita
              const otherMsg = msg.messages.slice().reverse().find((m: Message) => 
                m.nickname && 
                m.nickname !== nickname && 
                m.nickname !== user?.display_name && 
                m.nickname !== user?.username
              )
              if (otherMsg && otherMsg.nickname) {
                dispatch({ type: 'SET_PEER_NICKNAME', payload: otherMsg.nickname })
              }

              // Kirim tanda 'read' untuk seluruh pesan di room jika jendela chat sedang aktif
              if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
                client.send({
                  type: 'receipt',
                  room: roomId,
                  status: 'read',
                })
              }
            }
          }
          break
        }

        case 'receipt': {
          // Teruskan ke sidebar agar icon centang di sidebar ikut terupdate
          setLastIncomingMessage(msg)

          // Update status tanda terima pesan (sent -> delivered -> read)
          if (msg.status) {
            dispatch({
              type: 'UPDATE_MESSAGE_STATUS',
              payload: { id: msg.id, status: msg.status },
            })
          }
          break
        }

        case 'reaction': {
          // Update reaksi emoji terhadap pesan tertentu
          if (msg.id && msg.reactions) {
            dispatch({
              type: 'UPDATE_MESSAGE_REACTIONS',
              payload: { id: msg.id, reactions: msg.reactions },
            })

            // Mainkan suara notifikasi jika reaksi diberikan oleh lawan bicara
            if (msg.nickname && msg.nickname !== nickname) {
              soundManager.playReceive()
            }
          }
          break
        }

        case 'message': {
          // Teruskan ke snippet sidebar & unread counter
          setLastIncomingMessage(msg)

          // Jika pesan adalah untuk room yang sedang aktif dibuka
          if (roomId && msg.room === roomId) {
            if (historyTimeoutRef.current) clearTimeout(historyTimeoutRef.current)
            setIsLoadingHistory(false)
            setIsHistoryError(false)

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

        case 'message_deleted': {
          // Update pesan yang ditarik secara real-time
          if (msg.id) {
            dispatch({
              type: 'UPDATE_MESSAGE_DELETED',
              payload: { id: msg.id, content: msg.content },
            })
          }
          break
        }

        case 'leave': {
          dispatch({ type: 'SET_PEER_TYPING', payload: { typing: false } })
          break
        }
      }
    })

    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible' && roomId && clientRef.current) {
        clientRef.current.send({
          type: 'receipt',
          room: roomId,
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
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
      if (historyTimeoutRef.current) clearTimeout(historyTimeoutRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, isAuthLoading, user?.username, user?.display_name])

  // Muat detail judul percakapan / kontak saat room berubah
  useEffect(() => {
    if (!roomId) {
      dispatch({ type: 'SET_PEER_NICKNAME', payload: '' })
      return
    }

    apiRequest<ConversationItem[]>('/api/conversations').then(({ data }) => {
      if (data && Array.isArray(data)) {
        const found = data.find(c => c.id === roomId)
        if (found && found.title) {
          dispatch({ type: 'SET_PEER_NICKNAME', payload: found.title })
        }
      }
    })
  }, [roomId])

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
      } else {
        dispatch({ type: 'UPDATE_MESSAGE_DELETED', payload: { id: messageId } })
      }
    } catch (err: any) {
      alert(err.message || 'Gagal menghapus pesan')
    }
  }, [])

  const handleSend = useCallback((content: string, media?: { url: string; media_type: string; file_name: string; file_size: number }) => {
    if (!roomId) return
    const session = state.session
    const msgId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'msg-' + Date.now()

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
      content,
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

    // Optimistic local render dengan status pending
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
    }

    setReplyingTo(null)
  }, [state.session, roomId, replyingTo])

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

  const handleSelectRoom = (newRoomId: string) => {
    setLightboxData(null)
    setIsMemberListOpen(false)
    setReplyingTo(null)
    router.push(newRoomId ? `/chat?room=${encodeURIComponent(newRoomId)}` : '/chat')
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

  if (isAuthLoading || !user) {
    return (
      <div className="chat-app-container" style={{ alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg-primary)' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '2rem', marginBottom: 'var(--space-3)', animation: 'spin 1.5s linear infinite' }}>💬</div>
          <p>Memverifikasi sesi akun...</p>
        </div>
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
              onOpenMemberList={() => setIsMemberListOpen(true)}
              onBack={() => handleSelectRoom('')}
            />

            <ChatWindow
              messages={state.messages}
              selfId={state.session?.clientId ?? ''}
              selfNickname={state.session?.nickname ?? user.display_name ?? user.username ?? ''}
              isPeerTyping={state.isPeerTyping}
              typingNickname={state.typingNickname}
              isLoadingHistory={isLoadingHistory}
              isHistoryError={isHistoryError}
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
