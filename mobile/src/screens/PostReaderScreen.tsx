/**
 * WuzzChat Mobile UI — PostReaderScreen (Mode Baca)
 * Layar penuh untuk membaca postingan feed: teks penuh (bisa diseleksi), tautan aktif,
 * pratinjau link, media dengan zoom, serta aksi suka / komentar / bagikan.
 * Data diambil dari FeedContext agar jumlah suka & komentar tetap sinkron dengan linimasa.
 */

import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FeedPost } from '../api/types';
import { Avatar } from '../components/Avatar';
import { LinkifiedText } from '../components/LinkifiedText';
import { LinkPreviewCard } from '../components/LinkPreviewCard';
import { MediaViewerModal } from '../components/MediaViewerModal';
import { PostCommentsModal } from '../components/PostCommentsModal';
import { PostMedia } from '../components/PostMedia';
import { SharePostToChatModal } from '../components/SharePostToChatModal';
import { useAuth, useFeed } from '../context';
import { colors } from '../theme';
import { IconText } from '../components/IconText';
import { Icon } from '../components/Icon';
import { formatPostTime } from '../utils/feedTime';
import { extractFirstUrl } from '../utils/linkUtils';

export interface PostReaderScreenProps {
  postId: string;
  /** Snapshot saat dibuka; dipakai bila postingan belum/tidak lagi ada di linimasa */
  initialPost?: FeedPost;
  onBack: () => void;
}

export const PostReaderScreen: React.FC<PostReaderScreenProps> = ({ postId, initialPost, onBack }) => {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { posts, toggleLike, deletePost } = useFeed();

  const post = useMemo(
    () => posts.find((p) => p.id === postId) ?? initialPost ?? null,
    [posts, postId, initialPost]
  );

  const [commentsOpen, setCommentsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);

  const previewUrl = useMemo(() => (post ? extractFirstUrl(post.content) : null), [post?.content]);

  if (!post) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Header onBack={onBack} />
        <View style={styles.missing}>
          <Text style={styles.missingText}>Postingan tidak tersedia atau sudah dihapus.</Text>
        </View>
      </View>
    );
  }

  const authorName = post.author?.display_name || post.author?.username || 'Pengguna';
  const canModerate =
    Boolean(user) &&
    (post.author?.id === user!.id ||
      post.user_id === user!.id ||
      user!.system_role === 'wuzz_admin' ||
      user!.system_role === 'wuzz_moderator');

  const handleDelete = () => {
    Alert.alert('Hapus Postingan', 'Apakah Anda yakin ingin menghapus postingan ini dari linimasa komunitas?', [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: async () => {
          try {
            await deletePost(post.id);
            onBack();
          } catch (err) {
            console.warn('[PostReader] Delete error:', err);
          }
        },
      },
    ]);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Header onBack={onBack} onDelete={canModerate ? handleDelete : undefined} />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.authorRow}>
          <Avatar name={authorName} avatarUrl={post.author?.avatar_url} size={48} shape="circle" />
          <View style={styles.authorInfo}>
            <Text style={styles.authorName} numberOfLines={1}>
              {authorName}
              {post.author?.is_verified ? '  ✓' : ''}
            </Text>
            <Text style={styles.meta}>
              {post.author?.role ? `${post.author.role} • ` : ''}
              {formatPostTime(post.created_at)}
            </Text>
          </View>
        </View>

        <LinkifiedText text={post.content} style={styles.body} selectable />

        {previewUrl ? <LinkPreviewCard url={previewUrl} /> : null}

        <PostMedia urls={post.media_urls} large onPressImage={setViewerUrl} />

        <View style={styles.actions}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => toggleLike(post.id)} activeOpacity={0.7}>
            <IconText style={styles.actionIcon}>{post.is_liked ? '❤️' : '🤍'}</IconText>
            <Text style={[styles.actionCount, post.is_liked && styles.liked]}>{post.likes_count}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => setCommentsOpen(true)} activeOpacity={0.7}>
            <IconText style={styles.actionIcon}>💬</IconText>
            <Text style={styles.actionCount}>{post.comments_count} Komentar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.shareBtn} onPress={() => setShareOpen(true)} activeOpacity={0.7}>
            <IconText style={styles.shareText}>↗️ Bagikan</IconText>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <MediaViewerModal
        visible={Boolean(viewerUrl)}
        mediaUrl={viewerUrl}
        senderName={authorName}
        timestamp={post.created_at}
        onClose={() => setViewerUrl(null)}
      />
      <PostCommentsModal visible={commentsOpen} post={post} onClose={() => setCommentsOpen(false)} />
      <SharePostToChatModal visible={shareOpen} post={post} onClose={() => setShareOpen(false)} />
    </View>
  );
};

const Header: React.FC<{ onBack: () => void; onDelete?: () => void }> = ({ onBack, onDelete }) => (
  <View style={styles.header}>
    <TouchableOpacity onPress={onBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Kembali">
      <Icon name="back" size={24} color="#0f172a" />
    </TouchableOpacity>
    <Text style={styles.headerTitle}>Postingan</Text>
    {onDelete ? (
      <TouchableOpacity onPress={onDelete} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Hapus postingan">
        <IconText style={styles.trash}>🗑️</IconText>
      </TouchableOpacity>
    ) : (
      <View style={styles.headerSpacer} />
    )}
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e8edf3',
  },
  back: { fontSize: 24, color: '#0f172a' },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  trash: { fontSize: 18 },
  headerSpacer: { width: 24 },
  content: { paddingHorizontal: 20, paddingTop: 16 },
  authorRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  authorInfo: { marginLeft: 12, flex: 1 },
  authorName: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  meta: { fontSize: 12, color: '#64748b', marginTop: 2 },
  body: { fontSize: 17, lineHeight: 27, color: '#1e293b', marginBottom: 16 },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e8edf3',
    paddingTop: 14,
    marginTop: 4,
  },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionIcon: { fontSize: 17 },
  actionCount: { fontSize: 13, fontWeight: '600', color: '#64748b' },
  liked: { color: '#ef4444' },
  shareBtn: {
    marginLeft: 'auto',
    backgroundColor: '#f8fafc',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  shareText: { fontSize: 12.5, fontWeight: '600', color: colors.accentPrimary },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 },
  missingText: { fontSize: 14, color: '#64748b', textAlign: 'center' },
});
