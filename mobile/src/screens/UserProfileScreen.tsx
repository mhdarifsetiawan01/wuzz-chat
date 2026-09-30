/**
 * WuzzChat Mobile UI - UserProfileScreen
 * Modular, developer-extensible public user profile screen.
 * Displays Avatar, Verified Badge, Role, Bio, extensible Metadata (location, website, social links),
 * and permission-driven action buttons (Chat, Voice Call, or Edit Profile).
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { User, ConversationItem } from '../api/types';
import { getUserProfile, startDirectChat } from '../api/users';
import { Avatar } from '../components/Avatar';
import { VerifiedBadge } from '../components/VerifiedBadge';
import { EditProfileModal } from '../components/EditProfileModal';
import { useAuth } from '../context/AuthContext';
import { useCall } from '../context/CallContext';
import { colors, radius, shadows, spacing, typography } from '../theme';

export interface UserProfileScreenProps {
  userId?: string;
  username?: string;
  initialUser?: User;
  onBack: () => void;
  onStartChat: (conversation: ConversationItem) => void;
}

export const UserProfileScreen: React.FC<UserProfileScreenProps> = ({
  userId,
  username,
  initialUser,
  onBack,
  onStartChat,
}) => {
  const insets = useSafeAreaInsets();
  const { user: currentUser, updateCurrentUser } = useAuth();
  const { startCall } = useCall();

  const [user, setUser] = useState<User | null>(initialUser || null);
  const [isLoading, setIsLoading] = useState<boolean>(!initialUser);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isStartingChat, setIsStartingChat] = useState<boolean>(false);
  const [showEditModal, setShowEditModal] = useState<boolean>(false);

  const targetIdentifier = userId || username || initialUser?.id || initialUser?.username || '';
  const isSelf = Boolean(currentUser && user && currentUser.id === user.id);

  const fetchProfile = useCallback(async (isRefresh = false) => {
    if (!targetIdentifier) return;
    if (isRefresh) {
      setIsRefreshing(true);
    } else if (!user) {
      setIsLoading(true);
    }
    setErrorMessage(null);

    try {
      const data = await getUserProfile(targetIdentifier);
      setUser(data);
      if (isSelf && updateCurrentUser) {
        updateCurrentUser(data);
      }
    } catch (err: any) {
      console.warn('[UserProfileScreen] Failed to fetch profile:', err);
      if (!user) {
        setErrorMessage(err?.message || 'Gagal memuat profil pengguna.');
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [targetIdentifier, user, isSelf, updateCurrentUser]);

  useEffect(() => {
    fetchProfile();
  }, [targetIdentifier]);

  const handleOpenLink = useCallback(async (url?: string) => {
    if (!url) return;
    const cleanUrl = url.startsWith('http://') || url.startsWith('https://')
      ? url
      : `https://${url}`;
    try {
      const supported = await Linking.canOpenURL(cleanUrl);
      if (supported) {
        await Linking.openURL(cleanUrl);
      } else {
        Alert.alert('Tautan Tidak Didukung', `Tidak dapat membuka: ${cleanUrl}`);
      }
    } catch {
      Alert.alert('Gagal Membuka Tautan', 'Periksa kembali URL yang dituju.');
    }
  }, []);

  const handleSendMessage = useCallback(async () => {
    if (!user) return;
    if (isSelf) {
      setShowEditModal(true);
      return;
    }

    // Check privacy settings
    const dmPolicy = user.metadata?.privacy?.allow_direct_messages;
    if (dmPolicy === 'friends') {
      Alert.alert(
        'Pesan Dibatasi',
        `${user.display_name} hanya menerima pesan dari pengguna yang terhubung.`
      );
      return;
    }

    setIsStartingChat(true);
    try {
      const res = await startDirectChat(user.id);
      const conv: ConversationItem = {
        id: res.room_id,
        room_id: res.room_id,
        type: 'direct',
        title: user.display_name,
        peer_id: user.id,
        peer_nickname: user.display_name,
        peer_avatar_url: user.avatar_url,
        peer_is_verified: user.is_verified,
        peer_public_key: user.public_key,
      } as ConversationItem;

      onStartChat(conv);
    } catch (err: any) {
      console.warn('[UserProfileScreen] Failed to start direct chat:', err);
      Alert.alert('Gagal Memulai Obrolan', err?.message || 'Terjadi kesalahan jaringan.');
    } finally {
      setIsStartingChat(false);
    }
  }, [user, isSelf, onStartChat]);

  const handleStartCall = useCallback(async () => {
    if (!user) return;
    if (isSelf) return;

    // Check call policy
    const callPolicy = user.metadata?.privacy?.allow_calls;
    if (callPolicy === 'friends') {
      Alert.alert(
        'Panggilan Dibatasi',
        `${user.display_name} hanya menerima panggilan dari teman terhubung.`
      );
      return;
    }

    try {
      const res = await startDirectChat(user.id);
      startCall(res.room_id, user.id, user.display_name, user.avatar_url);
    } catch (err: any) {
      console.warn('[UserProfileScreen] Failed to initiate call:', err);
      Alert.alert('Panggilan Gagal', 'Tidak dapat menghubungi pengguna saat ini.');
    }
  }, [user, isSelf, startCall]);

  const metadata = user?.metadata || {};
  const socialLinks = metadata.social_links || {};
  const bio = user?.bio || metadata.bio || user?.status_message || '';
  const role = user?.role || metadata.role || '';
  const location = metadata.location || '';
  const website = metadata.website || '';

  const hasSocialLinks = Boolean(
    socialLinks.instagram ||
    socialLinks.youtube ||
    socialLinks.linkedin ||
    socialLinks.tiktok
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      {/* Navigation Header */}
      <View style={styles.navBar}>
        <TouchableOpacity
          onPress={onBack}
          style={styles.backButton}
          activeOpacity={0.7}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.navTitle} numberOfLines={1}>
          Profil Pengguna
        </Text>
        <View style={styles.navRightSlot}>
          {isSelf && (
            <TouchableOpacity
              onPress={() => setShowEditModal(true)}
              style={styles.editHeaderBtn}
              activeOpacity={0.7}
            >
              <Text style={styles.editHeaderBtnText}>Edit</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Main Content */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accentPrimary} />
          <Text style={styles.loadingText}>Memuat profil...</Text>
        </View>
      ) : errorMessage && !user ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorEmoji}>⚠️</Text>
          <Text style={styles.errorText}>{errorMessage}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => fetchProfile(false)}
            activeOpacity={0.8}
          >
            <Text style={styles.retryButtonText}>Coba Lagi</Text>
          </TouchableOpacity>
        </View>
      ) : user ? (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(insets.bottom, spacing.xl) },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => fetchProfile(true)}
              tintColor={colors.accentPrimary}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {/* Hero Identity Card */}
          <View style={styles.heroCard}>
            <View style={styles.avatarWrapper}>
              <Avatar
                name={user.display_name || user.username}
                avatarUrl={user.avatar_url}
                size={96}
                shape="circle"
              />
            </View>

            <View style={styles.nameRow}>
              <Text style={styles.displayName} numberOfLines={1}>
                {user.display_name || user.username}
              </Text>
              {user.is_verified && (
                <View style={styles.badgeWrapper}>
                  <VerifiedBadge size={20} />
                </View>
              )}
            </View>

            <Text style={styles.usernameText}>@{user.username}</Text>

            {role ? (
              <View style={styles.roleBadge}>
                <Text style={styles.roleText}>{role}</Text>
              </View>
            ) : null}

            {/* Quick Actions */}
            <View style={styles.actionsRow}>
              {isSelf ? (
                <TouchableOpacity
                  style={[styles.primaryActionBtn, { flex: 1 }]}
                  onPress={() => setShowEditModal(true)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.actionIcon}>✏️</Text>
                  <Text style={styles.primaryActionText}>Edit Profil</Text>
                </TouchableOpacity>
              ) : (
                <>
                  <TouchableOpacity
                    style={[styles.primaryActionBtn, { flex: 1 }]}
                    onPress={handleSendMessage}
                    disabled={isStartingChat}
                    activeOpacity={0.8}
                  >
                    {isStartingChat ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <>
                        <Text style={styles.actionIcon}>💬</Text>
                        <Text style={styles.primaryActionText}>Kirim Pesan</Text>
                      </>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.secondaryActionBtn}
                    onPress={handleStartCall}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.actionIcon}>📞</Text>
                    <Text style={styles.secondaryActionText}>Panggilan</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>

          {/* Section: Bio / Tentang */}
          {bio ? (
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Tentang</Text>
              <Text style={styles.bioText}>{bio}</Text>
            </View>
          ) : null}

          {/* Section: Info Modular (Lokasi & Website) */}
          {(location || website) ? (
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Informasi Tambahan</Text>

              {location ? (
                <View style={styles.infoRow}>
                  <Text style={styles.infoRowIcon}>📍</Text>
                  <View style={styles.infoRowContent}>
                    <Text style={styles.infoLabel}>Lokasi</Text>
                    <Text style={styles.infoValue}>{location}</Text>
                  </View>
                </View>
              ) : null}

              {website ? (
                <TouchableOpacity
                  style={[styles.infoRow, styles.clickableRow]}
                  onPress={() => handleOpenLink(website)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.infoRowIcon}>🌐</Text>
                  <View style={styles.infoRowContent}>
                    <Text style={styles.infoLabel}>Website</Text>
                    <Text style={[styles.infoValue, styles.linkText]}>{website}</Text>
                  </View>
                  <Text style={styles.chevron}>↗</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}

          {/* Section: Media Sosial (Extensible Social Links) */}
          {hasSocialLinks ? (
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Tautan Sosial</Text>

              {socialLinks.instagram ? (
                <TouchableOpacity
                  style={styles.socialRow}
                  onPress={() => handleOpenLink(
                    socialLinks.instagram?.startsWith('http')
                      ? socialLinks.instagram
                      : `https://instagram.com/${socialLinks.instagram?.replace(/^@/, '')}`
                  )}
                  activeOpacity={0.7}
                >
                  <View style={[styles.socialIconBox, { backgroundColor: '#FDE2E4' }]}>
                    <Text style={styles.socialIconEmoji}>📸</Text>
                  </View>
                  <View style={styles.socialInfo}>
                    <Text style={styles.socialPlatform}>Instagram</Text>
                    <Text style={styles.socialHandle} numberOfLines={1}>
                      {socialLinks.instagram}
                    </Text>
                  </View>
                  <Text style={styles.chevron}>↗</Text>
                </TouchableOpacity>
              ) : null}

              {socialLinks.youtube ? (
                <TouchableOpacity
                  style={styles.socialRow}
                  onPress={() => handleOpenLink(
                    socialLinks.youtube?.startsWith('http')
                      ? socialLinks.youtube
                      : `https://youtube.com/@${socialLinks.youtube?.replace(/^@/, '')}`
                  )}
                  activeOpacity={0.7}
                >
                  <View style={[styles.socialIconBox, { backgroundColor: '#FEE2E2' }]}>
                    <Text style={styles.socialIconEmoji}>▶️</Text>
                  </View>
                  <View style={styles.socialInfo}>
                    <Text style={styles.socialPlatform}>YouTube</Text>
                    <Text style={styles.socialHandle} numberOfLines={1}>
                      {socialLinks.youtube}
                    </Text>
                  </View>
                  <Text style={styles.chevron}>↗</Text>
                </TouchableOpacity>
              ) : null}

              {socialLinks.linkedin ? (
                <TouchableOpacity
                  style={styles.socialRow}
                  onPress={() => handleOpenLink(
                    socialLinks.linkedin?.startsWith('http')
                      ? socialLinks.linkedin
                      : `https://linkedin.com/in/${socialLinks.linkedin}`
                  )}
                  activeOpacity={0.7}
                >
                  <View style={[styles.socialIconBox, { backgroundColor: '#E0E7FF' }]}>
                    <Text style={styles.socialIconEmoji}>💼</Text>
                  </View>
                  <View style={styles.socialInfo}>
                    <Text style={styles.socialPlatform}>LinkedIn</Text>
                    <Text style={styles.socialHandle} numberOfLines={1}>
                      {socialLinks.linkedin}
                    </Text>
                  </View>
                  <Text style={styles.chevron}>↗</Text>
                </TouchableOpacity>
              ) : null}

              {socialLinks.tiktok ? (
                <TouchableOpacity
                  style={styles.socialRow}
                  onPress={() => handleOpenLink(
                    socialLinks.tiktok?.startsWith('http')
                      ? socialLinks.tiktok
                      : `https://tiktok.com/@${socialLinks.tiktok?.replace(/^@/, '')}`
                  )}
                  activeOpacity={0.7}
                >
                  <View style={[styles.socialIconBox, { backgroundColor: '#F1F5F9' }]}>
                    <Text style={styles.socialIconEmoji}>🎵</Text>
                  </View>
                  <View style={styles.socialInfo}>
                    <Text style={styles.socialPlatform}>TikTok</Text>
                    <Text style={styles.socialHandle} numberOfLines={1}>
                      {socialLinks.tiktok}
                    </Text>
                  </View>
                  <Text style={styles.chevron}>↗</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}

          {/* E2EE Trust Badge Card */}
          <View style={styles.e2eeCard}>
            <Text style={styles.e2eeIcon}>🔒</Text>
            <View style={styles.e2eeTextWrapper}>
              <Text style={styles.e2eeTitle}>Obrolan Terenkripsi E2EE</Text>
              <Text style={styles.e2eeSubtitle}>
                Pesan dan panggilan antar akun diamankan menggunakan kunci kriptografi perangkat.
              </Text>
            </View>
          </View>
        </ScrollView>
      ) : null}

      {/* Edit Profile Modal for Self Profile */}
      {isSelf && currentUser && (
        <EditProfileModal
          visible={showEditModal}
          onClose={() => setShowEditModal(false)}
          currentDisplayName={currentUser.display_name}
          currentUsername={currentUser.username}
          currentAvatarUrl={currentUser.avatar_url}
          currentBio={user?.bio || currentUser.bio}
          currentRole={user?.role || currentUser.role}
          currentMetadata={user?.metadata || currentUser.metadata}
          onProfileUpdated={(updatedUser) => {
            setUser(updatedUser);
            if (updateCurrentUser) {
              updateCurrentUser(updatedUser);
            }
          }}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bgBase,
  },
  navBar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    backgroundColor: colors.bgSurface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
  },
  backArrow: {
    fontSize: 22,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  navTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
    flex: 1,
    textAlign: 'center',
  },
  navRightSlot: {
    width: 40,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  editHeaderBtn: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.tintAccent10,
  },
  editHeaderBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.accentPrimary,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  loadingText: {
    fontSize: 15,
    color: colors.textSecondary,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  errorEmoji: {
    fontSize: 48,
  },
  errorText: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: colors.accentPrimary,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.full,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.md,
    gap: spacing.md,
  },
  heroCard: {
    backgroundColor: colors.bgSurface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    alignItems: 'center',
    ...shadows.card,
  },
  avatarWrapper: {
    marginBottom: spacing.md,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  displayName: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  badgeWrapper: {
    marginTop: 2,
  },
  usernameText: {
    fontSize: 15,
    color: colors.textMuted,
    marginTop: 2,
  },
  roleBadge: {
    backgroundColor: colors.tintAccent10,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.full,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: `${colors.accentPrimary}30`,
  },
  roleText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.accentPrimary,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  primaryActionBtn: {
    backgroundColor: colors.accentPrimary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    borderRadius: radius.full,
    gap: spacing.xs,
  },
  primaryActionText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  secondaryActionBtn: {
    backgroundColor: colors.bgElevated,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    gap: spacing.xs,
  },
  secondaryActionText: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  actionIcon: {
    fontSize: 16,
  },
  sectionCard: {
    backgroundColor: colors.bgSurface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    ...shadows.card,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
  },
  bioText: {
    fontSize: 15,
    color: colors.textPrimary,
    lineHeight: 22,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  clickableRow: {
    paddingVertical: spacing.sm,
  },
  infoRowIcon: {
    fontSize: 20,
    width: 28,
    textAlign: 'center',
  },
  infoRowContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    color: colors.textMuted,
  },
  infoValue: {
    fontSize: 15,
    color: colors.textPrimary,
    fontWeight: '500',
    marginTop: 2,
  },
  linkText: {
    color: colors.accentPrimary,
    textDecorationLine: 'underline',
  },
  chevron: {
    fontSize: 16,
    color: colors.textMuted,
    fontWeight: '700',
  },
  socialRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  socialIconBox: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  socialIconEmoji: {
    fontSize: 18,
  },
  socialInfo: {
    flex: 1,
  },
  socialPlatform: {
    fontSize: 12,
    color: colors.textMuted,
  },
  socialHandle: {
    fontSize: 15,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  e2eeCard: {
    backgroundColor: `${colors.tintAccent10}`,
    borderRadius: radius.lg,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: `${colors.accentPrimary}20`,
    gap: spacing.md,
  },
  e2eeIcon: {
    fontSize: 22,
  },
  e2eeTextWrapper: {
    flex: 1,
  },
  e2eeTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  e2eeSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: 16,
  },
});
