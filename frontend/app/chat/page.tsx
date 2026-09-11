'use client'

import { useEffect, useReducer, useCallback, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { WsClient } from '@/lib/ws-client'
import type { Message, ConnectionStatus, SessionInfo } from '@/lib/types'
import { StatusBar } from './StatusBar'
import { ChatWindow } from './ChatWindow'
import { MessageInput } from './MessageInput'

// ----------------------------------------------------------------
// State & Reducer
// ----------------------------------------------------------------

interface ChatState {
  messages: Message[]
  session: SessionInfo | null
  status: ConnectionStatus
  peerNickname: string | null
  isPeerTyping: boolean
}

type ChatAction =
  | { type: 'SET_STATUS'; payload: ConnectionStatus }
  | { type: 'SET_SESSION'; payload: SessionInfo }
  | { type: 'ADD_MESSAGE'; payload: Message }
  | { type: 'SET_PEER_NICKNAME'; payload: string }
  | { type: 'SET_PEER_TYPING'; payload: boolean }

const initialState: ChatState = {
  messages: [],
  session: null,
  status: 'connecting',
  peerNickname: null,
  isPeerTyping: false,
}

function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'SET_STATUS':
      return { ...state, status: action.payload }
    case 'SET_SESSION':
      return { ...state, session: action.payload }
    case 'ADD_MESSAGE':
      return { ...state, messages: [...state.messages, action.payload] }
    case 'SET_PEER_NICKNAME':
      return { ...state, peerNickname: action.payload }
    case 'SET_PEER_TYPING':
      return { ...state, isPeerTyping: action.payload }
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
  const peerId = searchParams.get('peer') ?? ''

  const [state, dispatch] = useReducer(chatReducer, initialState)
  const clientRef = useRef<WsClient | null>(null)

  // Timer untuk matikan typing indicator setelah 3 detik tidak ada event
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // Ambil nickname dari sessionStorage (di-set di landing page)
    const nickname = sessionStorage.getItem('wuzz_nickname')
    if (!nickname) {
      // Kalau tidak ada nickname, redirect balik ke landing
      router.replace('/')
      return
    }

    // Buat WsClient — koneksi ke /ws (same-origin, diproxy ke Go backend)
    const wsUrl = `ws://${window.location.host}/ws`
    const client = new WsClient(wsUrl)
    clientRef.current = client

    // Subscribe ke perubahan status
    client.onStatus(status => {
      dispatch({ type: 'SET_STATUS', payload: status })

      // Saat (re)connect, kirim event join
      if (status === 'connected') {
        client.send({
          type: 'join',
          nickname,
          to: peerId || undefined,
        })
      }
    })

    // Subscribe ke pesan masuk
    client.onMessage(msg => {
      switch (msg.type) {
        case 'system': {
          // Cek apakah ini konfirmasi join milik kita (berisi ID kita)
          const idMatch = msg.content?.match(/ID kamu: ([a-f0-9-]{36})/i)
          const clientId = idMatch ? idMatch[1] : (msg.to && msg.to !== 'server' && /^[a-f0-9-]{36}$/i.test(msg.to) ? msg.to : null)
          if (clientId) {
            dispatch({
              type: 'SET_SESSION',
              payload: {
                clientId,
                nickname,
                peerId: peerId || undefined,
              },
            })
          }

          // Deteksi jika peer baru bergabung
          const joinMatch = msg.content?.match(/^(.+) telah bergabung ke percakapan/i)
          if (joinMatch && joinMatch[1] !== nickname) {
            dispatch({ type: 'SET_PEER_NICKNAME', payload: joinMatch[1] })
          }

          // Deteksi jika peer meninggalkan percakapan
          const leaveMatch = msg.content?.match(/^(.+) telah meninggalkan percakapan/i)
          if (leaveMatch) {
            dispatch({ type: 'SET_PEER_TYPING', payload: false })
          }

          // Tampilkan pesan sistem di chat
          dispatch({ type: 'ADD_MESSAGE', payload: msg })
          break
        }

        case 'message': {
          dispatch({ type: 'ADD_MESSAGE', payload: msg })
          break
        }

        case 'typing': {
          // Peer sedang mengetik — tampilkan indicator selama 3 detik
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

    // Cleanup saat komponen unmount
    return () => {
      client.destroy()
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // hanya run sekali saat mount

  const handleSend = useCallback((content: string) => {
    clientRef.current?.send({ type: 'message', content })
    // Tambahkan pesan ke state lokal secara optimistic
    // (pesan akan muncul langsung, tidak perlu tunggu server echo)
    const session = state.session
    if (session) {
      dispatch({
        type: 'ADD_MESSAGE',
        payload: {
          type: 'message',
          from: session.clientId,
          content,
          timestamp: new Date().toISOString(),
        },
      })
    }
  }, [state.session])

  const handleTyping = useCallback(() => {
    clientRef.current?.send({ type: 'typing' })
  }, [])

  const isConnected = state.status === 'connected'

  return (
    <div className="chat-layout">
      <StatusBar
        status={state.status}
        session={state.session}
        peerNickname={state.peerNickname}
      />

      {/* Info sesi — tampilkan Client ID agar bisa di-share ke peer */}
      {state.session && (
        <div className="session-info-bar" aria-label="Info sesi">
          <span>ID kamu:</span>
          <code
            title="Klik untuk select, lalu copy ke teman kamu"
            id="client-id-display"
          >
            {state.session.clientId}
          </code>
          <span style={{ color: 'var(--accent-400)' }}>← share ke teman</span>
        </div>
      )}

      <ChatWindow
        messages={state.messages}
        selfId={state.session?.clientId ?? ''}
        isPeerTyping={state.isPeerTyping}
      />

      <MessageInput
        onSend={handleSend}
        onTyping={handleTyping}
        disabled={!isConnected || !state.session}
      />
    </div>
  )
}

// Wrapper dengan Suspense — diperlukan Next.js App Router saat useSearchParams
// digunakan dalam Client Component agar tidak error saat static rendering.
export default function ChatPage() {
  return (
    <Suspense fallback={
      <div className="chat-layout" style={{ alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
        Memuat...
      </div>
    }>
      <ChatPageContent />
    </Suspense>
  )
}

