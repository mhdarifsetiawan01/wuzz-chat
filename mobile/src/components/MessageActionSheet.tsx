/**
 * WuzzChat MessageActionSheet Component
 * WhatsApp-Style Contextual Bottom Action Sheet for long-pressed messages.
 * Includes Quick Emoji Reactions Bar, Quoted Reply, Copy to Clipboard, and Deletion options.
 * Conforms to frontend/DESIGN.md & WhatsApp Aurora theme.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Message } from '../api/types';
import { QUICK_REACTIONS } from '../constants/emojis';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';

export interface MessageActionSheetProps {
  visible: boolean;
  message: Message | null;
  isSelf: boolean;
  onClose: () => void;
  onReact: (messageId: string, emoji: string) => void;
  onReply: (message: Message) => void;
  onEdit?: (message: Message) => void;
  onForward?: (message: Message) => void;
  onTogglePin?: (message: Message) => void;
  onDelete: (messageId: string, type: 'for_me' | 'for_everyone') => void;
}

export const MessageActionSheet: React.FC<MessageActionSheetProps> = ({
  visible,
  message,
  isSelf,
  onClose,
  onReact,
  onReply,
  onEdit,
  onForward,
  onTogglePin,
  onDelete,
}) => {
  const insets = useSafeAreaInsets();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  if (!message) return null;

  const handleSelectReaction = (emoji: string) => {
    onReact(message.id, emoji);
    onClose();
  };

  const handleReply = () => {
    onReply(message);
    onClose();
  };

  const handleCopy = async () => {
    if (message.content) {
      await Clipboard.setStringAsync(message.content);
      Alert.alert('Disalin', 'Teks pesan disalin ke papan klip.');
    }
    onClose();
  };

  // Check 60 seconds window for "Delete for Everyone"
  const isWithinDeleteWindow = () => {
    if (!isSelf) return false;
    const msgTime = new Date(message.timestamp || message.created_at || 0).getTime();
    if (isNaN(msgTime) || msgTime === 0) return true;
    const diffSec = (Date.now() - msgTime) / 1000;
    return diffSec <= 60;
  };

  // Check 15 minutes window for "Edit Message"
  const isWithinEditWindow = () => {
    if (!isSelf) return false;
    const msgTime = new Date(message.timestamp || message.created_at || 0).getTime();
    if (isNaN(msgTime) || msgTime === 0) return true;
    const diffMs = Date.now() - msgTime;
    return diffMs <= 15 * 60 * 1000;
  };

  const canDeleteForEveryone = isSelf && isWithinDeleteWindow();
  const canEdit =
    isSelf &&
    !message.is_deleted &&
    isWithinEditWindow() &&
    !message.media_url &&
    message.type !== 'audio';

  const handleTriggerDelete = (type: 'for_me' | 'for_everyone') => {
    setShowDeleteConfirm(false);
    onDelete(message.id, type);
    onClose();
  };

  const handleModalClose = () => {
    setShowDeleteConfirm(false);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleModalClose}
    >
      <Pressable style={styles.backdrop} onPress={handleModalClose}>
        <Pressable
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}
          onPress={(e) => e.stopPropagation()}
        >
          {showDeleteConfirm ? (
            /* Delete Confirmation Sub-View */
            <View style={styles.deleteConfirmBox}>
              <Text style={styles.deleteConfirmTitle}>Hapus Pesan?</Text>
              <Text style={styles.deleteConfirmSubtitle}>
                Pilih apakah Anda ingin menghapus pesan untuk diri sendiri atau menarik untuk semua orang.
              </Text>

              {canDeleteForEveryone ? (
                <TouchableOpacity
                  style={[styles.deleteOptionBtn, styles.deleteForEveryoneBtn]}
                  onPress={() => handleTriggerDelete('for_everyone')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.deleteForEveryoneText}>🗑️ Tarik untuk Semua Orang</Text>
                </TouchableOpacity>
              ) : null}

              <TouchableOpacity
                style={styles.deleteOptionBtn}
                onPress={() => handleTriggerDelete('for_me')}
                activeOpacity={0.7}
              >
                <Text style={styles.deleteForMeText}>Hapus untuk Saya</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.cancelOptionBtn}
                onPress={() => setShowDeleteConfirm(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.cancelOptionText}>Batal</Text>
              </TouchableOpacity>
            </View>
          ) : (
            /* Standard Action Menu */
            <>
              {/* Top Quick Emoji Reactions Bar */}
              <View style={styles.quickReactionsRow}>
                {QUICK_REACTIONS.map((emoji) => (
                  <TouchableOpacity
                    key={emoji}
                    style={styles.quickReactionBtn}
                    onPress={() => handleSelectReaction(emoji)}
                    activeOpacity={0.6}
                  >
                    <Text style={styles.quickReactionEmoji}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.divider} />

              {/* Action Menu List */}
              <View style={styles.actionMenuList}>
                {/* 1. Quoted Reply */}
                <TouchableOpacity
                  style={styles.actionMenuItem}
                  onPress={handleReply}
                  activeOpacity={0.7}
                >
                  <Text style={styles.actionMenuIcon}>↩️</Text>
                  <Text style={styles.actionMenuLabel}>Balas Pesan</Text>
                </TouchableOpacity>

                {/* 2. Edit Message (15-min window, own text message) */}
                {canEdit && onEdit ? (
                  <TouchableOpacity
                    style={styles.actionMenuItem}
                    onPress={() => {
                      onEdit(message);
                      onClose();
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.actionMenuIcon}>✏️</Text>
                    <Text style={styles.actionMenuLabel}>Edit Pesan</Text>
                  </TouchableOpacity>
                ) : null}

                {/* 3. Forward Message */}
                {!message.is_deleted && onForward ? (
                  <TouchableOpacity
                    style={styles.actionMenuItem}
                    onPress={() => {
                      onForward(message);
                      onClose();
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.actionMenuIcon}>↪️</Text>
                    <Text style={styles.actionMenuLabel}>Teruskan Pesan</Text>
                  </TouchableOpacity>
                ) : null}

                {/* 4. Pin / Unpin Message */}
                {!message.is_deleted && onTogglePin ? (
                  <TouchableOpacity
                    style={styles.actionMenuItem}
                    onPress={() => {
                      onTogglePin(message);
                      onClose();
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.actionMenuIcon}>📌</Text>
                    <Text style={styles.actionMenuLabel}>
                      {message.is_pinned ? 'Lepas Sematan' : 'Sematkan Pesan'}
                    </Text>
                  </TouchableOpacity>
                ) : null}

                {/* 5. Copy Text */}
                {message.content && !message.is_deleted ? (
                  <TouchableOpacity
                    style={styles.actionMenuItem}
                    onPress={handleCopy}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.actionMenuIcon}>📋</Text>
                    <Text style={styles.actionMenuLabel}>Salin Teks</Text>
                  </TouchableOpacity>
                ) : null}

                {/* 6. Delete Message */}
                {!message.is_deleted ? (
                  <TouchableOpacity
                    style={[styles.actionMenuItem, styles.deleteMenuItem]}
                    onPress={() => setShowDeleteConfirm(true)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.actionMenuIcon}>🗑️</Text>
                    <Text style={[styles.actionMenuLabel, styles.deleteMenuLabel]}>
                      Hapus Pesan
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </>
          )}
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
  sheet: {
    backgroundColor: colors.bgCardSolid,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  quickReactionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: colors.bgBase,
    borderRadius: 24,
    paddingVertical: 8,
    paddingHorizontal: 6,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  quickReactionBtn: {
    padding: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickReactionEmoji: {
    fontSize: 26,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderSubtle,
    marginVertical: spacing.xs,
  },
  actionMenuList: {
    paddingVertical: spacing.xs,
  },
  actionMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: spacing.sm,
    borderRadius: 10,
    gap: 12,
  },
  actionMenuIcon: {
    fontSize: 18,
    width: 24,
    textAlign: 'center',
  },
  actionMenuLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  deleteMenuItem: {
    marginTop: 2,
  },
  deleteMenuLabel: {
    color: '#ef4444', // Danger Red
  },
  deleteConfirmBox: {
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  deleteConfirmTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 6,
  },
  deleteConfirmSubtitle: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.md,
    lineHeight: 18,
    paddingHorizontal: spacing.md,
  },
  deleteOptionBtn: {
    width: '100%',
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: colors.bgBase,
    alignItems: 'center',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  deleteForEveryoneBtn: {
    borderColor: 'rgba(239, 68, 68, 0.4)',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  deleteForEveryoneText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ef4444',
  },
  deleteForMeText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  cancelOptionBtn: {
    width: '100%',
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  cancelOptionText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textMuted,
  },
});
