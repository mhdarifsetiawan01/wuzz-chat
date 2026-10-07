/**
 * EditGroupInfoModal
 * Edit nama, deskripsi, visibilitas (publik/privat) dan @username grup.
 * Hanya dibuka untuk admin / creator. Request memakai timeout 15 detik dari apiClient;
 * tombol dikunci selama proses simpan (anti double-action).
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { groupsApi } from '../api/groups';
import { GroupDetails } from '../api/types';
import { colors } from '../theme/colors';
import { radius, shadows, spacing } from '../theme/spacing';
import { Icon } from './Icon';

const GROUP_USERNAME_REGEX = /^[a-zA-Z0-9_]{3,32}$/;

export interface EditGroupInfoModalProps {
  visible: boolean;
  group: GroupDetails;
  onClose: () => void;
  /** Dipanggil setelah berhasil disimpan agar layar induk memuat ulang data. */
  onSaved: () => void;
}

export const EditGroupInfoModal: React.FC<EditGroupInfoModalProps> = ({
  visible,
  group,
  onClose,
  onSaved,
}) => {
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [username, setUsername] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Isi ulang form dari data terbaru setiap modal dibuka.
  useEffect(() => {
    if (visible) {
      setTitle(group.title || '');
      setDescription(group.description || '');
      setIsPublic(!!group.is_public);
      setUsername(group.group_username || '');
      setErrorMessage(null);
    }
  }, [visible, group]);

  const handleClose = useCallback(() => {
    if (!isSaving) onClose();
  }, [isSaving, onClose]);

  const handleSave = useCallback(async () => {
    if (isSaving) return;
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setErrorMessage('Nama grup wajib diisi');
      return;
    }
    const cleanUsername = isPublic ? username.trim().replace(/^@/, '') : '';
    if (cleanUsername && !GROUP_USERNAME_REGEX.test(cleanUsername)) {
      setErrorMessage('Username grup harus 3-32 karakter alfanumerik / underscore');
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    try {
      await groupsApi.updateGroupInfo(group.id, {
        title: trimmedTitle,
        description: description.trim(),
        is_public: isPublic,
        group_username: cleanUsername,
      });
      onSaved();
      onClose();
    } catch (err: any) {
      console.warn('[EditGroupInfoModal] Update failed:', err);
      setErrorMessage(err?.message || 'Gagal menyimpan info grup');
    } finally {
      setIsSaving(false);
    }
  }, [isSaving, title, description, isPublic, username, group.id, onSaved, onClose]);

  const canSave = !!title.trim() && !isSaving;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={styles.keyboardAvoider}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.backdrop}>
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
            <View style={styles.header}>
              <Text style={styles.headerTitle}>Edit Info Grup</Text>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={handleClose}
                disabled={isSaving}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Icon name="close" size={16} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollContent}
            >
              {errorMessage ? (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{errorMessage}</Text>
                </View>
              ) : null}

              <Text style={styles.fieldLabel}>Nama Grup *</Text>
              <TextInput
                style={styles.textInput}
                value={title}
                onChangeText={setTitle}
                placeholder="Nama grup"
                placeholderTextColor={colors.textMuted}
                maxLength={128}
                editable={!isSaving}
              />

              <Text style={[styles.fieldLabel, styles.fieldGap]}>Deskripsi</Text>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                value={description}
                onChangeText={setDescription}
                placeholder="Deskripsi grup (opsional)"
                placeholderTextColor={colors.textMuted}
                maxLength={256}
                multiline
                editable={!isSaving}
              />

              <View style={[styles.toggleRow, styles.fieldGap]}>
                <View style={styles.toggleInfo}>
                  <Text style={styles.toggleTitle}>{isPublic ? 'Grup Publik' : 'Grup Privat'}</Text>
                  <Text style={styles.toggleHint}>
                    {isPublic
                      ? 'Bisa ditemukan lewat pencarian dan siapa pun dapat bergabung.'
                      : 'Hanya anggota yang bisa masuk. @username akan dilepas.'}
                  </Text>
                </View>
                <Switch
                  value={isPublic}
                  onValueChange={setIsPublic}
                  disabled={isSaving}
                  trackColor={{ false: colors.borderSubtle, true: colors.accentPrimary }}
                  thumbColor="#ffffff"
                />
              </View>

              {isPublic && (
                <View style={[styles.usernameRow, styles.fieldGap]}>
                  <Text style={styles.usernamePrefix}>@</Text>
                  <TextInput
                    style={styles.usernameInput}
                    value={username}
                    onChangeText={(t) => setUsername(t.replace(/[^a-zA-Z0-9_@]/g, ''))}
                    placeholder="username_grup (opsional)"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    maxLength={33}
                    editable={!isSaving}
                  />
                </View>
              )}

              <TouchableOpacity
                style={[styles.saveButton, !canSave && styles.saveButtonDisabled]}
                onPress={handleSave}
                disabled={!canSave}
                activeOpacity={0.8}
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.saveButtonText}>Simpan</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  keyboardAvoider: { flex: 1 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(9, 13, 22, 0.80)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.bgCardSolid,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: '90%',
    ...shadows.modal,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: 0.2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    padding: spacing.xl,
  },
  errorBox: {
    backgroundColor: colors.tintError10,
    borderWidth: 1,
    borderColor: colors.colorError,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.lg,
  },
  errorText: {
    fontSize: 13,
    color: colors.colorError,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  fieldGap: {
    marginTop: spacing.lg,
  },
  textInput: {
    backgroundColor: colors.bgInput,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 15,
    color: colors.textPrimary,
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  toggleInfo: {
    flex: 1,
    marginRight: spacing.md,
  },
  toggleTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  toggleHint: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  usernameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgInput,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    height: 46,
  },
  usernamePrefix: {
    fontSize: 15,
    color: colors.accentPrimary,
    marginRight: 2,
  },
  usernameInput: {
    flex: 1,
    fontSize: 15,
    color: colors.textPrimary,
  },
  saveButton: {
    backgroundColor: colors.accentPrimary,
    borderRadius: radius.md,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xl,
  },
  saveButtonDisabled: {
    opacity: 0.4,
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
  },
});
