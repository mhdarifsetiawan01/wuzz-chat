/**
 * WuzzChat Mobile UI — FeedScreen
 * Milestone M-Mobile-9.3: Real Production Community Social Feed
 * 
 * Features:
 * - Real timeline powered by SWR FeedContext & SQLite local cache (< 50ms cold start)
 * - Sticky Pinned posts & official badges (Announcement, Article, Sponsored)
 * - Image media grid previews
 * - Moderation controls (Delete Post) for Author, wuzz_admin, and wuzz_moderator
 * - 0ms Optimistic Like reaction
 * - Floating Action Button (FAB +) with safe-area spacing
 * - CreatePostModal, PostCommentsModal, and SharePostToChatModal integrations
 */

import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FeedPost } from '../api/types';
import { Avatar } from '../components/Avatar';
import { ReportModal, ReportTarget } from '../components/ReportModal';
import { CreatePostModal } from '../components/CreatePostModal';
import { ExpandableText } from '../components/ExpandableText';
import { LinkPreviewCard } from '../components/LinkPreviewCard';
import { MediaViewerModal } from '../components/MediaViewerModal';
import { PostMedia } from '../components/PostMedia';
import { PostCommentsModal } from '../components/PostCommentsModal';
import { SharePostToChatModal } from '../components/SharePostToChatModal';
import { useAuth, useFeed } from '../context';
import { RootStackParamList } from '../navigation/types';
import { colors, spacing } from '../theme';
import { IconText } from '../components/IconText';
import { VerifiedBadge } from '../components/VerifiedBadge';
import { formatPostTime } from '../utils/feedTime';
import { extractFirstUrl } from '../utils/linkUtils';
import { showAlert } from '../services/dialog';

const COLLAPSED_LINES = 6;

export const FeedScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = useAuth();
  const {
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
    deletePost,
  } = useFeed();

  // Modal states
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [activeCommentsPost, setActiveCommentsPost] = useState<FeedPost | null>(null);
  const [activeSharePost, setActiveSharePost] = useState<FeedPost | null>(null);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);

  const openReader = useCallback(
    (post: FeedPost) => navigation.navigate('PostReader', { postId: post.id, initialPost: post }),
    [navigation]
  );

  const canModeratePost = (post: FeedPost): boolean => {
    if (!user) return false;
    const isAuthor =
      (post.author?.id && post.author.id === user.id) ||
      (post.user_id && post.user_id === user.id);
    const isStaff =
      user.system_role === 'wuzz_admin' || user.system_role === 'wuzz_moderator';
    return Boolean(isAuthor || isStaff);
  };

  const handleDeletePress = (post: FeedPost) => {
    showAlert(
      'Hapus Postingan',
      'Apakah Anda yakin ingin menghapus postingan ini dari linimasa komunitas?',
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Hapus',
          style: 'destructive',
          onPress: async () => {
            try {
              await deletePost(post.id);
            } catch (err: any) {
              console.warn('[FeedScreen] Delete error:', err);
            }
          },
        },
      ]
    );
  };

  const renderBadge = (post: FeedPost) => {
    if (post.post_type === 'announcement') {
      return (
        <View style={[styles.badgeBase, styles.announcementBadge]}>
          <IconText style={styles.announcementBadgeText}>📢 Pengumuman Resmi</IconText>
        </View>
      );
    }
    if (post.post_type === 'sponsored') {
      return (
        <View style={[styles.badgeBase, styles.sponsoredBadge]}>
          <IconText style={styles.sponsoredBadgeText}>⭐ Sponsored</IconText>
        </View>
      );
    }
    if (post.post_type === 'article') {
      return (
        <View style={[styles.badgeBase, styles.articleBadge]}>
          <IconText style={styles.articleBadgeText}>📰 Artikel</IconText>
        </View>
      );
    }
    return null;
  };

  const renderLinkPreview = (content: string) => {
    const url = extractFirstUrl(content);
    return url ? <LinkPreviewCard url={url} /> : null;
  };

  const renderPostItem = ({ item }: { item: FeedPost }) => {
    const isPinned = item.is_pinned;
    const authorName = item.author?.display_name || item.author?.username || 'Pengguna';
    const isVerified = Boolean(item.author?.is_verified);
    const roleText = item.author?.role;

    return (
      <View style={[styles.postCard, isPinned && styles.postCardPinned]}>
        {/* Pinned Indicator Header */}
        {isPinned && (
          <View style={styles.pinnedHeader}>
            <IconText style={styles.pinnedIcon}>📌</IconText>
            <Text style={styles.pinnedText}>Disematkan oleh Admin</Text>
          </View>
        )}

        {/* Post Author Header */}
        <View style={styles.postAuthorRow}>
          <Avatar
            name={authorName}
            avatarUrl={item.author?.avatar_url}
            size={44}
            shape="circle"
          />
          <View style={styles.postAuthorInfo}>
            <View style={styles.authorNameRow}>
              <Text style={styles.authorName} numberOfLines={1}>
                {authorName}
              </Text>
              {isVerified && <VerifiedBadge size={14} style={{ marginLeft: spacing.xs }} />}
              {renderBadge(item)}
            </View>

            <View style={styles.authorSubRow}>
              {roleText ? (
                <Text style={styles.authorRole}>{roleText} • </Text>
              ) : null}
              <Text style={styles.postTimeAgo}>{formatPostTime(item.created_at)}</Text>
            </View>
          </View>

          {/* Laporkan (postingan orang lain) */}
          {!(item.author?.id === user?.id || item.user_id === user?.id) && (
            <TouchableOpacity
              style={styles.modDeleteBtn}
              onPress={() =>
                setReportTarget({
                  type: 'post',
                  id: item.id,
                  userId: item.author?.id || item.user_id,
                  evidence: item.content,
                  label: 'postingan',
                })
              }
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Laporkan postingan"
            >
              <IconText style={styles.modDeleteText}>🚩</IconText>
            </TouchableOpacity>
          )}

          {/* Moderation Menu */}
          {canModeratePost(item) && (
            <TouchableOpacity
              style={styles.modDeleteBtn}
              onPress={() => handleDeletePress(item)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <IconText style={styles.modDeleteText}>🗑️</IconText>
            </TouchableOpacity>
          )}
        </View>

        {/* Post Content */}
        <ExpandableText
          text={item.content}
          cacheKey={item.id}
          numberOfLines={COLLAPSED_LINES}
          style={styles.postContent}
          onExpand={() => openReader(item)}
        />

        {/* Link preview untuk URL pertama (di-throttle & di-cache di fetchLinkPreview) */}
        {renderLinkPreview(item.content)}

        {/* Attached Media Grid (ketuk untuk zoom) */}
        <PostMedia urls={item.media_urls} onPressImage={setViewerUrl} />

        {/* Post Actions (Like, Comment, Share to Chat) */}
        <View style={styles.postActionsRow}>
          {/* Like Button */}
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => toggleLike(item.id)}
            activeOpacity={0.7}
          >
            <IconText style={styles.actionIcon}>{item.is_liked ? '❤️' : '🤍'}</IconText>
            <Text
              style={[
                styles.actionCount,
                item.is_liked && styles.actionCountLiked,
              ]}
            >
              {item.likes_count}
            </Text>
          </TouchableOpacity>

          {/* Comments Button */}
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => setActiveCommentsPost(item)}
            activeOpacity={0.7}
          >
            <IconText style={styles.actionIcon}>💬</IconText>
            <Text style={styles.actionCount}>{item.comments_count}</Text>
          </TouchableOpacity>

          {/* Share to Chat Button (Viral Loop) */}
          <TouchableOpacity
            style={styles.actionBtnShare}
            onPress={() => setActiveSharePost(item)}
            activeOpacity={0.7}
          >
            <IconText style={styles.actionIconShare}>↗️</IconText>
            <Text style={styles.actionCountShare}>Bagikan ke Obrolan</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderEmptyComponent = () => {
    if (isLoading) {
      return (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.accentPrimary} />
          <Text style={styles.centerText}>Memuat linimasa komunitas...</Text>
        </View>
      );
    }

    return (
      <View style={styles.emptyContainer}>
        <IconText style={styles.emptyIcon}>🌐</IconText>
        <Text style={styles.emptyTitle}>Belum Ada Postingan</Text>
        <Text style={styles.emptySubtitle}>
          Jadilah yang pertama membagikan pembaruan atau ide di Komunitas WuzzChat!
        </Text>
        <TouchableOpacity
          style={styles.emptyCreateBtn}
          onPress={() => setIsCreateModalOpen(true)}
        >
          <Text style={styles.emptyCreateBtnText}>+ Buat Postingan</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Top Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Komunitas</Text>
          <Text style={styles.headerSubtitle}>Linimasa publik & pembaruan WuzzChat</Text>
        </View>

        <TouchableOpacity
          style={styles.headerNewPostBtn}
          onPress={() => setIsCreateModalOpen(true)}
          activeOpacity={0.8}
        >
          <IconText style={styles.headerNewPostIcon}>✏️</IconText>
          <Text style={styles.headerNewPostText}>Buat</Text>
        </TouchableOpacity>
      </View>

      {/* Segmented Pill Tab Bar: Terbaru vs Jelajah */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={[styles.tabPill, activeTab === 'latest' && styles.tabPillActive]}
          onPress={() => setActiveTab('latest')}
          activeOpacity={0.75}
        >
          <IconText
            style={[
              styles.tabPillText,
              activeTab === 'latest' && styles.tabPillTextActive,
            ]}
          >
            ⏱️ Terbaru
          </IconText>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabPill, activeTab === 'explore' && styles.tabPillActive]}
          onPress={() => setActiveTab('explore')}
          activeOpacity={0.75}
        >
          <Text
            style={[
              styles.tabPillText,
              activeTab === 'explore' && styles.tabPillTextActive,
            ]}
          >
            🎲 Jelajah
          </Text>
        </TouchableOpacity>
      </View>

      {/* Feed List */}
      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        renderItem={renderPostItem}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: Math.max(insets.bottom + 90, 110) },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refreshFeed}
            tintColor={colors.accentPrimary}
            colors={[colors.accentPrimary]}
          />
        }
        initialNumToRender={5}
        maxToRenderPerBatch={5}
        windowSize={7}
        removeClippedSubviews
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={renderEmptyComponent}
        ListFooterComponent={
          isLoadingMore ? (
            <View style={styles.footerLoader}>
              <ActivityIndicator size="small" color={colors.accentPrimary} />
            </View>
          ) : null
        }
      />

      {/* Floating Action Button (FAB +) */}
      <TouchableOpacity
        style={[
          styles.fab,
          { bottom: Math.max(insets.bottom + 70, 85) },
        ]}
        onPress={() => setIsCreateModalOpen(true)}
        activeOpacity={0.85}
      >
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>

      {/* Modals */}
      <MediaViewerModal
        visible={Boolean(viewerUrl)}
        mediaUrl={viewerUrl}
        onClose={() => setViewerUrl(null)}
      />

      <ReportModal visible={Boolean(reportTarget)} target={reportTarget} onClose={() => setReportTarget(null)} />

      <CreatePostModal
        visible={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onPostCreated={() => {
          refreshFeed();
        }}
      />

      <PostCommentsModal
        visible={Boolean(activeCommentsPost)}
        post={activeCommentsPost}
        onClose={() => setActiveCommentsPost(null)}
      />

      <SharePostToChatModal
        visible={Boolean(activeSharePost)}
        post={activeSharePost}
        onClose={() => setActiveSharePost(null)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f4f7fb',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: '#f4f7fb',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  headerNewPostBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.accentPrimary,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    gap: 6,
    elevation: 2,
    shadowColor: colors.accentPrimary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  headerNewPostIcon: {
    fontSize: 13,
    color: '#ffffff',
  },
  headerNewPostText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  tabsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingBottom: 10,
    gap: 8,
    backgroundColor: '#f4f7fb',
  },
  tabPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#e8edf3',
  },
  tabPillActive: {
    backgroundColor: colors.accentPrimary,
    elevation: 2,
    shadowColor: colors.accentPrimary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  tabPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
  },
  tabPillTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 6,
    gap: 12,
  },
  postCard: {
    backgroundColor: '#ffffff',
    borderRadius: 22,
    padding: 16,
    elevation: 1,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    borderWidth: 1,
    borderColor: '#e8edf3',
  },
  postCardPinned: {
    borderColor: '#93c5fd',
    backgroundColor: '#fafcff',
  },
  pinnedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 6,
  },
  pinnedIcon: {
    fontSize: 13,
  },
  pinnedText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563eb',
    letterSpacing: 0.2,
  },
  postAuthorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  postAuthorInfo: {
    marginLeft: 12,
    flex: 1,
  },
  authorNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  authorName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  badgeBase: {
    paddingHorizontal: 7,
    paddingVertical: 1.5,
    borderRadius: 8,
  },
  announcementBadge: {
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  announcementBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#1d4ed8',
  },
  sponsoredBadge: {
    backgroundColor: '#fef3c7',
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  sponsoredBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#b45309',
  },
  articleBadge: {
    backgroundColor: '#f3e8ff',
    borderWidth: 1,
    borderColor: '#e9d5ff',
  },
  articleBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#7e22ce',
  },
  authorSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  authorRole: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
  },
  postTimeAgo: {
    fontSize: 11,
    color: '#94a3b8',
  },
  modDeleteBtn: {
    padding: 6,
    opacity: 0.7,
  },
  modDeleteText: {
    fontSize: 14,
  },
  postContent: {
    fontSize: 14.5,
    lineHeight: 22,
    color: '#1e293b',
    marginBottom: 12,
  },
  postActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#f1f5f9',
    paddingTop: 10,
    gap: 18,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  actionIcon: {
    fontSize: 15,
  },
  actionCount: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  actionCountLiked: {
    color: '#ef4444',
  },
  actionBtnShare: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginLeft: 'auto',
    backgroundColor: '#f8fafc',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  actionIconShare: {
    fontSize: 13,
  },
  actionCountShare: {
    fontSize: 11.5,
    fontWeight: '600',
    color: colors.accentPrimary,
  },
  centerContainer: {
    paddingVertical: 60,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  centerText: {
    fontSize: 13,
    color: '#64748b',
  },
  emptyContainer: {
    paddingVertical: 60,
    paddingHorizontal: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 10,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
  emptyCreateBtn: {
    backgroundColor: colors.accentPrimary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  emptyCreateBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  footerLoader: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  fab: {
    position: 'absolute',
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accentPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: colors.accentPrimary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    zIndex: 90,
  },
  fabIcon: {
    fontSize: 30,
    color: '#ffffff',
    lineHeight: 32,
    fontWeight: '400',
  },
});
