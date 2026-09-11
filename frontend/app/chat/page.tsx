'use client'

import { useEffect, useReducer, useState, useCallback, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { WsClient } from '@/lib/ws-client'
import type { Message, ConnectionStatus, SessionInfo, RoomUser } from '@/lib/types'
import { StatusBar } from './StatusBar'
import { ChatWindow } from './ChatWindow'
import { MessageInput } from './MessageInput'
import { MemberListModal } from './MemberListModal'

// ----------------------------------------------------------------
// State & Reducer
// ----------------------------------------------------------------

interface ChatState {
  messages: Message[]
  session: SessionInfo | null
  status: ConnectionStatus
  peerNickname: string | null
  isPeerTyping: boolean
  roomUsers: RoomUser[]
}

type ChatAction =
  | { type: 'SET_STATUS'; payload: ConnectionStatus }
  | { type: 'SET_SESSION'; payload: SessionInfo }
  | { type: 'ADD_MESSAGE'; payload: Message }
  | { type: 'SET_MESSAGES'; payload: Message[] }
  | { type: 'SET_PEER_NICKNAME'; payload: string }
  | { type: 'SET_PEER_TYPING'; payload: boolean }
  | { type: 'SET_ROOM_USERS'; payload: RoomUser[] }

const initialState: ChatState = {
  messages: [],
  session: null,
  status: 'connecting',
  peerNickname: null,
  isPeerTyping: false,
  roomUsers: [],
}

function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'SET_STATUS':
      return { ...state, status: action.payload }
    case 'SET_SESSION':
      return { ...state, session: action.payload }
    case 'ADD_MESSAGE':
      return { ...state, messages: [...state.messages, action.payload] }
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
      return { ...state, isPeerTyping: action.payload }
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
  const roomId = searchParams.get('room') || searchParams.get('peer') || 'room-general'

  const [state, dispatch] = useReducer(chatReducer, initialState)
  const [isMemberListOpen, setIsMemberListOpen] = useState(false)
  const clientRef = useRef<WsClient | null>(null)

  // Timer untuk matikan typing indicator setelah 3 detik
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // Ambil nickname dari sessionStorage
    const nickname = sessionStorage.getItem('wuzz_nickname')
    if (!nickname) {
      // Jika tidak ada nickname (misal direct open link), arahkan ke landing dengan room param
      router.replace(`/?room=${encodeURIComponent(roomId)}`)
      return
    }

    // Buat koneksi WsClient
    const wsUrl = `ws://${window.location.host}/ws`
    const client = new WsClient(wsUrl)
    clientRef.current = client

    // Subscribe status
    client.onStatus(status => {
      dispatch({ type: 'SET_STATUS', payload: status })

      // Saat terhubung, gabung ke room
      if (status === 'connected') {
        client.send({
          type: 'join',
          nickname,
          room: roomId,
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
            dispatch({ type: 'SET_PEER_TYPING', payload: false })
          }

          dispatch({ type: 'ADD_MESSAGE', payload: msg })
          break
        }

        case 'room_users': {
          // Update daftar member aktif di room
          if (msg.users) {
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
          if (msg.messages && msg.messages.length > 0) {
            dispatch({ type: 'SET_MESSAGES', payload: msg.messages })
          }
          break
        }

        case 'message': {
          dispatch({ type: 'ADD_MESSAGE', payload: msg })
          if (msg.nickname && msg.nickname !== nickname) {
            dispatch({ type: 'SET_PEER_NICKNAME', payload: msg.nickname })
          }
          break
        }

        case 'typing': {
          dispatch({ type: 'SET_PEER_TYPING', payload: true })
          if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
          typingTimerRef.current = setTimeout(() => {
            dispatch({ type: 'SET_PEER_TYPING', payload: false })
          }, 3000)
          break
        }

        case 'leave': {
          dispatch({ type: 'SET_PEER_TYPING', payload: false })
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
  }, [roomId])

  const handleSend = useCallback((content: string) => {
    const session = state.session
    clientRef.current?.send({
      type: 'message',
      content,
      room: roomId,
      nickname: session?.nickname,
    })

    // Optimistic local render
    if (session) {
      dispatch({
        type: 'ADD_MESSAGE',
        payload: {
          type: 'message',
          from: session.clientId,
          nickname: session.nickname,
          content,
          timestamp: new Date().toISOString(),
        },
      })
    }
  }, [state.session, roomId])

  const handleTyping = useCallback(() => {
    clientRef.current?.send({ type: 'typing', room: roomId })
  }, [roomId])

  const isConnected = state.status === 'connected'

  return (
    <div className="chat-layout">
      <StatusBar
        status={state.status}
        session={state.session}
        peerNickname={state.peerNickname}
        roomId={roomId}
        roomUsers={state.roomUsers}
        onOpenMemberList={() => setIsMemberListOpen(true)}
      />

      <ChatWindow
        messages={state.messages}
        selfId={state.session?.clientId ?? ''}
        selfNickname={state.session?.nickname ?? (typeof window !== 'undefined' ? sessionStorage.getItem('wuzz_nickname') ?? '' : '')}
        isPeerTyping={state.isPeerTyping}
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
