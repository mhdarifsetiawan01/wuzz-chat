/**
 * WuzzChat Mobile UI — SharePostToChatModal
 * Milestone M-Mobile-9.3: Viral User Acquisition Engine (Share to Chat Loop)
 * 
 * Features:
 * - Select 1 to 5 target conversations (DM or Groups)
 * - Formats post preview card into conversation message
 * - Broadcasts to target rooms via websocketClient with fallback
 * - Drives virality & engagement from community social feed into conversations
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { conversationsApi } from '../api/conversations';
import { Conversation, FeedPost } from '../api/types';
import { websocketClient } from '../services/websocket';
import { colors, radius, spacing, typography } from '../theme';
import { Avatar } from './Avatar';
import { buildSharedPostMessage } from '../utils/feedShare';

export interface SharePostToChatModalProps {
  visible: boolean;
  post: FeedPost | null;
  onClose: () => void;
  onShared?: (targetRoomIds: string[]) => void;
}

const MAX_TARGETS = 5;

export const SharePostToChatModal: React.FC<SharePostToChatModalProps> = ({
  visible,
  post,
  onClose,
  onShared,
}) => {
  const insets = useSafeAreaInsets();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRoomIds, setSelectedRoomIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (visible && post) {
      setSelectedRoomIds([]);
      setSearchQuery('');
      loadConversations();
    }
  }, [visible, post]);

  const loadConversations = async () => {
    setIsLoading(true);
    try {
      const list = await conversationsApi.getConversations();
      setConversations(list || []);
    } catch (err) {
      console.warn('[SharePostToChatModal] Error loading conversations:', err);
      Alert.alert('Gagal Memuat Obrolan', 'Tidak dapat mengambil daftar obrolan tujuan.');
    } finally {
      setIsLoading(false);
    }
  };

  const filteredConversations = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return conversations.filter((c) => {
      const title = (c.title || c.peer_nickname || c.name || c.id || '').toLowerCase();
      if (!q) return true;
      return title.includes(q);
    });
  }, [conversations, searchQuery]);

  const handleToggleRoom = (roomId: string) => {
    if (selectedRoomIds.includes(roomId)) {
      setSelectedRoomIds((prev) => prev.filter((id) => id !== roomId));
    } else {
      if (selectedRoomIds.length >= MAX_TARGETS) {
        Alert.alert(
          'Batas Maksimal',
          `Anda dapat membagikan ke maksimal ${MAX_TARGETS} obrolan sekaligus.`
        );
        return;
      }
      setSelectedRoomIds((prev) => [...prev, roomId]);
    }
  };

  const handleSendShare = async () => {
    if (!post || selectedRoomIds.length === 0 || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const shareMessage = buildSharedPostMessage(post);

      // Send to each chosen room
      for (const roomId of selectedRoomIds) {
        websocketClient.sendMessage(roomId, shareMessage);
      }

      onShared?.(selectedRoomIds);
      onClose();
      Alert.alert(
        'Berhasil Dibagikan',
        `Postingan berhasil dibagikan ke ${selectedRoomIds.length} obrolan!`
      );
    } catch (err: any) {
      console.error('[SharePostToChatModal] Share failed:', err);
      Alert.alert('Gagal Membagikan', err?.message || 'Terjadi kesalahan saat membagikan.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!post) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[
            styles.modalCard,
            { paddingBottom: Math.max(insets.bottom, spacing.md) },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <Text style={styles.headerTitle}>Bagikan ke Obrolan</Text>
              <View style={styles.counterBadge}>
                <Text style={styles.counterText}>
                  {selectedRoomIds.length}/{MAX_TARGETS} dipilih
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={onClose}
              disabled={isSubmitting}
            >
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Snippet Preview */}
          <View style={styles.previewBox}>
            <Text style={styles.previewLabel}>Cuplikan yang akan dikirim:</Text>
            <Text style={styles.previewContent} numberOfLines={2}>
              📢 @{post.author?.username || post.author?.display_name}: {post.content}
            </Text>
          </View>

          {/* Search Box */}
          <View style={styles.searchContainer}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Cari kontak atau grup..."
              placeholderTextColor="#94a3b8"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCorrect={false}
              clearButtonMode="while-editing"
            />
          </View>

          {/* Conversations List */}
          {isLoading ? (
            <View style={styles.centerContainer}>
              <ActivityIndicator size="large" color={colors.accentPrimary} />
              <Text style={styles.loadingText}>Memuat daftar obrolan...</Text>
            </View>
          ) : filteredConversations.length === 0 ? (
            <View style={styles.centerContainer}>
              <Text style={styles.emptyIcon}>💬</Text>
              <Text style={styles.emptyText}>Tidak ada obrolan ditemukan</Text>
            </View>
          ) : (
            <FlatList
              data={filteredConversations}
              keyExtractor={(item) => item.id || item.room_id || ''}
              style={styles.list}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const roomId = item.id || item.room_id || '';
                const isSelected = selectedRoomIds.includes(roomId);
                const title = item.title || item.peer_nickname || item.name || 'Obrolan';
                const isGroup = item.is_group || item.type === 'group';

                return (
                  <TouchableOpacity
                    style={[styles.convItem, isSelected && styles.convItemSelected]}
                    onPress={() => handleToggleRoom(roomId)}
                    activeOpacity={0.7}
                  >
                    <Avatar
                      name={title}
                      avatarUrl={item.avatar_url}
                      size={44}
                      shape={isGroup ? 'squircle' : 'circle'}
                    />

                    <View style={styles.convDetails}>
                      <View style={styles.convTitleRow}>
                        <Text style={styles.convTitle} numberOfLines={1}>
                          {title}
                        </Text>
                        {isGroup && (
                          <View style={styles.groupBadge}>
                            <Text style={styles.groupBadgeText}>Grup</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.convSub} numberOfLines={1}>
                        {typeof item.last_message === 'string'
                          ? item.last_message
                          : item.last_message?.content || 'Ketuk untuk memilih'}
                      </Text>
                    </View>

                    {/* Checkbox indicator */}
                    <View
                      style={[
                        styles.checkbox,
                        isSelected && styles.checkboxSelected,
                      ]}
                    >
                      {isSelected && <Text style={styles.checkmark}>✓</Text>}
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          )}

          {/* Action Footer */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={[
                styles.sendBtn,
                (selectedRoomIds.length === 0 || isSubmitting) && styles.sendBtnDisabled,
              ]}
              onPress={handleSendShare}
              disabled={selectedRoomIds.length === 0 || isSubmitting}
              activeOpacity={0.8}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.sendBtnText}>
                  {selectedRoomIds.length > 0
                    ? `Kirim (${selectedRoomIds.length})`
                    : 'Pilih Obrolan Tujuan'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '82%',
    minHeight: '55%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0f172a',
  },
  counterBadge: {
    backgroundColor: colors.tintAccent10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  counterText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.accentPrimary,
  },
  closeBtn: {
    padding: 6,
  },
  closeBtnText: {
    fontSize: 16,
    color: '#64748b',
    fontWeight: '700',
  },
  previewBox: {
    backgroundColor: '#f8fafc',
    marginHorizontal: 16,
    marginTop: 10,
    padding: 10,
    borderRadius: 12,
    borderLeftWidth: 3,
    borderLeftColor: colors.accentPrimary,
  },
  previewLabel: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
    marginBottom: 2,
  },
  previewContent: {
    fontSize: 13,
    color: '#1e293b',
    lineHeight: 18,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    marginHorizontal: 16,
    marginVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    height: 40,
  },
  searchIcon: {
    fontSize: 14,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#0f172a',
    padding: 0,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 8,
  },
  emptyIcon: {
    fontSize: 32,
    marginBottom: 6,
  },
  emptyText: {
    fontSize: 14,
    color: '#64748b',
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
  },
  convItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 14,
  },
  convItemSelected: {
    backgroundColor: colors.tintAccent10,
  },
  convDetails: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  convTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  convTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
    flexShrink: 1,
  },
  groupBadge: {
    backgroundColor: '#e2e8f0',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },
  groupBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#475569',
  },
  convSub: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  checkboxSelected: {
    backgroundColor: colors.accentPrimary,
    borderColor: colors.accentPrimary,
  },
  checkmark: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e2e8f0',
  },
  sendBtn: {
    backgroundColor: colors.accentPrimary,
    paddingVertical: 13,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.45,
  },
  sendBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
});
