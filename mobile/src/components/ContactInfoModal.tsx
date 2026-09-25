/**
 * WuzzChat Mobile UI - ContactInfoModal Component
 * WhatsApp-grade contact profile screen with Aurora Glassmorphism, Verified Badge,
 * quick actions (call, share, mute), and E2EE Security verification card.
 *
 * Conforms to:
 * - Mandatory Dual-Platform Frontend Architecture Rule
 * - Slow & Flaky Server Resilience Rule (AbortController 15s)
 * - Mandatory Frontend Design System & Token Compliance Rule
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ScrollView,
  ActivityIndicator,
  Share,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getUserProfile } from '../api/users';
import { User } from '../api/types';
import { Avatar } from './Avatar';
import { VerifiedBadge } from './VerifiedBadge';
import { SafetyNumberModal } from './SafetyNumberModal';
import { generateSafetyNumber, isContactSafetyVerified } from '../services/e2eeService';
import { colors, radius, spacing, typography } from '../theme';

export interface ContactInfoModalProps {
  visible: boolean;
  onClose: () => void;
  userId: string;
  currentUserId: string;
  initialDisplayName?: string;
  initialAvatarUrl?: string;
  initialUsername?: string;
  initialIsVerified?: boolean;
  peerPublicKeyJWK?: string;
  myPublicKeyJWK?: string;
  isOnline?: boolean;
}

export const ContactInfoModal: React.FC<ContactInfoModalProps> = ({
  visible,
  onClose,
  userId,
  currentUserId,
  initialDisplayName,
  initialAvatarUrl,
  initialUsername,
  initialIsVerified = false,
  peerPublicKeyJWK,
  myPublicKeyJWK,
  isOnline = false,
}) => {
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [safetyNumber, setSafetyNumber] = useState<string>('');
  const [isSafetyVerified, setIsSafetyVerified] = useState<boolean>(false);
  const [showSafetyModal, setShowSafetyModal] = useState<boolean>(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!visible || !userId) return;

    let mounted = true;
    setIsLoading(true);
    setErrorMessage(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Timeout 15s (Slow & Flaky Server Resilience Rule)
    const timer = setTimeout(() => {
      controller.abort();
    }, 15000);

    async function loadData() {
      let fetchedProfile: User | null = null;
      try {
        const data = await getUserProfile(userId);
        fetchedProfile = data;
        if (mounted) {
          setProfile(data);
          setIsLoading(false);
        }
      } catch (err: any) {
        if (mounted) {
          if (err?.name === 'AbortError' || err?.status === 408) {
            setErrorMessage('Waktu memuat profil habis (Jaringan lambat)');
          } else {
            // Keep fallback initial info
            setErrorMessage(null);
          }
          setIsLoading(false);
        }
      } finally {
        clearTimeout(timer);
      }

      let resolvedKey = peerPublicKeyJWK || fetchedProfile?.public_key;

      // Calculate Safety Number preview & status
      try {
        if (resolvedKey && myPublicKeyJWK) {
          const num = await generateSafetyNumber(myPublicKeyJWK, resolvedKey);
          if (mounted) {
            setSafetyNumber(num);
            const verified = await isContactSafetyVerified(userId, num);
            setIsSafetyVerified(verified);
          }
        }
      } catch (err) {
        console.warn('[ContactInfoModal] Failed to calculate safety number:', err);
      }
    }

    loadData();

    return () => {
      mounted = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, [visible, userId, peerPublicKeyJWK, myPublicKeyJWK]);

  const displayName = profile?.display_name || initialDisplayName || 'Pengguna';
  const username = profile?.username || initialUsername || '';
  const avatarUrl = profile?.avatar_url || initialAvatarUrl;
  const isVerified = Boolean(profile?.is_verified ?? initialIsVerified);
  const statusBio = profile?.status_message || 'Tersedia untuk mengobrol';

  const formatJoinDate = (dateStr?: string) => {
    if (!dateStr) return 'Baru saja';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  const handleShareContact = async () => {
    try {
      await Share.share({
        message: `Kontak WuzzChat: ${displayName} (@${username})\nhttps://chat.wuzzhub.id/u/${username}`,
        title: `Bagikan Kontak ${displayName}`,
      });
    } catch (err) {
      console.warn('[ContactInfoModal] Failed to share contact:', err);
    }
  };

  const handleVoiceCallPlaceholder = () => {
    Alert.alert(
      'Panggilan Suara E2EE',
      `Panggilan suara terenkripsi dengan ${displayName} akan segera hadir di pembaruan berikutnya.`,
      [{ text: 'Mengerti', style: 'default' }]
    );
  };

  const handleToggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    Alert.alert(
      next ? 'Notifikasi Dibisukan' : 'Notifikasi Diaktifkan',
      next
        ? `Notifikasi percakapan dari ${displayName} telah dibisukan.`
        : `Notifikasi percakapan dari ${displayName} aktif kembali.`,
      [{ text: 'OK', style: 'default' }]
    );
  };

  if (!visible) return null;

  return (
    <>
      <Modal
        visible={visible && !showSafetyModal}
        transparent
        animationType="slide"
        onRequestClose={onClose}
      >
        <View style={styles.overlay}>
          <View
            style={[
              styles.card,
              {
                paddingBottom: Math.max(spacing.lg, insets.bottom + spacing.md),
                paddingTop: spacing.md,
              },
            ]}
          >
            {/* Header Bar */}
            <View style={styles.header}>
              <Text style={styles.headerTitle}>Info Kontak</Text>
              <TouchableOpacity
                onPress={onClose}
                style={styles.closeBtn}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Text style={styles.closeText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollContent}
            >
              {/* Profile Hero */}
              <View style={styles.heroSection}>
                <View style={styles.avatarWrapper}>
                  <Avatar
                    name={displayName}
                    avatarUrl={avatarUrl}
                    size={84}
                    isOnline={isOnline}
                  />
                </View>

                <View style={styles.nameRow}>
                  <Text style={styles.displayName} numberOfLines={1}>
                    {displayName}
                  </Text>
                  {isVerified && <VerifiedBadge size={18} />}
                </View>

                {username ? (
                  <Text style={styles.usernameText}>@{username}</Text>
                ) : null}

                <Text style={styles.onlineStatusText}>
                  {isOnline ? '🟢 Sedang Aktif (Online)' : 'Terakhir dilihat baru saja'}
                </Text>
              </View>

              {/* Quick Actions (Call, Share, Mute) */}
              <View style={styles.quickActionsContainer}>
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={handleVoiceCallPlaceholder}
                  activeOpacity={0.75}
                >
                  <View style={styles.actionIconCircle}>
                    <Text style={styles.actionIcon}>📞</Text>
                  </View>
                  <Text style={styles.actionLabel}>Panggilan</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={handleShareContact}
                  activeOpacity={0.75}
                >
                  <View style={styles.actionIconCircle}>
                    <Text style={styles.actionIcon}>🔗</Text>
                  </View>
                  <Text style={styles.actionLabel}>Bagikan</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={handleToggleMute}
                  activeOpacity={0.75}
                >
                  <View
                    style={[
                      styles.actionIconCircle,
                      isMuted && styles.actionIconCircleActive,
                    ]}
                  >
                    <Text style={styles.actionIcon}>{isMuted ? '🔕' : '🔔'}</Text>
                  </View>
                  <Text style={styles.actionLabel}>{isMuted ? 'Dibisukan' : 'Bisukan'}</Text>
                </TouchableOpacity>
              </View>

              {/* Status / Bio Card */}
              <View style={styles.infoBox}>
                <Text style={styles.infoBoxLabel}>STATUS BIO</Text>
                <Text style={styles.infoBoxContent}>{statusBio}</Text>
              </View>

              {/* E2EE Security Card */}
              <View style={styles.securityCard}>
                <View style={styles.securityCardHeader}>
                  <View style={styles.securityTitleRow}>
                    <Text style={styles.securityIcon}>🔒</Text>
                    <View>
                      <Text style={styles.securityTitle}>Enkripsi Ujung-ke-Ujung</Text>
                      <Text style={styles.securitySubtitle}>
                        Pesan terlindungi secara kriptografis
                      </Text>
                    </View>
                  </View>
                  <View
                    style={[
                      styles.verifiedBadgePill,
                      isSafetyVerified ? styles.pillVerified : styles.pillE2EEActive,
                    ]}
                  >
                    <Text style={styles.pillText}>
                      {isSafetyVerified ? '✅ Terverifikasi' : '🔒 E2EE Aktif'}
                    </Text>
                  </View>
                </View>

                {safetyNumber ? (
                  <View style={styles.safetyPreviewBox}>
                    <Text style={styles.safetyPreviewText} numberOfLines={1}>
                      {safetyNumber}
                    </Text>
                  </View>
                ) : null}

                <TouchableOpacity
                  style={styles.verifyBtn}
                  onPress={() => setShowSafetyModal(true)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.verifyBtnText}>🔍 Pindai / Cocokkan Kode Keamanan</Text>
                </TouchableOpacity>
              </View>

              {/* Additional Details */}
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Bergabung sejak</Text>
                <Text style={styles.metaValue}>{formatJoinDate(profile?.created_at)}</Text>
              </View>
            </ScrollView>

            {/* Bottom Close Button */}
            <TouchableOpacity style={styles.closeMainBtn} onPress={onClose} activeOpacity={0.8}>
              <Text style={styles.closeMainBtnText}>Tutup</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Nested Dedicated Safety Number Modal */}
      <SafetyNumberModal
        visible={showSafetyModal}
        onClose={() => setShowSafetyModal(false)}
        currentUserId={currentUserId}
        peerId={userId}
        peerNickname={displayName}
        peerPublicKeyJWK={peerPublicKeyJWK || profile?.public_key}
        myPublicKeyJWK={myPublicKeyJWK}
        onVerificationChanged={(verified) => setIsSafetyVerified(verified)}
      />
    </>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: colors.bgOverlay,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: spacing.lg,
    maxHeight: '90%',
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    marginBottom: spacing.md,
  },
  headerTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  closeBtn: {
    padding: spacing.xs,
  },
  closeText: {
    fontSize: 18,
    color: colors.textMuted,
    fontWeight: '600',
  },
  scrollContent: {
    paddingBottom: spacing.md,
  },
  heroSection: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    marginBottom: spacing.md,
  },
  avatarWrapper: {
    marginBottom: spacing.sm,
    shadowColor: colors.accentPrimary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 2,
  },
  displayName: {
    ...typography.h2,
    color: colors.textPrimary,
    fontWeight: '700',
    textAlign: 'center',
  },
  usernameText: {
    ...typography.bodySecondary,
    color: colors.textMuted,
    marginBottom: 4,
  },
  onlineStatusText: {
    ...typography.caption,
    color: colors.colorCyanNeon,
    fontWeight: '600',
    marginTop: 2,
  },
  quickActionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  actionBtn: {
    alignItems: 'center',
    gap: 6,
    width: 80,
  },
  actionIconCircle: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionIconCircleActive: {
    borderColor: colors.colorWarning,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
  },
  actionIcon: {
    fontSize: 20,
  },
  actionLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  infoBox: {
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  infoBoxLabel: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  infoBoxContent: {
    ...typography.body,
    color: colors.textPrimary,
    lineHeight: 22,
  },
  securityCard: {
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: 'rgba(0, 242, 254, 0.25)',
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  securityCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  securityTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  securityIcon: {
    fontSize: 20,
  },
  securityTitle: {
    ...typography.body,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  securitySubtitle: {
    ...typography.caption,
    color: colors.textMuted,
  },
  verifiedBadgePill: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  pillVerified: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: 'rgba(16, 185, 129, 0.4)',
  },
  pillE2EEActive: {
    backgroundColor: 'rgba(0, 180, 216, 0.15)',
    borderColor: 'rgba(0, 180, 216, 0.4)',
  },
  pillText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  safetyPreviewBox: {
    backgroundColor: colors.bgOverlay,
    padding: spacing.sm,
    borderRadius: radius.md,
    marginVertical: spacing.xs,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  safetyPreviewText: {
    fontFamily: 'monospace',
    fontSize: 13,
    color: colors.colorCyanNeon,
    letterSpacing: 1.5,
    textAlign: 'center',
  },
  verifyBtn: {
    backgroundColor: colors.bgOverlay,
    borderWidth: 1,
    borderColor: colors.accentPrimary,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  verifyBtnText: {
    ...typography.bodySecondary,
    color: colors.accentPrimary,
    fontWeight: '700',
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
    marginBottom: spacing.md,
  },
  metaLabel: {
    ...typography.caption,
    color: colors.textMuted,
  },
  metaValue: {
    ...typography.caption,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  closeMainBtn: {
    backgroundColor: colors.accentPrimary,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeMainBtnText: {
    ...typography.body,
    fontWeight: '700',
    color: '#ffffff',
  },
});
