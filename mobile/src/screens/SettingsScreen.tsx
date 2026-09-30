/**
 * WuzzChat Mobile UI — SettingsScreen
 * Tab Pengaturan & Profil (M-Mobile-8.19)
 *
 * Displays:
 *  - User profile header (avatar, name, username, E2EE badge)
 *  - Settings menu: Linked Devices, Notifications, E2EE Keys, Logout
 */

import React, { useCallback, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useAuth } from '../context/AuthContext';
import { useConnection } from '../context/ConnectionContext';
import { colors, radius, shadows, spacing, typography } from '../theme';
import {
  DeviceTransferModal,
  NotificationSettingsModal,
  E2EEKeyModal,
  StorageSettingsModal,
  EditProfileModal,
  Avatar,
  VerifiedBadge,
} from '../components';

// ─────────────────────────────────────────────────────────────────────────────
// Settings Menu Item
// ─────────────────────────────────────────────────────────────────────────────
interface SettingsItemProps {
  icon: string;
  title: string;
  subtitle?: string;
  onPress: () => void;
  tintColor?: string;
  showChevron?: boolean;
  destructive?: boolean;
}

const SettingsItem: React.FC<SettingsItemProps> = ({
  icon,
  title,
  subtitle,
  onPress,
  tintColor,
  showChevron = true,
  destructive = false,
}) => (
  <TouchableOpacity
    style={styles.settingsItem}
    onPress={onPress}
    activeOpacity={0.7}
  >
    {/* Icon */}
    <View
      style={[
        styles.settingsIcon,
        { backgroundColor: tintColor ? `${tintColor}20` : colors.tintAccent10 },
      ]}
    >
      <Text style={styles.settingsIconText}>{icon}</Text>
    </View>

    {/* Text */}
    <View style={styles.settingsText}>
      <Text
        style={[
          styles.settingsTitle,
          destructive && { color: colors.colorError },
        ]}
        numberOfLines={1}
      >
        {title}
      </Text>
      {subtitle ? (
        <Text style={styles.settingsSubtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      ) : null}
    </View>

    {/* Chevron */}
    {showChevron && (
      <Text style={styles.chevron}>›</Text>
    )}
  </TouchableOpacity>
);

// ─────────────────────────────────────────────────────────────────────────────
// Section Wrapper
// ─────────────────────────────────────────────────────────────────────────────
const SettingsSection: React.FC<{
  title?: string;
  children: React.ReactNode;
}> = ({ title, children }) => (
  <View style={styles.section}>
    {title ? <Text style={styles.sectionTitle}>{title}</Text> : null}
    <View style={styles.sectionCard}>{children}</View>
  </View>
);

// ─────────────────────────────────────────────────────────────────────────────
// Avatar Initials
// ─────────────────────────────────────────────────────────────────────────────
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Screen
// ─────────────────────────────────────────────────────────────────────────────
export const SettingsScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user, logout, e2eeStatus, updateCurrentUser } = useAuth();
  const { friends, pendingCount } = useConnection();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Modals state
  const [isDeviceTransferVisible, setIsDeviceTransferVisible] = useState(false);
  const [isNotificationsVisible, setIsNotificationsVisible] = useState(false);
  const [isE2EEKeysVisible, setIsE2EEKeysVisible] = useState(false);
  const [isStorageVisible, setIsStorageVisible] = useState(false);
  const [isEditProfileVisible, setIsEditProfileVisible] = useState(false);

  const handleLogout = useCallback(() => {
    Alert.alert(
      'Keluar Akun',
      'Apakah kamu yakin ingin keluar? Sesi aktif di perangkat ini akan diakhiri.',
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Keluar',
          style: 'destructive',
          onPress: async () => {
            setIsLoggingOut(true);
            try {
              await logout();
            } catch (err) {
              console.error('[SettingsScreen] Logout failed:', err);
              Alert.alert('Gagal', 'Terjadi kesalahan saat keluar. Coba lagi.');
            } finally {
              setIsLoggingOut(false);
            }
          },
        },
      ]
    );
  }, [logout]);

  const displayName = user?.display_name ?? 'Pengguna';
  const username = user?.username ?? '';
  const initials = getInitials(displayName);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Pengaturan</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Profile Card ─────────────────────────────────────────────── */}
        <TouchableOpacity
          style={styles.profileCard}
          activeOpacity={0.85}
          onPress={() => setIsEditProfileVisible(true)}
        >
          {/* Avatar */}
          <View style={styles.avatarWrapper}>
            <Avatar
              name={displayName}
              avatarUrl={user?.avatar_url}
              size={56}
              shape="circle"
              isOnline
            />
          </View>

          {/* Name & Username */}
          <View style={styles.profileInfo}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={styles.profileName} numberOfLines={1}>
                {displayName}
              </Text>
              {user?.is_verified && <VerifiedBadge size={16} />}
            </View>
            {username ? (
              <Text style={styles.profileUsername} numberOfLines={1}>
                @{username}{user?.role ? ` · ${user.role}` : ''}
              </Text>
            ) : null}

            {/* E2EE badge */}
            <View style={styles.e2eeBadge}>
              <Text style={styles.e2eeBadgeIcon}>🛡️</Text>
              <Text style={styles.e2eeBadgeText}>E2EE Terenkripsi</Text>
            </View>
          </View>

          {/* Edit profile button */}
          <View style={styles.editButton}>
            <Text style={styles.editButtonIcon}>✏️</Text>
          </View>
        </TouchableOpacity>

        {/* ── Settings Sections ─────────────────────────────────────────── */}

        <SettingsSection title="Perangkat & Keamanan">
          <SettingsItem
            icon="💻"
            title="Perangkat Tertaut"
            subtitle="Kelola sesi & transfer kunci QR"
            onPress={() => setIsDeviceTransferVisible(true)}
            tintColor={colors.accentPrimary}
          />
          <View style={styles.itemDivider} />
          <SettingsItem
            icon="🔐"
            title="Kunci & Keamanan E2EE"
            subtitle={`Status: ${e2eeStatus === 'ready' ? 'Aktif & Aman ✅' : e2eeStatus}`}
            onPress={() => setIsE2EEKeysVisible(true)}
            tintColor={colors.colorOnline}
          />
        </SettingsSection>

        <SettingsSection title="Sosial & Jaringan">
          <SettingsItem
            icon="👥"
            title="Teman & Permintaan"
            subtitle={
              pendingCount > 0
                ? `${pendingCount} Permintaan Baru Masuk`
                : `${friends.length} Teman Terhubung`
            }
            onPress={() => navigation.navigate('FriendsList')}
            tintColor={colors.accentPrimary}
          />
        </SettingsSection>

        <SettingsSection title="Preferensi">
          <SettingsItem
            icon="🔔"
            title="Notifikasi & Suara"
            subtitle="FCM v1, nada dering & hening"
            onPress={() => setIsNotificationsVisible(true)}
            tintColor={colors.colorWarning}
          />
        </SettingsSection>

        <SettingsSection title="Penyimpanan & Data">
          <SettingsItem
            icon="💾"
            title="Kelola Penyimpanan"
            subtitle="Ukuran database SQLite & cache media"
            onPress={() => setIsStorageVisible(true)}
            tintColor={colors.accentPrimary}
          />
        </SettingsSection>

        <SettingsSection title="Akun">
          <SettingsItem
            icon="🚪"
            title={isLoggingOut ? 'Sedang keluar…' : 'Keluar Akun'}
            onPress={handleLogout}
            showChevron={false}
            destructive
          />
        </SettingsSection>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>WuzzChat · End-to-End Encrypted</Text>
          <Text style={styles.footerVersion}>v1.0.0 · Aurora Build</Text>
        </View>
      </ScrollView>

      {/* ── Modals ────────────────────────────────────────────────────── */}
      <DeviceTransferModal
        visible={isDeviceTransferVisible}
        onClose={() => setIsDeviceTransferVisible(false)}
      />

      <NotificationSettingsModal
        visible={isNotificationsVisible}
        onClose={() => setIsNotificationsVisible(false)}
      />

      <E2EEKeyModal
        visible={isE2EEKeysVisible}
        onClose={() => setIsE2EEKeysVisible(false)}
        userId={user?.id || ''}
        username={username}
        displayName={displayName}
        e2eeStatus={e2eeStatus}
      />

      <StorageSettingsModal
        visible={isStorageVisible}
        onClose={() => setIsStorageVisible(false)}
        userId={user?.id || ''}
      />

      <EditProfileModal
        visible={isEditProfileVisible}
        onClose={() => setIsEditProfileVisible(false)}
        currentDisplayName={displayName}
        currentUsername={username}
        currentAvatarUrl={user?.avatar_url}
        currentBio={user?.bio}
        currentRole={user?.role}
        currentIsPrivateAccount={user?.is_private_account}
        currentMetadata={user?.metadata}
        onProfileUpdated={(updated) => updateCurrentUser(updated)}
      />
    </View>
  );
};


// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgBase,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.bgSurface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  headerTitle: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  scrollContent: {
    paddingBottom: spacing.xxxl,
  },

  // ── Profile Card ──────────────────────────────────────────────────────────
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    borderRadius: radius.lg,
    margin: spacing.lg,
    padding: spacing.lg,
    ...shadows.card,
  },
  avatarWrapper: {
    position: 'relative',
    marginRight: spacing.md,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: colors.tintAccent20,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    ...typography.h3,
    color: colors.accentPrimary,
    fontWeight: '700',
  },
  onlineDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 12,
    height: 12,
    borderRadius: radius.full,
    backgroundColor: colors.colorOnline,
    borderWidth: 2,
    borderColor: colors.bgBase,
  },
  profileInfo: {
    flex: 1,
    gap: 2,
  },
  profileName: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  profileUsername: {
    ...typography.bodySecondary,
    color: colors.textSecondary,
  },
  e2eeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    alignSelf: 'flex-start',
    backgroundColor: `${colors.colorOnline}20`,
    borderRadius: radius.xs,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  e2eeBadgeIcon: {
    fontSize: 10,
  },
  e2eeBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.colorOnline,
  },
  editButton: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.tintAccent10,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
  editButtonIcon: {
    fontSize: 16,
  },

  // ── Section ───────────────────────────────────────────────────────────────
  section: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    ...typography.captionBold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  sectionCard: {
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },

  // ── Settings Item ─────────────────────────────────────────────────────────
  settingsItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 56,
  },
  settingsIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  settingsIconText: {
    fontSize: 18,
  },
  settingsText: {
    flex: 1,
  },
  settingsTitle: {
    ...typography.body,
    color: colors.textPrimary,
  },
  settingsSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 1,
  },
  chevron: {
    fontSize: 20,
    color: colors.textMuted,
    fontWeight: '300',
  },
  itemDivider: {
    height: 1,
    backgroundColor: colors.borderSubtle,
    marginLeft: 56 + spacing.md,
  },

  // ── Footer ────────────────────────────────────────────────────────────────
  footer: {
    alignItems: 'center',
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
    gap: spacing.xs,
  },
  footerText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  footerVersion: {
    fontSize: 10,
    color: colors.textMuted,
    opacity: 0.6,
  },
});
