/**
 * WuzzChat Mobile - Connection & Friendlist Context
 * Milestone M-Mobile-10: Scalable User Connections & Friendlist Engine
 * 
 * Performance & Offline First:
 * - Stale-While-Revalidate (SWR): Loads cached friends from local SQLite in < 50ms on cold start.
 * - Non-blocking background sync via connectionsApi.getFriends().
 * - 0ms Optimistic UI updates for Accepting/Declining requests and Unfriending.
 * - Real-time pending requests badge tracking for navigation header.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { connectionsApi } from '../api/connections';
import {
  ConnectionSourceType,
  ConnectionStatusResponse,
  FriendItem,
  PendingRequestItem,
  UserConnection,
} from '../api/types';
import {
  getLocalFriends,
  removeLocalFriend,
  saveLocalFriends,
} from '../services/sqliteStorage';
import { useAuth } from './AuthContext';

export interface ConnectionContextType {
  friends: FriendItem[];
  incomingRequests: PendingRequestItem[];
  outgoingRequests: PendingRequestItem[];
  pendingCount: number;
  isLoading: boolean;
  isRefreshing: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  cursor: string | null;
  refreshFriends: () => Promise<void>;
  loadMoreFriends: () => Promise<void>;
  fetchPendingRequests: () => Promise<void>;
  sendFriendRequest: (
    targetUserId: string,
    sourceType?: ConnectionSourceType
  ) => Promise<UserConnection>;
  respondFriendRequest: (
    connectionId: string,
    action: 'accept' | 'decline'
  ) => Promise<UserConnection>;
  unfriend: (targetUserId: string) => Promise<void>;
  checkConnectionStatus: (targetUserId: string) => Promise<ConnectionStatusResponse>;
}

const ConnectionContext = createContext<ConnectionContextType | undefined>(undefined);

export const ConnectionProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { user, isAuthenticated } = useAuth();
  const userId = user?.id || '';

  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<PendingRequestItem[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<PendingRequestItem[]>([]);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState<boolean>(false);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);

  const isMountedRef = useRef<boolean>(true);
  const statusCacheRef = useRef<Map<string, { data: ConnectionStatusResponse; expiresAt: number }>>(
    new Map()
  );

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  /**
   * Fetch pending connection requests (both incoming and outgoing).
   */
  const fetchPendingRequests = useCallback(async () => {
    if (!isAuthenticated || !userId) return;

    try {
      const allRequests = await connectionsApi.getPendingRequests('all');
      if (!isMountedRef.current) return;

      const incoming = (allRequests || []).filter((r) => r.direction === 'incoming');
      const outgoing = (allRequests || []).filter((r) => r.direction === 'outgoing');

      setIncomingRequests(incoming);
      setOutgoingRequests(outgoing);
      setPendingCount(incoming.length);
    } catch (error) {
      console.warn('[ConnectionContext] Failed to fetch pending requests:', error);
    }
  }, [isAuthenticated, userId]);

  /**
   * Refreshes friends list from network and updates local SQLite cache.
   */
  const refreshFriends = useCallback(async () => {
    if (!isAuthenticated || !userId) return;

    try {
      setIsRefreshing(true);
      const res = await connectionsApi.getFriends(undefined, 50);
      if (!isMountedRef.current) return;

      const freshFriends = res.friends || [];
      setFriends(freshFriends);
      setCursor(res.next_cursor || null);
      setHasMore(res.has_more);

      // Async write to SQLite cache
      await saveLocalFriends(userId, freshFriends);
    } catch (error) {
      console.warn('[ConnectionContext] Failed to refresh friends:', error);
    } finally {
      if (isMountedRef.current) {
        setIsRefreshing(false);
      }
    }
  }, [isAuthenticated, userId]);

  /**
   * Loads next page of friends using cursor-based pagination.
   */
  const loadMoreFriends = useCallback(async () => {
    if (!isAuthenticated || !userId || isLoadingMore || !hasMore || !cursor) {
      return;
    }

    try {
      setIsLoadingMore(true);
      const res = await connectionsApi.getFriends(cursor, 50);
      if (!isMountedRef.current) return;

      const newFriends = res.friends || [];
      setFriends((prev) => {
        const existingIds = new Set(prev.map((f) => f.id));
        const filteredNew = newFriends.filter((f) => !existingIds.has(f.id));
        return [...prev, ...filteredNew];
      });

      setCursor(res.next_cursor || null);
      setHasMore(res.has_more);

      // Save additional items to SQLite
      if (newFriends.length > 0) {
        await saveLocalFriends(userId, newFriends);
      }
    } catch (error) {
      console.warn('[ConnectionContext] Failed to loadMoreFriends:', error);
    } finally {
      if (isMountedRef.current) {
        setIsLoadingMore(false);
      }
    }
  }, [isAuthenticated, userId, isLoadingMore, hasMore, cursor]);

  /**
   * SWR Initial Load:
   * 1. Reads local SQLite cache immediately (< 50ms render).
   * 2. Fires network refresh in background.
   */
  useEffect(() => {
    if (!isAuthenticated || !userId) {
      setFriends([]);
      setIncomingRequests([]);
      setOutgoingRequests([]);
      setPendingCount(0);
      setCursor(null);
      setHasMore(false);
      return;
    }

    let isCancelled = false;

    const initData = async () => {
      setIsLoading(true);

      // Step 1: Read local cache first
      try {
        const cached = await getLocalFriends(userId);
        if (!isCancelled && cached.length > 0) {
          setFriends(cached);
        }
      } catch (err) {
        console.warn('[ConnectionContext] Cache read error:', err);
      }

      // Step 2: Background revalidation
      try {
        await Promise.all([refreshFriends(), fetchPendingRequests()]);
      } catch (err) {
        console.warn('[ConnectionContext] Background sync error:', err);
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    initData();

    return () => {
      isCancelled = true;
    };
  }, [isAuthenticated, userId, refreshFriends, fetchPendingRequests]);

  /**
   * Send a new friend connection request.
   */
  const sendFriendRequest = useCallback(
    async (
      targetUserId: string,
      sourceType: ConnectionSourceType = 'in_app_request'
    ): Promise<UserConnection> => {
      const conn = await connectionsApi.requestConnection(targetUserId, sourceType);

      // If bilateral mutual request was accepted immediately, refresh friends
      if (conn.status === 'accepted') {
        await refreshFriends();
      }

      // Always re-sync pending requests to update badges
      await fetchPendingRequests();

      // Invalidate connection status cache for this user
      statusCacheRef.current.delete(targetUserId);

      return conn;
    },
    [refreshFriends, fetchPendingRequests]
  );

  /**
   * Respond to incoming friend request with 0ms Optimistic UI.
   */
  const respondFriendRequest = useCallback(
    async (
      connectionId: string,
      action: 'accept' | 'decline'
    ): Promise<UserConnection> => {
      // 0ms Optimistic UI: Remove request from incoming state immediately
      const prevIncoming = [...incomingRequests];
      setIncomingRequests((prev) => prev.filter((r) => r.id !== connectionId));
      setPendingCount((prev) => Math.max(0, prev - 1));

      try {
        const result = await connectionsApi.respondConnection(connectionId, action);

        // If accepted, refresh friends list to include the new friend
        if (action === 'accept') {
          await refreshFriends();
        }

        // Invalidate status cache on friend request response
        statusCacheRef.current.clear();

        return result;
      } catch (error) {
        // Rollback optimistic update on network failure
        setIncomingRequests(prevIncoming);
        setPendingCount(prevIncoming.length);
        throw error;
      }
    },
    [incomingRequests, refreshFriends]
  );

  /**
   * Remove friend (unfriend) with 0ms Optimistic UI.
   */
  const unfriend = useCallback(
    async (targetUserId: string): Promise<void> => {
      const prevFriends = [...friends];

      // Optimistic remove
      setFriends((prev) => prev.filter((f) => f.id !== targetUserId));
      await removeLocalFriend(userId, targetUserId);

      try {
        await connectionsApi.unfriend(targetUserId);
        statusCacheRef.current.delete(targetUserId);
      } catch (error) {
        // Rollback on failure
        setFriends(prevFriends);
        await saveLocalFriends(userId, prevFriends);
        throw error;
      }
    },
    [friends, userId]
  );

  /**
   * Check connection status with a specific user.
   * Optimized with:
   * 1. Local Fast-Path: Returns accepted immediately if peer is already in local friends (0ms, 0 network).
   * 2. In-Memory Cache (TTL 2 minutes): Prevents redundant HTTP calls when repeatedly switching chats.
   */
  const checkConnectionStatus = useCallback(
    async (targetUserId: string): Promise<ConnectionStatusResponse> => {
      if (!targetUserId) {
        throw new Error('targetUserId is required');
      }

      // 1. Fast-Path Lokal: Jika sudah ada di friends lokal, status pasti 'accepted'
      const localFriend = friends.find((f) => f.id === targetUserId);
      if (localFriend) {
        return {
          status: 'accepted',
          direction: '',
          connection_id: localFriend.connection_id,
          is_private_account: Boolean(localFriend.is_private_account),
          can_message: true,
          can_call: true,
        };
      }

      // 2. In-Memory Cache (TTL 2 Menit)
      const now = Date.now();
      const cached = statusCacheRef.current.get(targetUserId);
      if (cached && cached.expiresAt > now) {
        return cached.data;
      }

      // 3. Network Fetch
      const res = await connectionsApi.getConnectionStatus(targetUserId);
      statusCacheRef.current.set(targetUserId, {
        data: res,
        expiresAt: now + 120_000, // 2 minutes TTL
      });
      return res;
    },
    [friends]
  );

  const value = {
    friends,
    incomingRequests,
    outgoingRequests,
    pendingCount,
    isLoading,
    isRefreshing,
    isLoadingMore,
    hasMore,
    cursor,
    refreshFriends,
    loadMoreFriends,
    fetchPendingRequests,
    sendFriendRequest,
    respondFriendRequest,
    unfriend,
    checkConnectionStatus,
  };

  return (
    <ConnectionContext.Provider value={value}>
      {children}
    </ConnectionContext.Provider>
  );
};

export const useConnection = (): ConnectionContextType => {
  const context = useContext(ConnectionContext);
  if (!context) {
    throw new Error('useConnection must be used within a ConnectionProvider');
  }
  return context;
};
