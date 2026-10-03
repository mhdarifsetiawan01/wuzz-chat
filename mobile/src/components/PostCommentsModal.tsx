/**
 * WuzzChat Mobile UI — PostCommentsModal
 * Milestone M-Mobile-9.3
 * 
 * Interactive Comments Sheet:
 * - Fetches comments chronologically (GET /api/feed/:id/comments)
 * - Comment creation form (max 500 characters)
 * - Auto-syncs comments_count on parent post in real-time
 * - Resilient error handling with user feedback
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { feedApi } from '../api/feedApi';
import { FeedComment, FeedPost } from '../api/types';
import { useFeed } from '../context';
import { colors, radius, spacing, typography } from '../theme';
import { IconText } from './IconText';
import { Icon } from './Icon';
import { Avatar } from './Avatar';
import { LinkifiedText } from './LinkifiedText';

export interface PostCommentsModalProps {
  visible: boolean;
  post: FeedPost | null;
  onClose: () => void;
}

const MAX_COMMENT_CHARS = 500;

function formatCommentTime(dateString: string): string {
  try {
    const diff = (Date.now() - new Date(dateString).getTime()) / 1000;
    if (diff < 60) return 'Baru saja';
    if (diff < 3600) return `${Math.floor(diff / 60)}m lalu`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}j lalu`;
    return `${Math.floor(diff / 86400)}h lalu`;
  } catch {
    return '';
  }
}

export const PostCommentsModal: React.FC<PostCommentsModalProps> = ({
  visible,
  post,
  onClose,
}) => {
  const insets = useSafeAreaInsets();
  const { updatePostCommentsCount } = useFeed();

  const [comments, setComments] = useState<FeedComment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Cursor untuk pagination — diisi dengan created_at komentar terakhir
  const nextCursorRef = useRef<string | undefined>(undefined);
  // Guard agar onEndReached tidak trigger ganda saat sudah in-flight
  const isLoadingMoreRef = useRef(false);

  // Reset & load pertama kali saat modal dibuka
  useEffect(() => {
    if (visible && post?.id) {
      setComments([]);
      setHasMore(false);
      nextCursorRef.current = undefined;
      loadFirstPage(post.id);
    } else {
      setComments([]);
      setCommentText('');
      setHasMore(false);
      nextCursorRef.current = undefined;
    }
  }, [visible, post?.id]);

  const loadFirstPage = async (postId: string) => {
    setIsLoading(true);
    try {
      const res = await feedApi.getComments(postId, { limit: 20 });
      setComments(res.comments || []);
      setHasMore(res.has_more ?? false);
      nextCursorRef.current = res.next_cursor;
    } catch (err) {
      console.warn('[PostCommentsModal] Error loading comments:', err);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Dipanggil oleh FlatList.onEndReached saat user scroll ke bawah.
   * Guard isLoadingMoreRef mencegah request ganda jika onEndReached
   * terpanggil berkali-kali sebelum response kembali.
   */
  const loadMoreComments = async () => {
    if (!post?.id || !hasMore || isLoadingMoreRef.current) return;

    isLoadingMoreRef.current = true;
    setIsLoadingMore(true);
    try {
      const res = await feedApi.getComments(post.id, {
        before: nextCursorRef.current,
        limit: 20,
      });
      // Deduplicate: hindari komentar yang sudah ada (edge case network retry)
      const existingIds = new Set(comments.map((c) => c.id));
      const fresh = (res.comments || []).filter((c) => !existingIds.has(c.id));
      setComments((prev) => [...prev, ...fresh]);
      setHasMore(res.has_more ?? false);
      nextCursorRef.current = res.next_cursor;
    } catch (err) {
      console.warn('[PostCommentsModal] Error loading more comments:', err);
    } finally {
      setIsLoadingMore(false);
      isLoadingMoreRef.current = false;
    }
  };

  const handleSendComment = async () => {
    if (!post?.id) return;
    const trimmed = commentText.trim();
    if (!trimmed) return;

    if (trimmed.length > MAX_COMMENT_CHARS) {
      Alert.alert('Batas Karakter', `Maksimal komentar adalah ${MAX_COMMENT_CHARS} karakter.`);
      return;
    }

    setIsSubmitting(true);
    try {
      const newComment = await feedApi.createComment(post.id, trimmed);
      // Tampilkan komentar baru di paling bawah (kronologis)
      setComments((prev) => [...prev, newComment]);
      setCommentText('');

      // Realtime update comments count on feed card
      const newTotal = (post.comments_count || 0) + 1;
      updatePostCommentsCount(post.id, newTotal);
    } catch (err: any) {
      console.warn('[PostCommentsModal] Error creating comment:', err);
      Alert.alert('Gagal Mengirim', err?.message || 'Tidak dapat mengirim komentar saat ini.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!post) return null;

  /** Footer FlatList: spinner load-more atau teks "Semua komentar sudah ditampilkan" */
  const renderListFooter = () => {
    if (isLoadingMore) {
      return (
        <View style={styles.footerLoader}>
          <ActivityIndicator size="small" color={colors.accentPrimary} />
          <Text style={styles.footerLoaderText}>Memuat komentar lainnya...</Text>
        </View>
      );
    }
    if (!hasMore && comments.length > 0) {
      return (
        <Text style={styles.footerEnd}>— Semua komentar sudah ditampilkan —</Text>
      );
    }
    return null;
  };

  // Label header: tampilkan total dari post jika lebih besar dari yang dimuat
  const headerCount =
    post.comments_count > comments.length ? post.comments_count : comments.length;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <Pressable style={styles.backdrop} onPress={onClose} />

        <View style={[styles.modalCard, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerIndicator} />
            <View style={styles.headerRow}>
              <Text style={styles.headerTitle}>
                Komentar {headerCount > 0 ? `(${headerCount})` : ''}
              </Text>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <Icon name="close" size={18} color="#94a3b8" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Post Snippet */}
          <View style={styles.postSnippet}>
            <Text style={styles.snippetAuthor}>
              @{post.author?.username || post.author?.display_name || 'pengguna'}
            </Text>
            <Text style={styles.snippetContent} numberOfLines={2}>
              {post.content}
            </Text>
          </View>

          {/* Comments List */}
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={colors.accentPrimary} />
              <Text style={styles.loadingText}>Memuat komentar...</Text>
            </View>
          ) : comments.length === 0 ? (
            <View style={styles.emptyContainer}>
              <IconText style={styles.emptyIcon}>💬</IconText>
              <Text style={styles.emptyTitle}>Belum ada komentar</Text>
              <Text style={styles.emptySubtitle}>
                Jadilah yang pertama mengomentari postingan ini!
              </Text>
            </View>
          ) : (
            <FlatList
              data={comments}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              onEndReached={loadMoreComments}
              onEndReachedThreshold={0.3}
              ListFooterComponent={renderListFooter}
              renderItem={({ item }) => (
                <View style={styles.commentItem}>
                  <Avatar
                    name={item.author?.display_name || item.author?.username || 'User'}
                    avatarUrl={item.author?.avatar_url}
                    size={36}
                    shape="circle"
                  />
                  <View style={styles.commentBody}>
                    <View style={styles.commentMetaRow}>
                      <Text style={styles.commentAuthor}>
                        {item.author?.display_name || item.author?.username || 'Pengguna'}
                      </Text>
                      {item.author?.is_verified && (
                        <IconText style={styles.verifiedBadge}>✓</IconText>
                      )}
                      <Text style={styles.commentTime}>
                        {formatCommentTime(item.created_at)}
                      </Text>
                    </View>
                    <LinkifiedText text={item.content} style={styles.commentText} />
                  </View>
                </View>
              )}
            />
          )}

          {/* Input Bar */}
          <View style={styles.inputBar}>
            <TextInput
              style={styles.textInput}
              placeholder="Tulis tanggapan atau komentar..."
              placeholderTextColor="#94a3b8"
              value={commentText}
              onChangeText={setCommentText}
              maxLength={MAX_COMMENT_CHARS}
              multiline
            />
            <TouchableOpacity
              onPress={handleSendComment}
              disabled={isSubmitting || !commentText.trim()}
              style={[
                styles.sendBtn,
                (!commentText.trim() || isSubmitting) && styles.sendBtnDisabled,
              ]}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.sendBtnText}>Kirim</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};


const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    height: '75%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 20,
  },
  header: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f1f5f9',
  },
  headerIndicator: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#cbd5e1',
    marginBottom: 8,
  },
  headerRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  closeBtn: {
    padding: 6,
  },
  postSnippet: {
    backgroundColor: '#f8fafc',
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 12,
    borderLeftWidth: 3,
    borderLeftColor: colors.accentPrimary,
  },
  snippetAuthor: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.accentPrimary,
    marginBottom: 2,
  },
  snippetContent: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 18,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 13,
    color: '#64748b',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyIcon: {
    fontSize: 36,
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 14,
  },
  commentItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  commentBody: {
    flex: 1,
    marginLeft: 10,
    backgroundColor: '#f8fafc',
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  commentMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  commentAuthor: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
  },
  verifiedBadge: {
    fontSize: 11,
    color: colors.accentPrimary,
    fontWeight: '800',
  },
  commentTime: {
    fontSize: 11,
    color: '#94a3b8',
    marginLeft: 'auto',
  },
  commentText: {
    fontSize: 13,
    color: '#334155',
    lineHeight: 19,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    gap: 10,
  },
  textInput: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 14,
    color: '#0f172a',
    maxHeight: 90,
  },
  sendBtn: {
    backgroundColor: colors.accentPrimary,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.45,
  },
  sendBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  footerLoader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 8,
  },
  footerLoaderText: {
    fontSize: 12,
    color: '#64748b',
  },
  footerEnd: {
    textAlign: 'center',
    fontSize: 11,
    color: '#cbd5e1',
    paddingVertical: 16,
    fontStyle: 'italic',
  },
});
