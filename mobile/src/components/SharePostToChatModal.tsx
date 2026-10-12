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
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { conversationsApi } from '../api/conversations';
import { Conversation, FeedPost } from '../api/types';
import { websocketClient } from '../services/websocket';
import { radius, spacing, useTheme, useThemedStyles, ColorTokens } from '../theme';
import { IconText } from './IconText';
import { Icon } from './Icon';
import { Avatar } from './Avatar';
import { BottomSheetModal } from './BottomSheetModal';
import { buildSharedPostMessage } from '../utils/feedShare';
import { showAlert } from '../services/dialog';

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
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

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
      showAlert('Gagal Memuat Obrolan', 'Tidak dapat mengambil daftar obrolan tujuan.');
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
        showAlert(
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
      showAlert(
        'Berhasil Dibagikan',
        `Postingan berhasil dibagikan ke ${selectedRoomIds.length} obrolan!`
      );
    } catch (err: any) {
      console.error('[SharePostToChatModal] Share failed:', err);
      showAlert('Gagal Membagikan', err?.message || 'Terjadi kesalahan saat membagikan.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!post) return null;

  return (
    <BottomSheetModal
      visible={visible}
      onClose={onClose}
      title="Bagikan ke Obrolan"
      avoidKeyboard
    >
      <View style={styles.body}>
        <View style={styles.counterBadge}>
          <Text style={styles.counterText}>
            {selectedRoomIds.length}/{MAX_TARGETS} dipilih
          </Text>
        </View>

        {/* Snippet Preview */}
        <View style={styles.previewBox}>
          <Text style={styles.previewLabel}>Cuplikan yang akan dikirim:</Text>
          <IconText style={styles.previewContent} numberOfLines={2}>
            📢 @{post.author?.username || post.author?.display_name}: {post.content}
          </IconText>
        </View>

        {/* Search Box */}
        <View style={styles.searchContainer}>
          <IconText style={styles.searchIcon}>🔍</IconText>
          <TextInput
            style={styles.searchInput}
            placeholder="Cari kontak atau grup..."
            placeholderTextColor={colors.textMuted}
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
            <IconText style={styles.emptyIcon}>💬</IconText>
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
                      {isGroup
                        ? item.member_count
                          ? `${item.member_count} anggota`
                          : 'Grup'
                        : 'Obrolan pribadi'}
                    </Text>
                  </View>

                  {/* Checkbox indicator */}
                  <View
                    style={[
                      styles.checkbox,
                      isSelected && styles.checkboxSelected,
                    ]}
                  >
                    {isSelected && <IconText style={styles.checkmark}>✓</IconText>}
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
      </View>
    </BottomSheetModal>
  );
};

const makeStyles = (colors: ColorTokens) => StyleSheet.create({
  body: {
    height: 520,
    maxHeight: '100%',
    flexShrink: 1,
  },
  counterBadge: {
    alignSelf: 'flex-start',
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
  previewBox: {
    backgroundColor: colors.bgBase,
    marginTop: 10,
    padding: 10,
    borderRadius: 12,
    borderLeftWidth: 3,
    borderLeftColor: colors.accentPrimary,
  },
  previewLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '600',
    marginBottom: 2,
  },
  previewContent: {
    fontSize: 13,
    color: colors.textPrimary,
    lineHeight: 18,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgInput,
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
    color: colors.textPrimary,
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
    color: colors.textSecondary,
    marginTop: 8,
  },
  emptyIcon: {
    fontSize: 32,
    marginBottom: 6,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  list: {
    flex: 1,
  },
  listContent: {},
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
    color: colors.textPrimary,
    flexShrink: 1,
  },
  groupBadge: {
    backgroundColor: colors.bgInputFocused,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },
  groupBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  convSub: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgSurface,
  },
  checkboxSelected: {
    backgroundColor: colors.accentFill,
    borderColor: colors.accentPrimary,
  },
  checkmark: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  footer: {
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderDefault,
  },
  sendBtn: {
    backgroundColor: colors.accentFill,
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
