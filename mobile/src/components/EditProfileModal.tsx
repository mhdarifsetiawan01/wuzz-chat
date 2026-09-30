/**
 * WuzzChat Mobile UI - EditProfileModal Component
 * Interactive modal for updating user's display name, avatar (via camera/gallery),
 * bio, role, extensible metadata (location, website, social links), and privacy settings.
 */

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { authApi } from '../api/auth';
import { mediaApi } from '../api/media';
import { User, UserMetadata } from '../api/types';
import { Avatar } from './Avatar';
import { colors, radius, shadows, spacing, typography } from '../theme';
import { Button } from './Button';

export interface EditProfileModalProps {
  visible: boolean;
  onClose: () => void;
  currentDisplayName: string;
  currentUsername: string;
  currentAvatarUrl?: string;
  currentBio?: string;
  currentRole?: string;
  currentIsPrivateAccount?: boolean;
  currentMetadata?: UserMetadata;
  onProfileUpdated: (updatedUser: User) => void;
}

export const EditProfileModal: React.FC<EditProfileModalProps> = ({
  visible,
  onClose,
  currentDisplayName,
  currentUsername,
  currentAvatarUrl = '',
  currentBio = '',
  currentRole = '',
  currentIsPrivateAccount = false,
  currentMetadata = {},
  onProfileUpdated,
}) => {
  const insets = useSafeAreaInsets();

  const [displayName, setDisplayName] = useState(currentDisplayName);
  const [avatarUrl, setAvatarUrl] = useState(currentAvatarUrl);
  const [bio, setBio] = useState(currentBio);
  const [role, setRole] = useState(currentRole);
  const [location, setLocation] = useState(currentMetadata?.location || '');
  const [website, setWebsite] = useState(currentMetadata?.website || '');

  // Social links
  const [instagram, setInstagram] = useState(currentMetadata?.social_links?.instagram || '');
  const [youtube, setYoutube] = useState(currentMetadata?.social_links?.youtube || '');
  const [linkedin, setLinkedin] = useState(currentMetadata?.social_links?.linkedin || '');
  const [tiktok, setTiktok] = useState(currentMetadata?.social_links?.tiktok || '');

  // Privacy settings
  const [allowDM, setAllowDM] = useState<'everyone' | 'friends'>(
    currentMetadata?.privacy?.allow_direct_messages || 'everyone'
  );
  const [allowCalls, setAllowCalls] = useState<'everyone' | 'friends'>(
    currentMetadata?.privacy?.allow_calls || 'everyone'
  );
  const [isPrivateAccount, setIsPrivateAccount] = useState<boolean>(
    Boolean(currentIsPrivateAccount)
  );

  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (visible) {
      setDisplayName(currentDisplayName);
      setAvatarUrl(currentAvatarUrl);
      setBio(currentBio);
      setRole(currentRole);
      setLocation(currentMetadata?.location || '');
      setWebsite(currentMetadata?.website || '');
      setInstagram(currentMetadata?.social_links?.instagram || '');
      setYoutube(currentMetadata?.social_links?.youtube || '');
      setLinkedin(currentMetadata?.social_links?.linkedin || '');
      setTiktok(currentMetadata?.social_links?.tiktok || '');
      setAllowDM(currentMetadata?.privacy?.allow_direct_messages || 'everyone');
      setAllowCalls(currentMetadata?.privacy?.allow_calls || 'everyone');
      setIsPrivateAccount(Boolean(currentIsPrivateAccount));
      setErrorMessage('');
    }
  }, [visible, currentDisplayName, currentAvatarUrl, currentBio, currentRole, currentIsPrivateAccount, currentMetadata]);

  const handlePickAvatar = () => {
    Alert.alert(
      'Ganti Foto Profil',
      'Pilih sumber foto avatar Anda:',
      [
        {
          text: 'Buka Kamera',
          onPress: handleCameraCapture,
        },
        {
          text: 'Pilih dari Galeri',
          onPress: handleGalleryPicker,
        },
        {
          text: 'Batal',
          style: 'cancel',
        },
      ]
    );
  };

  const handleCameraCapture = async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Izin Dibutuhkan', 'Izin kamera dibutuhkan untuk mengambil foto profil.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.85,
        allowsEditing: true,
        aspect: [1, 1],
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        await uploadAvatarFile(result.assets[0].uri);
      }
    } catch (err: any) {
      console.warn('[EditProfileModal] Camera capture error:', err);
      Alert.alert('Kesalahan Kamera', 'Gagal membuka kamera perangkat.');
    }
  };

  const handleGalleryPicker = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Izin Dibutuhkan', 'Izin galeri dibutuhkan untuk memilih foto profil.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.85,
        allowsEditing: true,
        aspect: [1, 1],
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        await uploadAvatarFile(result.assets[0].uri);
      }
    } catch (err: any) {
      console.warn('[EditProfileModal] Gallery picker error:', err);
      Alert.alert('Kesalahan Galeri', 'Gagal membuka galeri foto.');
    }
  };

  const uploadAvatarFile = async (uri: string) => {
    setIsUploadingAvatar(true);
    setErrorMessage('');
    try {
      const uploadRes = await mediaApi.uploadMedia(
        uri,
        `avatar_${Date.now()}.jpg`,
        'image/jpeg'
      );
      if (uploadRes && uploadRes.url) {
        setAvatarUrl(uploadRes.url);
      } else {
        throw new Error('Gagal mendapatkan URL media avatar.');
      }
    } catch (err: any) {
      console.warn('[EditProfileModal] Avatar upload failed:', err);
      Alert.alert('Upload Avatar Gagal', err?.message || 'Gagal mengunggah foto avatar.');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleSave = async () => {
    const trimmedName = displayName.trim();
    if (!trimmedName) {
      setErrorMessage('Nama tampilan tidak boleh kosong');
      return;
    }
    if (trimmedName.length > 50) {
      setErrorMessage('Nama tampilan maksimal 50 karakter');
      return;
    }

    setIsSaving(true);
    setErrorMessage('');

    try {
      const updatedMetadata: UserMetadata = {
        ...(currentMetadata || {}),
        bio: bio.trim(),
        role: role.trim(),
        location: location.trim(),
        website: website.trim(),
        social_links: {
          ...(currentMetadata?.social_links || {}),
          instagram: instagram.trim(),
          youtube: youtube.trim(),
          linkedin: linkedin.trim(),
          tiktok: tiktok.trim(),
        },
        privacy: {
          ...(currentMetadata?.privacy || {}),
          allow_direct_messages: allowDM,
          allow_calls: allowCalls,
        },
      };

      const updated = await authApi.updateProfile({
        display_name: trimmedName,
        avatar_url: avatarUrl,
        bio: bio.trim(),
        role: role.trim(),
        is_private_account: isPrivateAccount,
        metadata: updatedMetadata,
      });

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
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={onClose}
        />
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
                  <Text style={styles.subtitle}>Perbarui informasi & identitas akun Anda</Text>
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

            {/* Scrollable Form Content */}
            <ScrollView
              style={styles.formScroll}
              contentContainerStyle={styles.formContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* Avatar Picker Section */}
              <View style={styles.avatarSection}>
                <TouchableOpacity
                  style={styles.avatarPickerButton}
                  onPress={handlePickAvatar}
                  disabled={isUploadingAvatar}
                  activeOpacity={0.8}
                >
                  <Avatar
                    name={displayName || currentUsername}
                    avatarUrl={avatarUrl}
                    size={84}
                    shape="circle"
                  />
                  {isUploadingAvatar ? (
                    <View style={styles.avatarLoadingOverlay}>
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    </View>
                  ) : (
                    <View style={styles.cameraIconBadge}>
                      <Text style={styles.cameraIconEmoji}>📷</Text>
                    </View>
                  )}
                </TouchableOpacity>
                <Text style={styles.avatarHint}>Ketuk untuk ganti foto profil</Text>
              </View>

              {/* Display Name */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Nama Tampilan *</Text>
                <TextInput
                  style={[styles.input, errorMessage ? styles.inputError : null]}
                  value={displayName}
                  onChangeText={(text) => {
                    setDisplayName(text);
                    if (errorMessage) setErrorMessage('');
                  }}
                  placeholder="Masukkan nama tampilan..."
                  placeholderTextColor={colors.textMuted}
                  maxLength={50}
                />
                {errorMessage ? (
                  <Text style={styles.errorText}>{errorMessage}</Text>
                ) : null}
              </View>

              {/* Role / Headline */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Pekerjaan / Headline</Text>
                <TextInput
                  style={styles.input}
                  value={role}
                  onChangeText={setRole}
                  placeholder="Misal: Software Engineer, Designer, dsb."
                  placeholderTextColor={colors.textMuted}
                  maxLength={64}
                />
              </View>

              {/* Bio */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Tentang / Bio</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={bio}
                  onChangeText={setBio}
                  placeholder="Ceritakan sedikit tentang Anda..."
                  placeholderTextColor={colors.textMuted}
                  multiline
                  numberOfLines={3}
                  maxLength={255}
                />
                <Text style={styles.charCounter}>{bio.length}/255</Text>
              </View>

              {/* Location & Website */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Lokasi</Text>
                <TextInput
                  style={styles.input}
                  value={location}
                  onChangeText={setLocation}
                  placeholder="Misal: Jakarta, Indonesia"
                  placeholderTextColor={colors.textMuted}
                  maxLength={64}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Website / Portofolio</Text>
                <TextInput
                  style={styles.input}
                  value={website}
                  onChangeText={setWebsite}
                  placeholder="https://..."
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  keyboardType="url"
                  maxLength={128}
                />
              </View>

              {/* Social Media Links */}
              <View style={styles.sectionDivider}>
                <Text style={styles.sectionHeaderTitle}>Tautan Media Sosial</Text>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Instagram</Text>
                <TextInput
                  style={styles.input}
                  value={instagram}
                  onChangeText={setInstagram}
                  placeholder="@username"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>YouTube</Text>
                <TextInput
                  style={styles.input}
                  value={youtube}
                  onChangeText={setYoutube}
                  placeholder="@channel"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>LinkedIn</Text>
                <TextInput
                  style={styles.input}
                  value={linkedin}
                  onChangeText={setLinkedin}
                  placeholder="in/username atau URL"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>TikTok</Text>
                <TextInput
                  style={styles.input}
                  value={tiktok}
                  onChangeText={setTiktok}
                  placeholder="@username"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                />
              </View>

              {/* Privacy Settings Section */}
              <View style={styles.sectionDivider}>
                <Text style={styles.sectionHeaderTitle}>Kebijakan Privasi Interaksi</Text>
              </View>

              {/* Private Account Switch Card */}
              <View style={styles.switchCard}>
                <View style={styles.switchInfo}>
                  <Text style={styles.switchTitle}>🔒 Akun Privat</Text>
                  <Text style={styles.switchDescription}>
                    Bila aktif, profil tetap dapat ditemukan namun DM dan Panggilan HANYA dapat diinisiasi oleh teman terhubung.
                  </Text>
                </View>
                <Switch
                  value={isPrivateAccount}
                  onValueChange={setIsPrivateAccount}
                  trackColor={{ false: colors.borderDefault, true: colors.accentPrimary }}
                  thumbColor="#FFFFFF"
                />
              </View>

              <View style={styles.privacyOptionGroup}>
                <Text style={styles.privacyLabel}>Siapa yang boleh kirim pesan (DM)?</Text>
                <View style={styles.privacyPillRow}>
                  <TouchableOpacity
                    style={[
                      styles.privacyPill,
                      allowDM === 'everyone' && styles.privacyPillActive,
                    ]}
                    onPress={() => setAllowDM('everyone')}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.privacyPillText,
                        allowDM === 'everyone' && styles.privacyPillTextActive,
                      ]}
                    >
                      Semua Orang
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.privacyPill,
                      allowDM === 'friends' && styles.privacyPillActive,
                    ]}
                    onPress={() => setAllowDM('friends')}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.privacyPillText,
                        allowDM === 'friends' && styles.privacyPillTextActive,
                      ]}
                    >
                      Hanya Teman
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.privacyOptionGroup}>
                <Text style={styles.privacyLabel}>Siapa yang boleh menelepon saya?</Text>
                <View style={styles.privacyPillRow}>
                  <TouchableOpacity
                    style={[
                      styles.privacyPill,
                      allowCalls === 'everyone' && styles.privacyPillActive,
                    ]}
                    onPress={() => setAllowCalls('everyone')}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.privacyPillText,
                        allowCalls === 'everyone' && styles.privacyPillTextActive,
                      ]}
                    >
                      Semua Orang
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.privacyPill,
                      allowCalls === 'friends' && styles.privacyPillActive,
                    ]}
                    onPress={() => setAllowCalls('friends')}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.privacyPillText,
                        allowCalls === 'friends' && styles.privacyPillTextActive,
                      ]}
                    >
                      Hanya Teman
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.usernameRow}>
                <Text style={styles.usernameLabel}>Username Akun:</Text>
                <Text style={styles.usernameValue}>@{currentUsername}</Text>
              </View>
            </ScrollView>

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
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
  },
  card: {
    backgroundColor: colors.bgSurface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTopWidth: 1,
    borderColor: colors.borderSubtle,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    maxHeight: '90%',
    ...shadows.modal,
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
  formScroll: {
    flexShrink: 1,
  },
  formContent: {
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  avatarPickerButton: {
    position: 'relative',
  },
  cameraIconBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: colors.accentPrimary,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.bgSurface,
  },
  cameraIconEmoji: {
    fontSize: 14,
  },
  avatarLoadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarHint: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  inputGroup: {
    gap: 4,
  },
  inputLabel: {
    ...typography.captionBold,
    color: colors.textSecondary,
  },
  input: {
    backgroundColor: colors.bgBase,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    color: colors.textPrimary,
    fontSize: 15,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? spacing.sm : 8,
  },
  textArea: {
    minHeight: 64,
    textAlignVertical: 'top',
  },
  charCounter: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'right',
    marginTop: 2,
  },
  inputError: {
    borderColor: colors.colorError,
  },
  errorText: {
    color: colors.colorError,
    fontSize: 12,
    marginTop: 2,
  },
  sectionDivider: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
  },
  sectionHeaderTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.accentPrimary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  privacyOptionGroup: {
    gap: spacing.xs,
  },
  privacyLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  privacyPillRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  privacyPill: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.bgBase,
    alignItems: 'center',
    justifyContent: 'center',
  },
  privacyPillActive: {
    borderColor: colors.accentPrimary,
    backgroundColor: colors.tintAccent10,
  },
  privacyPillText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  privacyPillTextActive: {
    color: colors.accentPrimary,
    fontWeight: '700',
  },
  usernameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.bgBase,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
  },
  usernameLabel: {
    ...typography.caption,
    color: colors.textMuted,
  },
  usernameValue: {
    ...typography.captionBold,
    color: colors.accentPrimary,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  actionBtn: {
    flex: 1,
  },
  switchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.bgBase,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  switchInfo: {
    flex: 1,
  },
  switchTitle: {
    ...typography.bodySecondary,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  switchDescription: {
    ...typography.caption,
    color: colors.textSecondary,
    lineHeight: 16,
  },
});
