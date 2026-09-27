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

  // Helper: Decrypt snippet for direct E2EE conversations
  const processConversations = useCallback(
    async (data: Conversation[]): Promise<Conversation[]> => {
      const currentUserId = user?.id;
      const privateKeyHex = e2eeKeyPair?.privateKeyHex;

      return Promise.all(
        data.map(async (c) => {
          const raw =
            typeof c.last_message === 'string'
              ? c.last_message
              : c.last_message?.content;

          if (!raw || !isEncryptedMessage(raw) || !currentUserId || !privateKeyHex) {
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
            return c;
          }

          // 3. Decrypt snippet using cached/derived AES key
          const plain = decryptSnippet(raw, c.id, peerPub, privateKeyHex);

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
    [user?.id, e2eeKeyPair?.privateKeyHex]
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
    [isAuthenticated, conversations.length, processConversations]
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
        }
        throw err;
      }
    },
    []
  );

  // Synchronize on authentication state changes
  useEffect(() => {
    if (!isAuthenticated) {
      setConversations([]);
      hasLoadedOnceRef.current = false;
      setIsLoading(false);
      setIsRefreshing(false);
      setError(null);
      return;
    }

    // Initial fetch when authenticated
    refreshConversations(false);
  }, [isAuthenticated]);

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
      setConversations(sortConversations(processed));
    });
  }, [e2eeKeyPair?.privateKeyHex, conversations, processConversations]);

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
