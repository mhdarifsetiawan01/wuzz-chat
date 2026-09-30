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

import React, { useEffect, useState } from 'react';
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
import { Avatar } from './Avatar';

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
  const [commentText, setCommentText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (visible && post?.id) {
      loadComments(post.id);
    } else {
      setComments([]);
      setCommentText('');
    }
  }, [visible, post?.id]);

  const loadComments = async (postId: string) => {
    setIsLoading(true);
    try {
      const res = await feedApi.getComments(postId);
      setComments(res.comments || []);
    } catch (err) {
      console.warn('[PostCommentsModal] Error loading comments:', err);
    } finally {
      setIsLoading(false);
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

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <Pressable style={styles.backdrop} onPress={onClose} />

        <View style={[styles.modalCard, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerIndicator} />
            <View style={styles.headerRow}>
              <Text style={styles.headerTitle}>Komentar ({comments.length})</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <Text style={styles.closeText}>✕</Text>
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
              <Text style={styles.emptyIcon}>💬</Text>
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
                        <Text style={styles.verifiedBadge}>✓</Text>
                      )}
                      <Text style={styles.commentTime}>
                        {formatCommentTime(item.created_at)}
                      </Text>
                    </View>
                    <Text style={styles.commentText}>{item.content}</Text>
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
  closeText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#94a3b8',
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
});
