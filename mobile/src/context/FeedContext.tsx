/**
 * WuzzChat Community Social Feed Context & SWR Caching Layer
 * Milestone M-Mobile-9.3: Dual Tab (Terbaru & Jelajah Random) + Anti-Bloat Auto-Pruning
 * 
 * Performance & Offline First:
 * - Stale-While-Revalidate (SWR): Loads local SQLite cache in < 50ms on cold start.
 * - Non-blocking background revalidation via feedApi.getTimeline().
 * - 0ms Optimistic UI for Likes & Post Deletion with atomic rollback on network failure.
 * - Dual Tab architecture ('latest' vs 'explore') with stable session seed to prevent duplicate items.
 * - Memory & Storage Hardening: Local SQLite cache strictly capped at max 50 posts per tab (< 200 KB).
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Alert } from 'react-native';
import { feedApi } from '../api/feedApi';
import { CreateFeedPostRequest, FeedPost, FeedTabKey } from '../api/types';
import {
  deleteStoredFeedPost,
  getStoredFeedPosts,
  saveStoredFeedPosts,
  updateStoredFeedPostCommentsCount,
  updateStoredFeedPostLike,
} from '../services/sqliteStorage';
import { useAuth } from './AuthContext';

export interface FeedContextType {
  activeTab: FeedTabKey;
  setActiveTab: (tab: FeedTabKey) => void;
  posts: FeedPost[];
  isLoading: boolean;
  isRefreshing: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  refreshFeed: () => Promise<void>;
  loadMore: () => Promise<void>;
  toggleLike: (postId: string) => Promise<void>;
  createPost: (data: CreateFeedPostRequest) => Promise<FeedPost>;
  deletePost: (postId: string) => Promise<void>;
  updatePostCommentsCount: (postId: string, newCount: number) => void;
}

const FeedContext = createContext<FeedContextType | undefined>(undefined);

function generateExploreSeed(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
}

export const FeedProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isAuthenticated } = useAuth();
  const userId = user?.id || '';

  const [activeTab, setActiveTabState] = useState<FeedTabKey>('latest');
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [hasMore, setHasMore] = useState<boolean>(true);

  const nextCursorRef = useRef<string | undefined>(undefined);
  const exploreSeedRef = useRef<string>(generateExploreSeed());
  const exploreOffsetRef = useRef<number>(0);
  const isMountedRef = useRef<boolean>(true);
  // Guard per-postId untuk mencegah race condition rapid-tap like.
  // Selama request in-flight untuk suatu postId, klik berikutnya diabaikan.
  const likeInFlightRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  /**
   * SWR Step 1: Instant load from local SQLite cache (< 50ms) for given tab
   */
  const loadLocalCache = useCallback(
    async (tab: FeedTabKey) => {
      if (!userId) {
        setPosts([]);
        setIsLoading(false);
        return;
      }

      try {
        const cached = await getStoredFeedPosts(userId, tab, 30);
        if (isMountedRef.current && cached.length > 0) {
          setPosts(cached);
          // Instant visual feedback — user does not wait on cold start
          setIsLoading(false);
        }
      } catch (err) {
        console.warn('[FeedContext] Error loading local cache:', err);
      }
    },
    [userId]
  );

  /**
   * SWR Step 2: Background revalidation from backend API for given tab
   */
  const revalidateTimeline = useCallback(
    async (tab: FeedTabKey) => {
      if (!userId || !isAuthenticated) return;

      try {
        let res;
        if (tab === 'explore') {
          exploreOffsetRef.current = 0;
          res = await feedApi.getTimeline({
            tab: 'explore',
            seed: exploreSeedRef.current,
            offset: 0,
            limit: 20,
          });
        } else {
          res = await feedApi.getTimeline({
            tab: 'latest',
            limit: 20,
          });
        }

        if (!isMountedRef.current) return;

        const remotePosts = res.posts || [];
        nextCursorRef.current = res.next_cursor;
        setHasMore(Boolean(res.has_more));
        setPosts(remotePosts);

        // Async write-through cache to SQLite with auto-pruning cap
        await saveStoredFeedPosts(userId, remotePosts, tab);
      } catch (err) {
        console.warn('[FeedContext] Background revalidation failed (using cache):', err);
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
        }
      }
    },
    [userId, isAuthenticated]
  );

  /**
   * Switch active tab
   */
  const setActiveTab = useCallback(
    async (newTab: FeedTabKey) => {
      if (newTab === activeTab) return;
      setActiveTabState(newTab);
      setIsLoading(true);

      // Instant cache load for the target tab
      await loadLocalCache(newTab);
      // Background revalidation
      await revalidateTimeline(newTab);
    },
    [activeTab, loadLocalCache, revalidateTimeline]
  );

  // Initial load when user changes or authenticates
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      setIsLoading(true);
      await loadLocalCache(activeTab);
      if (!cancelled) {
        await revalidateTimeline(activeTab);
      }
    };

    if (isAuthenticated && userId) {
      init();
    } else {
      setPosts([]);
      setIsLoading(false);
    }

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, userId, activeTab, loadLocalCache, revalidateTimeline]);

  /**
   * Pull-to-refresh action
   */
  const refreshFeed = useCallback(async () => {
    if (!userId) return;
    setIsRefreshing(true);
    try {
      let res;
      if (activeTab === 'explore') {
        // Generate fresh seed on refresh to explore new content
        exploreSeedRef.current = generateExploreSeed();
        exploreOffsetRef.current = 0;
        res = await feedApi.getTimeline({
          tab: 'explore',
          seed: exploreSeedRef.current,
          offset: 0,
          limit: 20,
        });
      } else {
        res = await feedApi.getTimeline({
          tab: 'latest',
          limit: 20,
        });
      }

      if (!isMountedRef.current) return;

      const remotePosts = res.posts || [];
      nextCursorRef.current = res.next_cursor;
      setHasMore(Boolean(res.has_more));
      setPosts(remotePosts);

      await saveStoredFeedPosts(userId, remotePosts, activeTab);
    } catch (err) {
      console.warn('[FeedContext] Refresh failed:', err);
    } finally {
      if (isMountedRef.current) {
        setIsRefreshing(false);
      }
    }
  }, [userId, activeTab]);

  /**
   * Infinite scroll: load more posts using cursor or offset pagination
   */
  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore || !userId) return;

    setIsLoadingMore(true);
    try {
      let res;
      if (activeTab === 'explore') {
        const nextOffset = exploreOffsetRef.current + 20;
        res = await feedApi.getTimeline({
          tab: 'explore',
          seed: exploreSeedRef.current,
          offset: nextOffset,
          limit: 20,
        });
        if (res.posts && res.posts.length > 0) {
          exploreOffsetRef.current = nextOffset;
        }
      } else {
        let cursor = nextCursorRef.current;
        if (!cursor && posts.length > 0) {
          const nonPinned = posts.filter((p) => !p.is_pinned);
          const oldest = nonPinned[nonPinned.length - 1] || posts[posts.length - 1];
          cursor = oldest.created_at;
        }
        if (!cursor) {
          setIsLoadingMore(false);
          return;
        }
        res = await feedApi.getTimeline({
          tab: 'latest',
          before: cursor,
          limit: 20,
        });
      }

      if (!isMountedRef.current) return;

      const incoming = res.posts || [];
      nextCursorRef.current = res.next_cursor;
      setHasMore(Boolean(res.has_more));

      if (incoming.length > 0) {
        setPosts((prev) => {
          const existingIds = new Set(prev.map((p) => p.id));
          const uniqueNew = incoming.filter((p) => !existingIds.has(p.id));
          const combined = [...prev, ...uniqueNew];
          saveStoredFeedPosts(userId, uniqueNew, activeTab).catch(() => {});
          return combined;
        });
      }
    } catch (err) {
      console.warn('[FeedContext] loadMore failed:', err);
    } finally {
      if (isMountedRef.current) {
        setIsLoadingMore(false);
      }
    }
  }, [isLoadingMore, hasMore, userId, activeTab, posts]);

  /**
   * 0ms Optimistic UI for toggling Like on a post.
   * 
   * Fix race condition:
   * - Per-post in-flight lock: jika request sedang berjalan untuk postId ini,
   *   klik berikutnya langsung diabaikan hingga request selesai.
   * - Functional setPosts updater: selalu membaca state terkini, bukan snapshot
   *   closure lama, sehingga rollback selalu akurat.
   * - 'posts' dihapus dari dependency array untuk mencegah stale closure inflight.
   */
  const toggleLike = useCallback(
    async (postId: string) => {
      if (!userId) return;

      // Guard: Jika masih ada request in-flight untuk postId ini, abaikan klik.
      // Ini mencegah race condition saat user tap berkali-kali dengan cepat.
      if (likeInFlightRef.current.has(postId)) return;
      likeInFlightRef.current.add(postId);

      // Baca state terkini via functional updater pattern untuk dapat snapshot akurat.
      let prevLiked = false;
      let prevCount = 0;
      let newLiked = false;
      let newCount = 0;

      setPosts((prev) => {
        const target = prev.find((p) => p.id === postId);
        if (!target) return prev;

        prevLiked = target.is_liked;
        prevCount = target.likes_count;
        newLiked = !prevLiked;
        newCount = newLiked ? prevCount + 1 : Math.max(0, prevCount - 1);

        // 1. Optimistic UI update (0ms instant animation)
        return prev.map((p) =>
          p.id === postId ? { ...p, is_liked: newLiked, likes_count: newCount } : p
        );
      });

      // 2. Optimistic SQLite update
      await updateStoredFeedPostLike(userId, postId, newLiked, newCount);

      // 3. Network call — sinkronisasi dengan server, rollback jika gagal
      try {
        const res = await feedApi.toggleLike(postId);
        // Server adalah sumber kebenaran: selalu sinkronkan dengan respons server
        setPosts((prev) =>
          prev.map((p) =>
            p.id === postId
              ? { ...p, is_liked: res.liked, likes_count: res.likes_count }
              : p
          )
        );
        await updateStoredFeedPostLike(userId, postId, res.liked, res.likes_count);
      } catch (err) {
        console.warn('[FeedContext] Like toggle failed, rolling back to pre-tap state:', err);
        // Rollback ke kondisi sebelum tap (prevLiked/prevCount di-capture dari functional updater)
        setPosts((prev) =>
          prev.map((p) =>
            p.id === postId ? { ...p, is_liked: prevLiked, likes_count: prevCount } : p
          )
        );
        await updateStoredFeedPostLike(userId, postId, prevLiked, prevCount);
        Alert.alert('Gagal Menyukai', 'Koneksi terputus. Silakan coba beberapa saat lagi.');
      } finally {
        // Lepas lock agar klik berikutnya bisa diproses kembali
        likeInFlightRef.current.delete(postId);
      }
    },
    [userId]
  );

  /**
   * Create a new post
   */
  const createPost = useCallback(
    async (data: CreateFeedPostRequest): Promise<FeedPost> => {
      const created = await feedApi.createPost(data);

      setPosts((prev) => {
        let updated: FeedPost[];
        if (created.is_pinned) {
          updated = [created, ...prev];
        } else {
          const pinned = prev.filter((p) => p.is_pinned);
          const nonPinned = prev.filter((p) => !p.is_pinned);
          updated = [...pinned, created, ...nonPinned];
        }
        if (userId) {
          saveStoredFeedPosts(userId, [created], activeTab).catch(() => {});
        }
        return updated;
      });

      return created;
    },
    [userId, activeTab]
  );

  /**
   * Delete post
   */
  const deletePost = useCallback(
    async (postId: string): Promise<void> => {
      if (!userId) return;

      const postToDelete = posts.find((p) => p.id === postId);

      setPosts((prev) => prev.filter((p) => p.id !== postId));
      await deleteStoredFeedPost(userId, postId);

      try {
        await feedApi.deletePost(postId);
      } catch (err: any) {
        console.warn('[FeedContext] deletePost failed, restoring:', err);
        if (postToDelete) {
          setPosts((prev) => [postToDelete, ...prev]);
          await saveStoredFeedPosts(userId, [postToDelete], activeTab);
        }
        Alert.alert(
          'Gagal Menghapus Postingan',
          err?.message || 'Terjadi kesalahan saat menghapus postingan.'
        );
        throw err;
      }
    },
    [userId, posts, activeTab]
  );

  /**
   * Sync comments count on a post
   */
  const updatePostCommentsCount = useCallback(
    (postId: string, newCount: number) => {
      setPosts((prev) =>
        prev.map((p) => (p.id === postId ? { ...p, comments_count: newCount } : p))
      );
      if (userId) {
        updateStoredFeedPostCommentsCount(userId, postId, newCount).catch(() => {});
      }
    },
    [userId]
  );

  return (
    <FeedContext.Provider
      value={{
        activeTab,
        setActiveTab,
        posts,
        isLoading,
        isRefreshing,
        isLoadingMore,
        hasMore,
        refreshFeed,
        loadMore,
        toggleLike,
        createPost,
        deletePost,
        updatePostCommentsCount,
      }}
    >
      {children}
    </FeedContext.Provider>
  );
};

export const useFeed = (): FeedContextType => {
  const context = useContext(FeedContext);
  if (!context) {
    throw new Error('useFeed must be used within a FeedProvider');
  }
  return context;
};
