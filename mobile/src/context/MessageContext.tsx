/**
 * WuzzChat Mobile - MessageContext
 * Global In-Memory Messages Cache & Stale-While-Revalidate (SWR) Layer.
 * Conforms to docs/context/MOBILE.md Section 2.E & Milestone M-Mobile-8.17.
 *
 * State disimpan di messageStore (di luar React). Context hanya membawa store + aksi yang
 * identitasnya stabil; komponen membaca data lewat useRoomMessages(roomId) (per-room selector)
 * dan memanggil aksi lewat useMessageActions(). Dengan begitu pesan di room lain tidak
 * me-render ulang layar obrolan yang sedang terbuka.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from 'react';
import { Message, normalizeReactions } from '../api/types';
import { useAuth } from './AuthContext';
import { websocketClient } from '../services/websocket';
import {
  cachePeerPublicKey,
  decryptText,
  getCachedPeerPublicKey,
  getOrDeriveRoomAESKey,
  isEncryptedMessage,
  extractDMPeerId,
} from '../services/crypto';
import { getUserPublicKey } from '../api/users';
import { messagesApi } from '../api/messages';
import {
  getStoredMessages,
  saveStoredMessages,
  pruneRoomMessages,
  MAX_LOCAL_MESSAGES_PER_ROOM,
} from '../services/sqliteStorage';

import {
  EMPTY_MESSAGES,
  MessageStore,
  MessageStoreState,
  createMessageStore,
} from './messageStore';

const MAX_CACHED_MESSAGES_PER_ROOM = 500;

/** Aksi & pembacaan imperatif (non-reaktif). Seluruh fungsi di sini identitasnya stabil. */
export interface MessageActions {
  getRoomMessages: (roomId: string) => Message[];
  hydrateRoomFromLocalDB: (roomId: string) => Promise<Message[]>;
  isRoomLoading: (roomId: string) => boolean;
  isRoomRevalidating: (roomId: string) => boolean;
  hasMoreOlderMessages: (roomId: string) => boolean;
  isLoadingOlderMessages: (roomId: string) => boolean;
  loadOlderMessages: (roomId: string) => Promise<boolean>;
  setRoomMessages: (
    roomId: string,
    updater: Message[] | ((prev: Message[]) => Message[])
  ) => void;
  appendMessage: (roomId: string, message: Message) => void;
  updateMessage: (roomId: string, messageId: string, updates: Partial<Message>) => void;
  removeMessage: (roomId: string, messageId: string) => void;
  reconcileHistory: (
    roomId: string,
    rawMessages: any[],
    explicitAESKey?: Uint8Array | null
  ) => void;
  markRoomLoading: (roomId: string, isLoading: boolean) => void;
  markRoomRevalidating: (roomId: string, isRevalidating: boolean) => void;
  clearRoomCache: (roomId?: string) => void;
  getRoomAESKey: (roomId: string) => Promise<Uint8Array | null>;
}

/** Snapshot reaktif satu room, dibaca lewat useRoomMessages. */
export interface RoomMessageState {
  messages: Message[];
  /** true hanya saat belum ada pesan di memori dan sedang memuat awal (SWR 0ms bila sudah ada cache) */
  isLoading: boolean;
  isRevalidating: boolean;
  hasMoreOlder: boolean;
  isLoadingOlder: boolean;
}

interface MessageContextValue {
  store: MessageStore;
  actions: MessageActions;
}

const MessageContext = createContext<MessageContextValue | undefined>(undefined);

function makeSetter<K extends keyof MessageStoreState>(store: MessageStore, key: K) {
  return (
    value: MessageStoreState[K] | ((prev: MessageStoreState[K]) => MessageStoreState[K])
  ) =>
    store.setSlice(key, (prev) =>
      typeof value === 'function'
        ? (value as (p: MessageStoreState[K]) => MessageStoreState[K])(prev)
        : value
    );
}

export const MessageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isAuthenticated, e2eeKeyPair } = useAuth();
  const storeRef = useRef<MessageStore | null>(null);
  if (!storeRef.current) {
    storeRef.current = createMessageStore();
  }
  const store = storeRef.current;

  // Setter slice stabil (store tidak pernah berganti), jadi aman tanpa masuk dependency hook lain
  const { setMessagesByRoom, setRoomLoading, setRoomRevalidating, setHasMoreOlder, setLoadingOlder } =
    useMemo(
      () => ({
        setMessagesByRoom: makeSetter(store, 'messagesByRoom'),
        setRoomLoading: makeSetter(store, 'roomLoading'),
        setRoomRevalidating: makeSetter(store, 'roomRevalidating'),
        setHasMoreOlder: makeSetter(store, 'hasMoreOlder'),
        setLoadingOlder: makeSetter(store, 'loadingOlder'),
      }),
      [store]
    );

  const roomKeysCacheRef = useRef<Map<string, Uint8Array>>(new Map());
  const lastHandledMsgIdRef = useRef<string | null>(null);

  // Helper: Derive or retrieve cached AES Key for a direct conversation
  const getRoomAESKey = useCallback(
    async (roomId: string): Promise<Uint8Array | null> => {
      if (!roomId || !roomId.startsWith('dm_') || !e2eeKeyPair?.privateKeyHex || !user?.id) {
        return null;
      }

      if (roomKeysCacheRef.current.has(roomId)) {
        return roomKeysCacheRef.current.get(roomId)!;
      }

      const peerId = extractDMPeerId(roomId, user.id);
      if (!peerId) return null;

      let peerPubKey = getCachedPeerPublicKey(peerId);
      if (!peerPubKey) {
        try {
          peerPubKey = (await getUserPublicKey(peerId)) || undefined;
          if (peerPubKey) {
            cachePeerPublicKey(peerId, peerPubKey);
          }
        } catch {
          // ignore network error
        }
      }

      if (peerPubKey && e2eeKeyPair.privateKeyHex) {
        const derived = getOrDeriveRoomAESKey(e2eeKeyPair.privateKeyHex, peerPubKey, roomId);
        if (derived) {
          roomKeysCacheRef.current.set(roomId, derived);
          return derived;
        }
      }

      return null;
    },
    [e2eeKeyPair?.privateKeyHex, user?.id]
  );

  // Query: Get messages for a given room (pembacaan imperatif; untuk render pakai useRoomMessages)
  const getRoomMessages = useCallback(
    (roomId: string): Message[] => {
      return store.getState().messagesByRoom[roomId] || EMPTY_MESSAGES;
    },
    [store]
  );

  // Action: Hydrate room messages from local SQLite if memory is empty
  const hydrateRoomFromLocalDB = useCallback(
    async (roomId: string): Promise<Message[]> => {
      if (!roomId || !user?.id) return [];
      const currentInMemory = store.getState().messagesByRoom[roomId];
      if (currentInMemory && currentInMemory.length > 0) {
        return currentInMemory;
      }

      try {
        const stored = await getStoredMessages(user.id, roomId, 50);

        // Silent background pruning to enforce MAX_LOCAL_MESSAGES_PER_ROOM retention cap
        pruneRoomMessages(user.id, roomId, MAX_LOCAL_MESSAGES_PER_ROOM).catch(() => {});

        if (stored && stored.length > 0) {
          setMessagesByRoom((prev) => {
            if (prev[roomId] && prev[roomId].length > 0) return prev;
            return {
              ...prev,
              [roomId]: stored,
            };
          });
          return stored;
        }
      } catch (err) {
        console.warn('[MessageContext] Local SQLite hydration error:', err);
      }
      return [];
    },
    [user?.id, store]
  );

  // Query: Check if room is in initial loading state
  const isRoomLoading = useCallback(
    (roomId: string): boolean => {
      // If messages already exist in memory, it is never in initial loading state (0ms SWR)
      const { messagesByRoom, roomLoading } = store.getState();
      if (messagesByRoom[roomId] && messagesByRoom[roomId].length > 0) {
        return false;
      }
      return Boolean(roomLoading[roomId]);
    },
    [store]
  );

  // Query: Check if room is being revalidated in background
  const isRoomRevalidating = useCallback(
    (roomId: string): boolean => {
      return Boolean(store.getState().roomRevalidating[roomId]);
    },
    [store]
  );

  // Mutation: Set messages directly for a room
  const setRoomMessages = useCallback(
    (roomId: string, updater: Message[] | ((prev: Message[]) => Message[])) => {
      setMessagesByRoom((prev) => {
        const current = prev[roomId] || [];
        const next = typeof updater === 'function' ? updater(current) : updater;
        return {
          ...prev,
          [roomId]: next.slice(-MAX_CACHED_MESSAGES_PER_ROOM),
        };
      });
    },
    []
  );

  // Mutation: Append a single message to a room
  const appendMessage = useCallback(
    (roomId: string, message: Message) => {
      setMessagesByRoom((prev) => {
        const existing = prev[roomId] || [];
        // Replace optimistic message if matching request_id exists
        const reqId = (message as any).request_id;
        if (reqId) {
          const idx = existing.findIndex((m) => m.id === reqId || (m as any).request_id === reqId);
          if (idx !== -1) {
            const updated = [...existing];
            updated[idx] = {
              ...message,
              id: message.id || updated[idx].id,
              media_url: updated[idx].media_url || message.media_url,
            };
            return {
              ...prev,
              [roomId]: updated.slice(-MAX_CACHED_MESSAGES_PER_ROOM),
            };
          }
        }

        // Prevent duplicate by id
        if (existing.some((m) => m.id === message.id)) {
          return prev;
        }

        return {
          ...prev,
          [roomId]: [...existing, message].slice(-MAX_CACHED_MESSAGES_PER_ROOM),
        };
      });

      // Write-through to SQLite disk
      if (user?.id) {
        saveStoredMessages(user.id, roomId, [message]).catch(() => {});
      }
    },
    [user?.id]
  );

  // Mutation: Update a specific message in a room
  const updateMessage = useCallback(
    (roomId: string, messageId: string, updates: Partial<Message>) => {
      setMessagesByRoom((prev) => {
        const existing = prev[roomId];
        if (!existing) return prev;
        const updated = existing.map((m) =>
          m.id === messageId || (m as any).request_id === messageId
            ? { ...m, ...updates }
            : m
        );
        return {
          ...prev,
          [roomId]: updated,
        };
      });
    },
    []
  );

  // Mutation: Remove a specific message from a room
  const removeMessage = useCallback((roomId: string, messageId: string) => {
    setMessagesByRoom((prev) => {
      const existing = prev[roomId];
      if (!existing) return prev;
      return {
        ...prev,
        [roomId]: existing.filter((m) => m.id !== messageId),
      };
    });
  }, []);

  // Mutation: Mark room loading state
  const markRoomLoading = useCallback((roomId: string, isLoading: boolean) => {
    setRoomLoading((prev) => ({
      ...prev,
      [roomId]: isLoading,
    }));
  }, []);

  // Mutation: Mark room revalidating state
  const markRoomRevalidating = useCallback((roomId: string, isRevalidating: boolean) => {
    setRoomRevalidating((prev) => ({
      ...prev,
      [roomId]: isRevalidating,
    }));
  }, []);

  // Query: Check if room has more older messages to load
  const hasMoreOlderMessages = useCallback(
    (roomId: string): boolean => {
      return store.getState().hasMoreOlder[roomId] !== false;
    },
    [store]
  );

  // Query: Check if older messages are currently being loaded
  const isLoadingOlderMessages = useCallback(
    (roomId: string): boolean => {
      return Boolean(store.getState().loadingOlder[roomId]);
    },
    [store]
  );

  // Action: Load older messages for reverse infinite scroll
  const loadOlderMessages = useCallback(
    async (roomId: string): Promise<boolean> => {
      if (!roomId) return false;
      const snapshot = store.getState();
      if (snapshot.loadingOlder[roomId]) return false;
      if (snapshot.hasMoreOlder[roomId] === false) return false;

      const current = snapshot.messagesByRoom[roomId] || [];
      if (current.length === 0) return false;

      // Find earliest timestamp
      const oldestMsg = current[0];
      const beforeTimestamp = oldestMsg.created_at || oldestMsg.timestamp;
      if (!beforeTimestamp) return false;

      setLoadingOlder((prev) => ({ ...prev, [roomId]: true }));

      try {
        const rawOlder = await messagesApi.getMessages(roomId, 50, beforeTimestamp);
        if (!Array.isArray(rawOlder) || rawOlder.length === 0) {
          setHasMoreOlder((prev) => ({ ...prev, [roomId]: false }));
          return false;
        }

        if (rawOlder.length < 50) {
          setHasMoreOlder((prev) => ({ ...prev, [roomId]: false }));
        }

        const key = await getRoomAESKey(roomId);

        const mappedOlder: Message[] = rawOlder.map((m: any) => {
          const msgId = m.id || `hist_${Math.random()}`;
          let content = typeof m.content === 'string' ? m.content : String(m.content || '');
          let isEncrypted = false;

          if (isEncryptedMessage(content)) {
            isEncrypted = true;
            if (key) {
              try {
                content = decryptText(key, content);
              } catch (err) {
                console.warn('[MessageContext] Older history decrypt error:', err);
                content = '🔒 Pesan terenkripsi (kunci tidak cocok)';
              }
            }
          }

          let replyToObj: Message['reply_to'] | undefined = undefined;
          if (m.reply_to && m.reply_to.id) {
            replyToObj = {
              id: m.reply_to.id,
              nickname: m.reply_to.nickname || m.reply_to.from || '',
              content: typeof m.reply_to.content === 'string' ? m.reply_to.content : '',
            };
          } else if (m.reply_to_id) {
            replyToObj = {
              id: m.reply_to_id,
              nickname: m.reply_to_nickname || '',
              content: typeof m.reply_to_content === 'string' ? m.reply_to_content : '',
            };
          }

          return {
            id: msgId,
            room_id: m.room || m.room_id || roomId,
            sender_id: m.sender_id || m.from || '',
            content,
            is_encrypted: isEncrypted,
            from: m.from || m.nickname,
            nickname: m.nickname || m.from,
            created_at: m.timestamp || m.created_at || new Date().toISOString(),
            timestamp: m.timestamp || m.created_at || new Date().toISOString(),
            status: m.status || 'sent',
            reply_to: replyToObj,
            reactions: normalizeReactions(m.reactions),
            is_deleted: Boolean(m.is_deleted),
            is_pinned: Boolean(m.is_pinned),
            media_url: m.media_url,
            media_type: m.media_type,
            file_name: m.file_name,
            file_size: m.file_size,
            media_status: m.media_status,
          };
        });

        setMessagesByRoom((prev) => {
          const existing = prev[roomId] || [];
          const existingIds = new Set(existing.map((m) => m.id));
          const freshOlder = mappedOlder.filter((m) => !existingIds.has(m.id));

          if (freshOlder.length === 0) {
            return prev;
          }

          const combined = [...freshOlder, ...existing].sort((a, b) => {
            const timeA = new Date(a.created_at || a.timestamp || 0).getTime();
            const timeB = new Date(b.created_at || b.timestamp || 0).getTime();
            return timeA - timeB;
          });

          return {
            ...prev,
            [roomId]: combined,
          };
        });

        return true;
      } catch (err) {
        console.warn('[MessageContext] Failed to load older messages:', err);
        return false;
      } finally {
        setLoadingOlder((prev) => ({ ...prev, [roomId]: false }));
      }
    },
    [getRoomAESKey, store]
  );

  // Reconcile incoming history with local cache (DEC-015: E2EE Plaintext Preservation)
  const reconcileHistory = useCallback(
    (roomId: string, rawMessages: any[], explicitAESKey?: Uint8Array | null) => {
      if (!roomId) return;

      const key = explicitAESKey || roomKeysCacheRef.current.get(roomId) || null;

      setMessagesByRoom((prev) => {
        const existing = prev[roomId] || [];
        const existingMap = new Map<string, Message>();
        existing.forEach((m) => {
          existingMap.set(m.id, m);
          if ((m as any).request_id) {
            existingMap.set((m as any).request_id, m);
          }
        });

        const mapped: Message[] = rawMessages.map((m: any) => {
          const msgId = m.id || `hist_${Math.random()}`;
          const existingMsg = existingMap.get(msgId);

          let content = m.content || '';
          let isEncrypted = false;

          // DEC-015: Preserve existing decrypted plaintext if already cached
          if (existingMsg && !isEncryptedMessage(existingMsg.content) && existingMsg.content) {
            content = existingMsg.content;
            isEncrypted = Boolean(existingMsg.is_encrypted);
          } else if (isEncryptedMessage(content)) {
            isEncrypted = true;
            if (key) {
              try {
                content = decryptText(key, content);
              } catch (err) {
                console.warn('[MessageContext] History decrypt error:', err);
                content = '🔒 Pesan terenkripsi (kunci tidak cocok)';
              }
            }
          }

          let replyToObj: Message['reply_to'] | undefined = undefined;
          if (m.reply_to && m.reply_to.id) {
            replyToObj = {
              id: m.reply_to.id,
              nickname: m.reply_to.nickname || m.reply_to.from || '',
              content: typeof m.reply_to.content === 'string' ? m.reply_to.content : '',
            };
          } else if (m.reply_to_id) {
            replyToObj = {
              id: m.reply_to_id,
              nickname: m.reply_to_nickname || '',
              content: typeof m.reply_to_content === 'string' ? m.reply_to_content : '',
            };
          }

          return {
            id: msgId,
            room_id: m.room || m.room_id || roomId,
            sender_id: m.sender_id || m.from || '',
            content,
            is_encrypted: isEncrypted,
            from: m.from || m.nickname,
            nickname: m.nickname || m.from,
            created_at: m.timestamp || m.created_at || new Date().toISOString(),
            timestamp: m.timestamp || m.created_at || new Date().toISOString(),
            status: m.status || 'sent',
            reply_to: replyToObj,
            reactions: normalizeReactions(m.reactions),
            is_deleted: Boolean(m.is_deleted),
            is_pinned: Boolean(m.is_pinned),
            media_url: m.media_url,
            media_type: m.media_type,
            file_name: m.file_name,
            file_size: m.file_size,
            media_status: m.media_status,
          };
        });

        // Merge: keep any optimistic local messages that haven't been confirmed yet
        const serverIds = new Set(mapped.map((m) => m.id));
        const pendingOptimistic = existing.filter(
          (m) => (m.status === 'sending' || (m as any).request_id) && !serverIds.has(m.id)
        );

        const merged = [...mapped, ...pendingOptimistic];

        // Sort chronologically
        merged.sort((a, b) => {
          const timeA = new Date(a.timestamp || a.created_at || 0).getTime();
          const timeB = new Date(b.timestamp || b.created_at || 0).getTime();
          return timeA - timeB;
        });

        // Persist reconciled history to local SQLite disk
        if (user?.id) {
          saveStoredMessages(user.id, roomId, merged).catch((err) =>
            console.warn('[MessageContext] Failed to persist room messages to SQLite:', err)
          );
        }

        return {
          ...prev,
          [roomId]: merged.slice(-MAX_CACHED_MESSAGES_PER_ROOM),
        };
      });

      // Clear loading & revalidating indicators for this room
      setRoomLoading((prev) => ({ ...prev, [roomId]: false }));
      setRoomRevalidating((prev) => ({ ...prev, [roomId]: false }));
    },
    [user?.id]
  );

  // Clear cache for a specific room or all rooms
  const clearRoomCache = useCallback((roomId?: string) => {
    if (roomId) {
      setMessagesByRoom((prev) => {
        const copy = { ...prev };
        delete copy[roomId];
        return copy;
      });
      setHasMoreOlder((prev) => {
        const copy = { ...prev };
        delete copy[roomId];
        return copy;
      });
      setLoadingOlder((prev) => {
        const copy = { ...prev };
        delete copy[roomId];
        return copy;
      });
      roomKeysCacheRef.current.delete(roomId);
    } else {
      setMessagesByRoom({});
      setRoomLoading({});
      setRoomRevalidating({});
      setHasMoreOlder({});
      setLoadingOlder({});
      roomKeysCacheRef.current.clear();
    }
  }, []);

  // Centralized WebSocket Listeners
  useEffect(() => {
    if (!isAuthenticated) {
      clearRoomCache();
      return;
    }

    const currentUserId = user?.id;

    const decryptRetryTimers = new Set<ReturnType<typeof setTimeout>>();

    // 1. Incoming Message Listener
    const unsubscribeMessage = websocketClient.on('message', async (incoming: any) => {
      const targetRoom = incoming.room || incoming.room_id;
      if (!targetRoom) return;

      const incomingId = incoming.id || incoming.request_id;
      if (incomingId && incomingId === lastHandledMsgIdRef.current) {
        return; // Guard anti-duplicate
      }
      if (incomingId) {
        lastHandledMsgIdRef.current = incomingId;
      }

      let content = incoming.content || '';
      let isEncrypted = false;

      if (isEncryptedMessage(content)) {
        isEncrypted = true;
        let key = roomKeysCacheRef.current.get(targetRoom);
        if (!key) {
          key = (await getRoomAESKey(targetRoom)) || undefined;
        }
        if (key) {
          try {
            content = decryptText(key, content);
          } catch (err) {
            console.warn('[MessageContext] Incoming decrypt error:', err);
            content = '🔒 Pesan terenkripsi (kunci tidak cocok)';
          }
        }
      }

      let replyToObj: Message['reply_to'] | undefined = undefined;
      if (incoming.reply_to && incoming.reply_to.id) {
        replyToObj = {
          id: incoming.reply_to.id,
          nickname: incoming.reply_to.nickname || incoming.reply_to.from || '',
          content: incoming.reply_to.content || '',
        };
      }

      const newMsg: Message = {
        id: incoming.id || `msg_${Date.now()}`,
        room_id: targetRoom,
        sender_id: incoming.sender_id || incoming.from || '',
        content,
        is_encrypted: isEncrypted,
        from: incoming.from,
        nickname: incoming.nickname || incoming.from,
        created_at: incoming.timestamp || incoming.created_at || new Date().toISOString(),
        timestamp: incoming.timestamp || incoming.created_at || new Date().toISOString(),
        status:
          incoming.sender_id === currentUserId || incoming.from === currentUserId
            ? 'sent'
            : 'delivered',
        reply_to: replyToObj,
        reactions: normalizeReactions(incoming.reactions),
        is_deleted: Boolean(incoming.is_deleted),
        is_pinned: Boolean(incoming.is_pinned),
        media_url: incoming.media_url,
        media_type: incoming.media_type,
        file_name: incoming.file_name,
        file_size: incoming.file_size,
        media_status: incoming.media_status,
      };

      appendMessage(targetRoom, newMsg);

      // Kunci belum tersedia (mis. fetch public key gagal/lambat): coba lagi dengan backoff
      if (isEncrypted && isEncryptedMessage(content)) {
        const rawContent = content;
        const messageId = newMsg.id;
        const delays = [2000, 5000, 10000, 20000, 40000];
        const attempt = (i: number) => {
          if (i >= delays.length) {
            updateMessage(targetRoom, messageId, { decrypt_failed: true });
            return;
          }
          const timer = setTimeout(async () => {
            decryptRetryTimers.delete(timer);
            const retryKey = (await getRoomAESKey(targetRoom)) || undefined;
            if (!retryKey) {
              attempt(i + 1);
              return;
            }
            try {
              updateMessage(targetRoom, messageId, {
                content: decryptText(retryKey, rawContent),
                decrypt_failed: false,
              });
            } catch {
              updateMessage(targetRoom, messageId, {
                content: '🔒 Pesan terenkripsi (kunci tidak cocok)',
              });
            }
          }, delays[i]);
          decryptRetryTimers.add(timer);
        };
        attempt(0);
      }
    });

    // 2. ACK Listener
    const unsubscribeAck = websocketClient.on('ack', (ack: any) => {
      const reqId = ack.request_id || ack.id;
      if (!reqId) return;

      setMessagesByRoom((prev) => {
        let changed = false;
        const next = { ...prev };

        for (const roomId of Object.keys(next)) {
          const list = next[roomId];
          const matchIndex = list.findIndex(
            (m) => m.id === reqId || (m as any).request_id === reqId
          );
          if (matchIndex !== -1) {
            const updated = [...list];
            updated[matchIndex] = {
              ...updated[matchIndex],
              status: 'sent',
              id: ack.id || updated[matchIndex].id,
            };
            next[roomId] = updated;
            changed = true;
            break;
          }
        }

        return changed ? next : prev;
      });
    });

    // 3. Receipt Listener
    const unsubscribeReceipt = websocketClient.on('receipt', (receipt: any) => {
      const targetRoom = receipt.room || receipt.room_id;
      if (!targetRoom) return;

      const newStatus = receipt.status as 'delivered' | 'read' | 'sent';
      const realMsgId = receipt.id;
      const reqId = receipt.request_id;

      setMessagesByRoom((prev) => {
        const existing = prev[targetRoom];
        if (!existing) return prev;

        const updated = existing.map((msg) => {
          if (reqId && (msg.id === reqId || (msg as any).request_id === reqId)) {
            return {
              ...msg,
              id: realMsgId || msg.id,
              status: newStatus || 'sent',
            };
          }
          if (newStatus === 'read' || newStatus === 'delivered') {
            if (msg.sender_id === currentUserId || msg.status === 'sent') {
              return { ...msg, status: newStatus };
            }
          }
          return msg;
        });

        return { ...prev, [targetRoom]: updated };
      });
    });

    // 4. Reaction Listener
    const unsubscribeReaction = websocketClient.on('reaction', (data: any) => {
      const targetRoom = data.room || data.room_id;
      if (!targetRoom) return;

      const targetId = data.id || data.reaction?.message_id;
      const reactions = normalizeReactions(data.reactions);
      if (targetId && reactions.length > 0) {
        updateMessage(targetRoom, targetId, { reactions });
      }
    });

    // 5. Message Deleted Listener
    const handleWsMessageDeleted = (data: any) => {
      const targetRoom = data.room || data.room_id;
      if (!targetRoom) return;

      const targetId = data.id || data.message_id;
      if (!targetId) return;

      const deleteType =
        data.delete_type || data.type || (data.is_deleted ? 'for_everyone' : 'for_everyone');
      const isForMe = deleteType === 'for_me' || data.delete_for_me === true;

      if (isForMe) {
        removeMessage(targetRoom, targetId);
      } else {
        const placeholder = data.content || '🚫 Pesan ini telah dihapus';
        updateMessage(targetRoom, targetId, {
          is_deleted: true,
          content: placeholder,
        });
      }
    };

    const unsubscribeDeleted = websocketClient.on('message_deleted', handleWsMessageDeleted);
    const unsubscribeDeleteMsg = websocketClient.on('delete_message', handleWsMessageDeleted);

    // 6. Message Edited Listener
    const unsubscribeEdited = websocketClient.on('message_edited', async (data: any) => {
      const targetRoom = data.room || data.room_id;
      if (!targetRoom) return;

      const targetId = data.id || data.message_id;
      if (!targetId) return;

      let content = data.content || '';
      if (isEncryptedMessage(content)) {
        let key = roomKeysCacheRef.current.get(targetRoom);
        if (!key) {
          key = (await getRoomAESKey(targetRoom)) || undefined;
        }
        if (key) {
          try {
            content = decryptText(key, content);
          } catch {}
        }
      }

      updateMessage(targetRoom, targetId, {
        content,
        is_edited: true,
        edited_at: data.edited_at || new Date().toISOString(),
      });
    });

    // 7. Message Pinned Listener
    const unsubscribePinned = websocketClient.on('message_pinned', (data: any) => {
      const targetRoom = data.room || data.room_id;
      if (!targetRoom) return;

      const targetId = data.id || data.message_id;
      if (targetId) {
        updateMessage(targetRoom, targetId, { is_pinned: true });
      }
    });

    // 8. Message Unpinned Listener
    const unsubscribeUnpinned = websocketClient.on('message_unpinned', (data: any) => {
      const targetRoom = data.room || data.room_id;
      if (!targetRoom) return;

      const targetId = data.id || data.message_id;
      if (targetId) {
        updateMessage(targetRoom, targetId, { is_pinned: false });
      }
    });

    // 9. History Listener (Centralized Revalidation)
    const unsubscribeHistory = websocketClient.on('history', async (data: any) => {
      const targetRoom = data.room || data.room_id;
      if (!targetRoom) return;

      let key = roomKeysCacheRef.current.get(targetRoom);
      if (!key) {
        key = (await getRoomAESKey(targetRoom)) || undefined;
      }

      const rawMessages = data.messages || [];
      reconcileHistory(targetRoom, rawMessages, key);
    });

    return () => {
      unsubscribeMessage();
      unsubscribeAck();
      unsubscribeReceipt();
      unsubscribeReaction();
      unsubscribeDeleted();
      unsubscribeDeleteMsg();
      unsubscribeEdited();
      unsubscribePinned();
      unsubscribeUnpinned();
      unsubscribeHistory();
      decryptRetryTimers.forEach(clearTimeout);
      decryptRetryTimers.clear();
    };
  }, [
    isAuthenticated,
    user?.id,
    appendMessage,
    updateMessage,
    removeMessage,
    reconcileHistory,
    clearRoomCache,
    getRoomAESKey,
  ]);

  const value = useMemo<MessageContextValue>(
    () => ({
      store,
      actions: {
        getRoomMessages,
        hydrateRoomFromLocalDB,
        isRoomLoading,
        isRoomRevalidating,
        hasMoreOlderMessages,
        isLoadingOlderMessages,
        loadOlderMessages,
        setRoomMessages,
        appendMessage,
        updateMessage,
        removeMessage,
        reconcileHistory,
        markRoomLoading,
        markRoomRevalidating,
        clearRoomCache,
        getRoomAESKey,
      },
    }),
    [
      store,
      getRoomMessages,
      hydrateRoomFromLocalDB,
      isRoomLoading,
      isRoomRevalidating,
      hasMoreOlderMessages,
      isLoadingOlderMessages,
      loadOlderMessages,
      setRoomMessages,
      appendMessage,
      updateMessage,
      removeMessage,
      reconcileHistory,
      markRoomLoading,
      markRoomRevalidating,
      clearRoomCache,
      getRoomAESKey,
    ]
  );

  return <MessageContext.Provider value={value}>{children}</MessageContext.Provider>;
};

function useMessageContextValue(): MessageContextValue {
  const context = useContext(MessageContext);
  if (!context) {
    throw new Error('useMessageActions/useRoomMessages must be used within a MessageProvider');
  }
  return context;
}

/** Aksi & pembacaan imperatif. Tidak memicu render ulang saat pesan berubah. */
export const useMessageActions = (): MessageActions => useMessageContextValue().actions;

function useStoreSelector<T>(selector: (state: MessageStoreState) => T): T {
  const { store } = useMessageContextValue();
  const getSnapshot = () => selector(store.getState());
  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}

/**
 * Berlangganan hanya ke satu room. Selector mengembalikan primitif atau referensi array
 * room itu sendiri, jadi perubahan di room lain tidak memicu render.
 */
export const useRoomMessages = (roomId: string): RoomMessageState => {
  const messages = useStoreSelector((s) => s.messagesByRoom[roomId] ?? EMPTY_MESSAGES);
  const isLoading = useStoreSelector((s) => {
    const list = s.messagesByRoom[roomId];
    if (list && list.length > 0) return false;
    return Boolean(s.roomLoading[roomId]);
  });
  const isRevalidating = useStoreSelector((s) => Boolean(s.roomRevalidating[roomId]));
  const hasMoreOlder = useStoreSelector((s) => s.hasMoreOlder[roomId] !== false);
  const isLoadingOlder = useStoreSelector((s) => Boolean(s.loadingOlder[roomId]));

  return useMemo(
    () => ({ messages, isLoading, isRevalidating, hasMoreOlder, isLoadingOlder }),
    [messages, isLoading, isRevalidating, hasMoreOlder, isLoadingOlder]
  );
};
