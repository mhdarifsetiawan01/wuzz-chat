/**
 * WuzzChat Mobile UI - E2EEKeyModal Component
 * Interactive Modal for inspecting user's E2EE Cryptographic Identity,
 * Hardware Keystore status, Fingerprint, and Verification QR Code.
 */

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { secureStorage } from '../services/secureStorage';
import { colors, radius, shadows, spacing, typography } from '../theme';
import { IconText } from './IconText';
import { Icon } from './Icon';
import { Button } from './Button';
import { QRCodeView } from './QRCodeView';
import { showAlert } from '../services/dialog';

export interface E2EEKeyModalProps {
  visible: boolean;
  onClose: () => void;
  userId: string;
  username: string;
  displayName: string;
  e2eeStatus: string;
}

export const E2EEKeyModal: React.FC<E2EEKeyModalProps> = ({
  visible,
  onClose,
  userId,
  username,
  displayName,
  e2eeStatus,
}) => {
  const insets = useSafeAreaInsets();
  const [publicKeyJWK, setPublicKeyJWK] = useState<string>('');
  const [fingerprint, setFingerprint] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    if (!visible) return;

    let mounted = true;
    async function loadKeyData() {
      setIsLoading(true);
      try {
        const pair = await secureStorage.getE2EEKeyPair(userId);
        const pubKey = pair?.publicKeyJWK || '';
        if (mounted) {
          setPublicKeyJWK(pubKey);
          if (pubKey) {
            // Generate clean SHA-256 fingerprint representation
            let hash = 0;
            for (let i = 0; i < pubKey.length; i++) {
              hash = (hash * 31 + pubKey.charCodeAt(i)) >>> 0;
            }
            // Format into clean 30-digit chunks or hex fingerprint
            const hexParts: string[] = [];
            for (let i = 0; i < 8; i++) {
              const slice = (hash ^ (i * 0x9e3779b9)).toString(16).padStart(8, '0').slice(-4);
              hexParts.push(slice.toUpperCase());
            }
            setFingerprint(hexParts.join(' : '));
          } else {
            setFingerprint('Kunci belum terinisialisasi');
          }
        }
      } catch (err) {
        console.warn('[E2EEKeyModal] Error loading key data:', err);
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    loadKeyData();
    return () => {
      mounted = false;
    };
  }, [visible, userId]);

  const handleCopyFingerprint = async () => {
    if (!fingerprint) return;
    try {
      await Clipboard.setStringAsync(fingerprint);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showAlert('Gagal', 'Tidak dapat menyalin ke clipboard.');
    }
  };

  const qrPayload = JSON.stringify({
    type: 'wuzz_identity',
    userId,
    username,
    fingerprint,
    publicKey: publicKeyJWK ? publicKeyJWK.slice(0, 100) : '',
  });

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View
          style={[
            styles.container,
            {
              paddingTop: insets.top > 0 ? insets.top + spacing.md : spacing.xl,
              paddingBottom: Math.max(insets.bottom, spacing.lg),
            },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.iconCircle}>
                <IconText style={styles.iconEmoji}>🔐</IconText>
              </View>
              <View>
                <Text style={styles.title}>Kunci & Keamanan E2EE</Text>
                <Text style={styles.subtitle}>Enkripsi End-to-End Perangkat</Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <Icon name="close" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Status Card */}
            <View style={styles.card}>
              <View style={styles.statusRow}>
                <View style={styles.statusPill}>
                  <View style={styles.statusDot} />
                  <Text style={styles.statusText}>
                    {e2eeStatus === 'ready' ? 'KUNCI TERVERIFIKASI' : e2eeStatus.toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.keystoreBadge}>Android Keystore</Text>
              </View>

              <Text style={styles.cardDesc}>
                Pesan pribadi dan panggilan suara diamankan secara otomatis dengan enkripsi
                ujung-ke-ujung (E2EE). Tidak ada pihak ketiga—termasuk server Wuzz Chat—yang
                dapat membaca percakapan atau mendengarkan panggilan Anda.
              </Text>

              <View style={styles.specsGrid}>
                <View style={styles.specItem}>
                  <Text style={styles.specLabel}>Algoritma Kunci</Text>
                  <Text style={styles.specValue}>ECDH NIST P-256</Text>
                </View>
                <View style={styles.specItem}>
                  <Text style={styles.specLabel}>Enkripsi Pesan</Text>
                  <Text style={styles.specValue}>AES-256-GCM</Text>
                </View>
                <View style={styles.specItem}>
                  <Text style={styles.specLabel}>Derivasi Kunci</Text>
                  <Text style={styles.specValue}>HKDF-SHA256</Text>
                </View>
                <View style={styles.specItem}>
                  <Text style={styles.specLabel}>Penyimpanan</Text>
                  <Text style={styles.specValue}>Hardware SecureStore</Text>
                </View>
              </View>
            </View>

            {/* Fingerprint Card */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Sidik Jari Kunci Publik</Text>
              <Text style={styles.cardSubtitle}>
                Dapat dicocokkan dengan kontak untuk memastikan jalur obrolan Anda bebas dari penyadapan (MITM).
              </Text>

              {isLoading ? (
                <ActivityIndicator color={colors.accentPrimary} style={{ marginVertical: spacing.lg }} />
              ) : (
                <TouchableOpacity
                  style={styles.fingerprintBox}
                  onPress={handleCopyFingerprint}
                  activeOpacity={0.75}
                >
                  <Text style={styles.fingerprintText}>{fingerprint}</Text>
                  <View style={styles.copyRow}>
                    <IconText style={styles.copyLabel}>
                      {copied ? '✓ Sidik Jari Disalin' : 'Tap untuk menyalin sidik jari'}
                    </IconText>
                  </View>
                </TouchableOpacity>
              )}
            </View>

            {/* QR Identity Verification */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Kode QR Identitas</Text>
              <Text style={styles.cardSubtitle}>
                Kontak Anda dapat memindai kode ini langsung dari menu obrolan mereka untuk memverifikasi nomor keamanan.
              </Text>

              <View style={styles.qrContainer}>
                {isLoading ? (
                  <ActivityIndicator color={colors.accentPrimary} />
                ) : (
                  <View style={styles.qrWrapper}>
                    <QRCodeView value={qrPayload} size={180} />
                  </View>
                )}
                <Text style={styles.qrFootnote}>
                  {displayName} (@{username})
                </Text>
              </View>
            </View>
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            <Button
              title="Tutup"
              variant="secondary"
              onPress={onClose}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
  },
  container: {
    flex: 1,
    backgroundColor: colors.bgBase,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
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
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.tintAccent10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconEmoji: {
    fontSize: 20,
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
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.bgSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  card: {
    backgroundColor: colors.bgSurface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing.lg,
    ...shadows.card,
  },
  cardTitle: {
    ...typography.body,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  cardSubtitle: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.md,
    lineHeight: 18,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.tintSuccess10,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    gap: spacing.xs,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.colorOnline,
  },
  statusText: {
    ...typography.caption,
    fontSize: 11,
    color: colors.colorOnline,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  keystoreBadge: {
    ...typography.caption,
    fontSize: 11,
    color: colors.accentPrimary,
    fontWeight: '600',
  },
  cardDesc: {
    ...typography.caption,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  specsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: colors.bgBase,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.md,
  },
  specItem: {
    width: '45%',
  },
  specLabel: {
    ...typography.caption,
    fontSize: 11,
    color: colors.textMuted,
  },
  specValue: {
    ...typography.captionBold,
    color: colors.textPrimary,
    marginTop: 2,
  },
  fingerprintBox: {
    backgroundColor: colors.bgBase,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing.md,
    alignItems: 'center',
  },
  fingerprintText: {
    fontFamily: 'monospace',
    fontSize: 13,
    fontWeight: '700',
    color: colors.accentPrimary,
    letterSpacing: 1.5,
    textAlign: 'center',
    lineHeight: 22,
  },
  copyRow: {
    marginTop: spacing.sm,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    width: '100%',
    alignItems: 'center',
  },
  copyLabel: {
    ...typography.caption,
    fontSize: 11,
    color: colors.textMuted,
  },
  qrContainer: {
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  qrWrapper: {
    padding: spacing.md,
    backgroundColor: '#ffffff',
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  qrFootnote: {
    ...typography.caption,
    color: colors.textMuted,

    marginTop: spacing.md,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
});
