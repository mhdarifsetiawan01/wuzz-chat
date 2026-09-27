/**
 * WuzzChat Mobile UI - EditProfileModal Component
 * Interactive modal for updating user's display name and profile info.
 */

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { authApi } from '../api/auth';
import { User } from '../api/types';
import { colors, radius, shadows, spacing, typography } from '../theme';
import { Button } from './Button';

export interface EditProfileModalProps {
  visible: boolean;
  onClose: () => void;
  currentDisplayName: string;
  currentUsername: string;
  onProfileUpdated: (updatedUser: User) => void;
}

export const EditProfileModal: React.FC<EditProfileModalProps> = ({
  visible,
  onClose,
  currentDisplayName,
  currentUsername,
  onProfileUpdated,
}) => {
  const insets = useSafeAreaInsets();
  const [displayName, setDisplayName] = useState(currentDisplayName);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (visible) {
      setDisplayName(currentDisplayName);
      setErrorMessage('');
    }
  }, [visible, currentDisplayName]);

  const handleSave = async () => {
    const trimmed = displayName.trim();
    if (!trimmed) {
      setErrorMessage('Nama tampilan tidak boleh kosong');
      return;
    }
    if (trimmed.length > 50) {
      setErrorMessage('Nama tampilan maksimal 50 karakter');
      return;
    }

    setIsSaving(true);
    setErrorMessage('');
    try {
      const updated = await authApi.updateProfile({ display_name: trimmed });
      onProfileUpdated(updated);
      onClose();
    } catch (err: any) {
      console.warn('[EditProfileModal] Failed to update profile:', err);
      setErrorMessage(err?.message || 'Gagal menyimpan profil. Coba lagi.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardContainer}
        >
          <View
            style={[
              styles.card,
              {
                paddingBottom: Math.max(insets.bottom, spacing.lg),
              },
            ]}
          >
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <View style={styles.iconCircle}>
                  <Text style={styles.iconEmoji}>✏️</Text>
                </View>
                <View>
                  <Text style={styles.title}>Edit Profil</Text>
                  <Text style={styles.subtitle}>Ubah nama tampilan akun Anda</Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={onClose}
                activeOpacity={0.7}
              >
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Form */}
            <View style={styles.formContent}>
              <Text style={styles.inputLabel}>Nama Tampilan</Text>
              <TextInput
                style={[
                  styles.input,
                  errorMessage ? styles.inputError : null,
                ]}
                value={displayName}
                onChangeText={(text) => {
                  setDisplayName(text);
                  if (errorMessage) setErrorMessage('');
                }}
                placeholder="Masukkan nama tampilan..."
                placeholderTextColor={colors.textMuted}
                autoFocus
                maxLength={50}
              />
              {errorMessage ? (
                <Text style={styles.errorText}>{errorMessage}</Text>
              ) : null}

              <Text style={styles.helperText}>
                Nama ini akan terlihat oleh kontak dan anggota grup obrolan Anda.
              </Text>

              <View style={styles.usernameRow}>
                <Text style={styles.usernameLabel}>Username Akun:</Text>
                <Text style={styles.usernameValue}>@{currentUsername}</Text>
              </View>
            </View>

            {/* Actions */}
            <View style={styles.actionRow}>
              <View style={styles.actionBtn}>
                <Button
                  title="Batal"
                  variant="secondary"
                  onPress={onClose}
                  disabled={isSaving}
                />
              </View>
              <View style={styles.actionBtn}>
                <Button
                  title={isSaving ? 'Menyimpan...' : 'Simpan'}
                  variant="primary"
                  onPress={handleSave}
                  isLoading={isSaving}
                />
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  keyboardContainer: {
    width: '100%',
  },
  card: {
    backgroundColor: colors.bgSurface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTopWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing.lg,
    ...shadows.card,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.tintAccent10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconEmoji: {
    fontSize: 18,
  },
  title: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textMuted,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.bgBase,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    color: colors.textMuted,
    fontSize: 15,
    fontWeight: '600',
  },
  formContent: {
    paddingVertical: spacing.lg,
    gap: spacing.xs,
  },
  inputLabel: {
    ...typography.captionBold,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.bgBase,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    color: colors.textPrimary,
    fontSize: 16,
  },
  inputError: {
    borderColor: colors.colorError,
  },
  errorText: {
    ...typography.caption,
    fontSize: 11,
    color: colors.colorError,
    marginTop: 2,
  },
  helperText: {
    ...typography.caption,
    fontSize: 11,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  usernameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
    padding: spacing.sm,
    backgroundColor: colors.bgBase,
    borderRadius: radius.sm,
    gap: spacing.xs,
  },
  usernameLabel: {
    ...typography.caption,
    fontSize: 11,
    color: colors.textMuted,
  },
  usernameValue: {
    ...typography.captionBold,
    color: colors.accentPrimary,
  },

  actionRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  actionBtn: {
    flex: 1,
  },
});
