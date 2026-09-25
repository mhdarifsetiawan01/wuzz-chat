/**
 * WuzzChat ForwardMessageModal Component
 * WhatsApp-Grade Multi-Target Forwarding Modal (1 to 5 target conversations).
 * Conforms to Milestone 8.3 & frontend/DESIGN.md Aurora theme.
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  TouchableOpacity,
  FlatList,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Conversation, Message } from '../api/types';
import { conversationsApi } from '../api/conversations';
import { Avatar } from './Avatar';
import { colors, radius, spacing, typography } from '../theme';

export interface ForwardMessageModalProps {
  visible: boolean;
  message: Message | null;
  currentRoomId?: string;
  onClose: () => void;
  onForward: (targetRoomIds: string[], message: Message) => Promise<void>;
}

export const ForwardMessageModal: React.FC<ForwardMessageModalProps> = ({
  visible,
  message,
  currentRoomId,
  onClose,
  onForward,
}) => {
  const insets = useSafeAreaInsets();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRoomIds, setSelectedRoomIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (visible) {
      setSelectedRoomIds([]);
      setSearchQuery('');
      loadConversations();
    }
  }, [visible]);

  const loadConversations = async () => {
    setIsLoading(true);
    try {
      const list = await conversationsApi.getConversations();
      setConversations(list || []);
    } catch (err) {
      console.warn('[ForwardMessageModal] Error loading conversations:', err);
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
      if (selectedRoomIds.length >= 5) {
        Alert.alert('Batas Maksimal', 'Anda hanya dapat meneruskan pesan ke maksimal 5 obrolan sekaligus.');
        return;
      }
      setSelectedRoomIds((prev) => [...prev, roomId]);
    }
  };

  const handleSendForward = async () => {
    if (!message || selectedRoomIds.length === 0 || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await onForward(selectedRoomIds, message);
      onClose();
    } catch (err: any) {
      console.error('[ForwardMessageModal] Forward failed:', err);
      Alert.alert('Gagal Meneruskan', err?.message || 'Terjadi kesalahan saat meneruskan pesan.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!message) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.modalCard, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <Text style={styles.headerTitle}>Teruskan Pesan</Text>
              <View style={styles.counterBadge}>
                <Text style={styles.counterText}>
                  {selectedRoomIds.length}/5 dipilih
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={onClose}
              disabled={isSubmitting}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Snippet Preview */}
          <View style={styles.previewBox}>
            <Text style={styles.previewLabel}>Pesan yang diteruskan:</Text>
            <Text style={styles.previewContent} numberOfLines={2}>
              {message.media_type === 'audio'
                ? '🎙️ Pesan Suara'
                : message.media_url
                ? '📷 Foto'
                : message.content || 'Pesan'}
            </Text>
          </View>

          {/* Search Box */}
          <View style={styles.searchContainer}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Cari obrolan atau grup..."
              placeholderTextColor={colors.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCorrect={false}
              clearButtonMode="while-editing"
            />
          </View>

          {/* Conversation Selection List */}
          {isLoading ? (
            <View style={styles.centerContainer}>
              <ActivityIndicator size="large" color={colors.accentPrimary} />
              <Text style={styles.loadingText}>Memuat obrolan tujuan...</Text>
            </View>
          ) : (
            <FlatList
              data={filteredConversations}
              keyExtractor={(item) => item.id || item.room_id || ''}
              keyboardShouldPersistTaps="handled"
              style={styles.list}
              renderItem={({ item }) => {
                const roomId = item.id || item.room_id || '';
                const isSelected = selectedRoomIds.includes(roomId);
                const title = item.title || item.peer_nickname || item.name || 'Obrolan';
                const isGroup = item.is_group || item.type === 'group' || item.type === 'subgroup';

                return (
                  <TouchableOpacity
                    style={[styles.chatItem, isSelected && styles.chatItemSelected]}
                    onPress={() => handleToggleRoom(roomId)}
                    activeOpacity={0.7}
                  >
                    <Avatar name={title} size={42} avatarUrl={item.avatar_url} isGroup={isGroup} />
                    <View style={styles.chatInfo}>
                      <Text style={styles.chatTitle} numberOfLines={1}>
                        {title}
                      </Text>
                      <Text style={styles.chatSubtitle} numberOfLines={1}>
                        {isGroup ? 'Grup' : 'Obrolan Langsung'}
                      </Text>
                    </View>
                    <View style={[styles.checkbox, isSelected && styles.checkboxActive]}>
                      {isSelected ? <Text style={styles.checkboxCheck}>✓</Text> : null}
                    </View>
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>Tidak ada obrolan ditemukan</Text>
                </View>
              }
            />
          )}

          {/* Submit Action Bar */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={[
                styles.submitBtn,
                (selectedRoomIds.length === 0 || isSubmitting) && styles.submitBtnDisabled,
              ]}
              onPress={handleSendForward}
              disabled={selectedRoomIds.length === 0 || isSubmitting}
              activeOpacity={0.8}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.submitBtnText}>
                  {selectedRoomIds.length > 0
                    ? `Teruskan ke ${selectedRoomIds.length} Obrolan ↪`
                    : 'Pilih Minimal 1 Obrolan'}
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
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: colors.bgBase,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: '85%',
    minHeight: 420,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  counterBadge: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
  },
  counterText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.accentPrimary,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.bgCardSolid,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  closeBtnText: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '700',
  },
  previewBox: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    padding: spacing.sm,
    backgroundColor: colors.bgCardSolid,
    borderRadius: radius.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.accentPrimary,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  previewLabel: {
    fontSize: 11,
    color: colors.textMuted,
    marginBottom: 2,
  },
  previewContent: {
    fontSize: 13,
    color: colors.textPrimary,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
    backgroundColor: colors.bgCardSolid,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    height: 40,
  },
  searchIcon: {
    fontSize: 14,
    marginRight: spacing.sm,
  },
  searchInput: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 14,
    paddingVertical: 0,
  },
  list: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  chatItemSelected: {
    backgroundColor: 'rgba(56, 189, 248, 0.08)',
    borderRadius: radius.md,
    paddingHorizontal: spacing.xs,
  },
  chatInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  chatTitle: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  chatSubtitle: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.borderSubtle,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  checkboxActive: {
    borderColor: colors.accentPrimary,
    backgroundColor: colors.accentPrimary,
  },
  checkboxCheck: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    marginTop: spacing.sm,
    color: colors.textMuted,
    fontSize: 13,
  },
  emptyContainer: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 13,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  submitBtn: {
    backgroundColor: colors.accentPrimary,
    paddingVertical: 14,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnDisabled: {
    backgroundColor: colors.bgCardSolid,
    opacity: 0.5,
  },
  submitBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
});
