/**
 * WuzzChat Mobile - ConversationContext
 * Global Conversations Cache & Stale-While-Revalidate (SWR) Layer.
 * Conforms to docs/context/MOBILE.md Section 2.E & M-Mobile-8.15.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { conversationsApi } from '../api/conversations';
import { getUserPublicKey } from '../api/users';
import { Conversation } from '../api/types';
import { useAuth } from './AuthContext';
import { websocketClient } from '../services/websocket';
import {
  cachePeerPublicKey,
  decryptSnippet,
  getCachedPeerPublicKey,
  isEncryptedMessage,
} from '../services/crypto';
import {
  getStoredConversations,
  saveStoredConversations,
  updateStoredConversationPin as persistConversationPin,
} from '../services/sqliteStorage';
import { secureStorage } from '../services/secureStorage';

export interface ConversationContextType {
  conversations: Conversation[];
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  refreshConversations: (isSilent?: boolean) => Promise<void>;
  updateConversationPin: (roomId: string, isPinned: boolean) => Promise<void>;
}

const ConversationContext = createContext<ConversationContextType | undefined>(undefined);

export const ConversationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isAuthenticated, e2eeKeyPair } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const hasLoadedOnceRef = useRef<boolean>(false);
  const isFetchingRef = useRef<boolean>(false);
  const pendingRefreshRef = useRef<boolean>(false);

  // Synchronized refs to prevent stale closure race conditions
  const conversationsRef = useRef<Conversation[]>(conversations);
  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  const e2eeKeyPairRef = useRef(e2eeKeyPair);
  useEffect(() => {
    e2eeKeyPairRef.current = e2eeKeyPair;
  }, [e2eeKeyPair]);

  // Helper: Decrypt snippet for direct E2EE conversations with Anti-Regression Guard
  const processConversations = useCallback(
    async (data: Conversation[]): Promise<Conversation[]> => {
      const currentUserId = user?.id;
      if (!currentUserId || !data || data.length === 0) return data;

      // 1. Resolve private key from synchronized ref or fallback directly to hardware SecureStore
      let privateKeyHex = e2eeKeyPairRef.current?.privateKeyHex;
      if (!privateKeyHex) {
        try {
          const storedKey = await secureStorage.getE2EEKeyPair(currentUserId);
          if (storedKey?.privateKeyHex) {
            privateKeyHex = storedKey.privateKeyHex;
          }
        } catch {
          // ignore read error
        }
      }

      // 2. Build existing clean decrypted snippets map to prevent regression to lock icon
      const existingCleanMap = new Map<string, string>();
      conversationsRef.current.forEach((c) => {
        const msg =
          typeof c.last_message === 'string'
            ? c.last_message
            : c.last_message?.content;
        if (msg && !isEncryptedMessage(msg) && !msg.startsWith('e2ee:') && !msg.startsWith('🔒')) {
          existingCleanMap.set(c.id, msg);
        }
      });

      return Promise.all(
        data.map(async (c) => {
          const raw =
            typeof c.last_message === 'string'
              ? c.last_message
              : c.last_message?.content;

          // If raw is already decrypted and clean, preserve it
          if (!raw || (!isEncryptedMessage(raw) && !raw.startsWith('e2ee:') && !raw.startsWith('🔒'))) {
            return c;
          }

          // If private key is unavailable right now, check if we already have clean decrypted text in cache
          if (!privateKeyHex) {
            const clean = existingCleanMap.get(c.id);
            if (clean) {
              if (typeof c.last_message === 'object' && c.last_message !== null) {
                return {
                  ...c,
                  last_message: { ...c.last_message, content: clean },
                };
              }
              return { ...c, last_message: clean };
            }
            return c;
          }

          // 1. Resolve Peer ID for direct conversation
          let peerId = c.peer_id || '';
          if (!peerId && c.id && c.id.startsWith('dm_')) {
            const parts = c.id.replace(/^dm_/, '').split('_');
            peerId = parts[0] === currentUserId ? parts[1] : parts[0];
          }
          if (!peerId && c.participants?.length) {
            const other = c.participants.find((p) => p.id !== currentUserId);
            peerId = other?.id || '';
          }

          if (!peerId) {
            const clean = existingCleanMap.get(c.id);
            if (clean) {
              return typeof c.last_message === 'object' && c.last_message !== null
                ? { ...c, last_message: { ...c.last_message, content: clean } }
                : { ...c, last_message: clean };
            }
            return c;
          }

          // 2. Resolve Peer Public Key (cache-first to prevent network spam)
          let peerPub = c.peer_public_key || getCachedPeerPublicKey(peerId);
          if (!peerPub) {
            try {
              peerPub = (await getUserPublicKey(peerId)) || undefined;
              if (peerPub) {
                cachePeerPublicKey(peerId, peerPub);
              }
            } catch {
              // ignore fetch failure
            }
          } else {
            cachePeerPublicKey(peerId, peerPub);
          }

          if (!peerPub) {
            const clean = existingCleanMap.get(c.id);
            if (clean) {
              return typeof c.last_message === 'object' && c.last_message !== null
                ? { ...c, last_message: { ...c.last_message, content: clean } }
                : { ...c, last_message: clean };
            }
            return c;
          }

          // 3. Decrypt snippet using cached/derived AES key
          let plain = decryptSnippet(raw, c.id, peerPub, privateKeyHex);

          // If decryption returned placeholder lock icon but we already have clean plaintext, preserve clean plaintext!
          if (isEncryptedMessage(plain) || plain.startsWith('🔒') || plain.startsWith('e2ee:')) {
            const clean = existingCleanMap.get(c.id);
            if (clean) {
              plain = clean;
            }
          }

          if (typeof c.last_message === 'object' && c.last_message !== null) {
            return {
              ...c,
              last_message: {
                ...c.last_message,
                content: plain,
              },
            };
          } else {
            return {
              ...c,
              last_message: plain,
            };
          }
        })
      );
    },
    [user?.id]
  );

  // Helper: Sort conversations (pinned first, then latest timestamp descending)
  const sortConversations = (list: Conversation[]): Conversation[] => {
    return [...list].sort((a, b) => {
      const aPinned = a.is_pinned || a.pinned ? 1 : 0;
      const bPinned = b.is_pinned || b.pinned ? 1 : 0;
      if (aPinned !== bPinned) return bPinned - aPinned;

      const aTime = new Date(
        a.updated_at ||
          (typeof a.last_message === 'object'
            ? a.last_message?.timestamp || a.last_message?.created_at
            : undefined) ||
          0
      ).getTime();
      const bTime = new Date(
        b.updated_at ||
          (typeof b.last_message === 'object'
            ? b.last_message?.timestamp || b.last_message?.created_at
            : undefined) ||
          0
      ).getTime();
      return bTime - aTime;
    });
  };

  /**
   * Main fetch/refresh function.
   * If isSilent: true, runs in background without showing main spinner (SWR pattern).
   */
  const refreshConversations = useCallback(
    async (isSilent = false) => {
      if (!isAuthenticated) return;

      if (isFetchingRef.current) {
        pendingRefreshRef.current = true;
        return;
      }

      isFetchingRef.current = true;

      if (isSilent) {
        // Background revalidation: keep existing loading/refreshing states untouched
      } else if (!hasLoadedOnceRef.current && conversations.length === 0) {
        setIsLoading(true);
      } else {
        setIsRefreshing(true);
      }

      try {
        const rawData = await conversationsApi.getConversations();
        if (!rawData) {
          setConversations([]);
        } else {
          const processed = await processConversations(rawData);
          const sorted = sortConversations(processed);
          setConversations(sorted);
          if (user?.id) {
            saveStoredConversations(user.id, sorted).catch((e) =>
              console.warn('[ConversationContext] Failed to persist conversations to SQLite:', e)
            );
          }
        }
        setError(null);
        hasLoadedOnceRef.current = true;
      } catch (err: any) {
        console.warn('[ConversationContext] Failed to load conversations:', err);
        setError(err?.message || 'Gagal memuat daftar obrolan');
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
        isFetchingRef.current = false;

        // If a message arrived while we were fetching, trigger another silent refresh
        if (pendingRefreshRef.current) {
          pendingRefreshRef.current = false;
          refreshConversations(true);
        }
      }
    },
    [isAuthenticated, user?.id, conversations.length, processConversations]
  );

  /**
   * Optimistic update for pinning/unpinning a conversation
   */
  const updateConversationPin = useCallback(
    async (roomId: string, isPinned: boolean) => {
      if (!roomId) return;

      let rollbackState: Conversation[] = [];
      setConversations((prev) => {
        rollbackState = prev;
        const updated = prev.map((c) =>
          c.id === roomId || c.room_id === roomId
            ? { ...c, is_pinned: isPinned, pinned: isPinned }
            : c
        );
        return sortConversations(updated);
      });

      if (user?.id) {
        persistConversationPin(user.id, roomId, isPinned).catch(() => {});
      }

      try {
        if (isPinned) {
          await conversationsApi.pinConversation(roomId);
        } else {
          await conversationsApi.unpinConversation(roomId);
        }
      } catch (err: any) {
        console.error('[ConversationContext] Failed to toggle pin:', err);
        // Rollback on failure
        if (rollbackState.length > 0) {
          setConversations(rollbackState);
          if (user?.id) {
            persistConversationPin(user.id, roomId, !isPinned).catch(() => {});
          }
        }
        throw err;
      }
    },
    [user?.id]
  );

  // Synchronize on authentication state changes (Cache-First Hydration)
  useEffect(() => {
    if (!isAuthenticated || !user?.id) {
      setConversations([]);
      hasLoadedOnceRef.current = false;
      setIsLoading(false);
      setIsRefreshing(false);
      setError(null);
      return;
    }

    let isMounted = true;

    const hydrateFromLocalDB = async () => {
      let hasLocalData = false;
      try {
        const localData = await getStoredConversations(user.id);
        if (isMounted && localData && localData.length > 0) {
          // Process decryption on local data immediately before setting state
          const processedLocal = await processConversations(localData);
          const sorted = sortConversations(processedLocal);
          setConversations(sorted);
          hasLoadedOnceRef.current = true;
          hasLocalData = true;
          // INSTANT COLD START RENDER: eliminate loading spinner immediately
          setIsLoading(false);
        }
      } catch (err) {
        console.warn('[ConversationContext] Local SQLite hydration error:', err);
      }

      // Revalidate in background: silent if local data was loaded, or full spinner if first install
      if (isMounted) {
        refreshConversations(hasLocalData);
      }
    };

    hydrateFromLocalDB();

    return () => {
      isMounted = false;
    };
  }, [isAuthenticated, user?.id]);

  // Re-process cached conversations as soon as E2EE private key is initialized/available
  useEffect(() => {
    if (!e2eeKeyPair?.privateKeyHex || conversations.length === 0) return;

    let hasEncrypted = false;
    for (const c of conversations) {
      const raw =
        typeof c.last_message === 'string'
          ? c.last_message
          : c.last_message?.content;
      if (raw && isEncryptedMessage(raw)) {
        hasEncrypted = true;
        break;
      }
    }
    if (!hasEncrypted) return;

    processConversations(conversations).then((processed) => {
      const sorted = sortConversations(processed);
      setConversations(sorted);
      if (user?.id) {
        saveStoredConversations(user.id, sorted).catch(() => {});
      }
    });
  }, [e2eeKeyPair?.privateKeyHex, conversations, processConversations, user?.id]);

  // Centralized WebSocket listener: ingest incoming 'message' events for silent revalidation
  useEffect(() => {
    if (!isAuthenticated) return;

    const unsubscribeMsg = websocketClient.on('message', () => {
      // Ingest live incoming message event and revalidate in background
      refreshConversations(true);
    });

    return () => {
      unsubscribeMsg();
    };
  }, [isAuthenticated, refreshConversations]);

  return (
    <ConversationContext.Provider
      value={{
        conversations,
        isLoading,
        isRefreshing,
        error,
        refreshConversations,
        updateConversationPin,
      }}
    >
      {children}
    </ConversationContext.Provider>
  );
};

export const useConversations = (): ConversationContextType => {
  const context = useContext(ConversationContext);
  if (!context) {
    throw new Error('useConversations must be used within a ConversationProvider');
  }
  return context;
};
