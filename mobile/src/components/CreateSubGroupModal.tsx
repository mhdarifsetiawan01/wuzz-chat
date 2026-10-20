/**
 * CreateSubGroupModal — M-Mobile-8.2B
 * Form wizard for creating a new ephemeral forum topic.
 * Accessible only to admin / creator of the parent group.
 *
 * Conforms to:
 *  - Mandatory Dual-Platform Frontend Architecture Rule
 *  - Slow & Flaky Server Resilience Rule (AbortController 15s)
 *  - Mandatory Frontend Design System & Token Compliance Rule
 *  - Double-Action Protection (button disabled during submit)
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { subgroupsApi } from '../api/subgroups';
import { entitlementApi } from '../api/entitlement';
import {
  EntitlementStatus,
  forumLimitNotice,
  isDurationAllowed,
  durationLockedNote,
  aiQuotaNotice,
} from '../utils/entitlement';
import { SubGroup, SubGroupTTL, CreateSubGroupRequest } from '../api/types';
import { useTheme, useThemedStyles, ColorTokens } from '../theme';
import { IconText } from './IconText';
import { Icon } from './Icon';
import { spacing, radius, shadows } from '../theme/spacing';
import { showAlert } from '../services/dialog';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface CreateSubGroupModalProps {
  visible: boolean;
  parentGroupId: string;
  parentGroupTitle: string;
  /** Tampilkan keterangan AI Memory; hanya bila server menyatakan fiturnya aktif untuk grup ini. */
  showMemoryHint?: boolean;
  onClose: () => void;
  /** Called with the newly created sub-group so the list can refresh */
  onCreated: (subGroup: SubGroup) => void;
}

// ─── TTL Options ──────────────────────────────────────────────────────────────

const TTL_OPTIONS: { value: SubGroupTTL; label: string; description: string; days: number }[] = [
  { value: '7_days', label: '7 Hari', description: 'Topik aktif selama 1 minggu', days: 7 },
  { value: '30_days', label: '1 Bulan', description: 'Topik aktif selama 1 bulan kalender', days: 30 },
];

// ─── Component ────────────────────────────────────────────────────────────────

export const CreateSubGroupModal: React.FC<CreateSubGroupModalProps> = ({
  visible,
  parentGroupId,
  parentGroupTitle,
  showMemoryHint = false,
  onClose,
  onCreated,
}) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [ttl, setTtl] = useState<SubGroupTTL>('7_days');
  const [isPublic, setIsPublic] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  // Status paket (batas forum aktif, durasi, kuota AI). Hanya informasi: bila gagal dimuat, form tetap berfungsi
  // dan server menolak dengan pesan jelas bila batas terlewati.
  const [entitlement, setEntitlement] = useState<EntitlementStatus | null>(null);

  const loadEntitlement = useCallback(async (signal?: AbortSignal) => {
    try {
      const status = await entitlementApi.getMine(signal);
      if (!signal?.aborted) setEntitlement(status);
    } catch {
      // Diabaikan: server tetap menjadi penentu saat topik dibuat.
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    loadEntitlement(controller.signal);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [visible, loadEntitlement]);

  const limitNotice = forumLimitNotice(entitlement);
  const aiNotice = showMemoryHint ? aiQuotaNotice(entitlement) : null;
  const atLimit = !!limitNotice?.atLimit;

  const titleRef = useRef<TextInput>(null);
  const descRef = useRef<TextInput>(null);

  // ── Reset form on close ───────────────────────────────────────────────────

  const handleClose = useCallback(() => {
    setTitle('');
    setDescription('');
    setTtl('7_days');
    setIsPublic(true);
    setIsSubmitting(false);
    abortRef.current?.abort();
    onClose();
  }, [onClose]);

  // ── Submit ────────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    if (!title.trim()) {
      showAlert('Judul diperlukan', 'Masukkan judul topik forum.');
      titleRef.current?.focus();
      return;
    }
    if (isSubmitting) return; // Double-action protection
    if (atLimit) {
      showAlert('Batas Forum Tercapai', limitNotice!.text);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const timer = setTimeout(() => controller.abort(), 15_000);

    setIsSubmitting(true);
    try {
      const payload: CreateSubGroupRequest = {
        title: title.trim(),
        description: description.trim() || undefined,
        ttl,
        is_public: isPublic,
      };
      const res = await subgroupsApi.createSubGroup(parentGroupId, payload, controller.signal);
      handleClose();
      onCreated(res.group);
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      const msg = (err as any)?.detail || 'Gagal membuat topik. Silakan coba lagi.';
      const code = (err as any)?.code;
      showAlert(code === 'forum_limit_reached' ? 'Batas Forum Tercapai' : 'Gagal Membuat Topik', msg);
      if (code === 'forum_limit_reached' || code === 'duration_not_in_plan') {
        void loadEntitlement(); // sinkronkan jatah yang ditampilkan dengan keputusan server
      }
    } finally {
      clearTimeout(timer);
      setIsSubmitting(false);
    }
  }, [title, description, ttl, isPublic, isSubmitting, atLimit, limitNotice, parentGroupId, handleClose, onCreated]);

  // ─── Render ───────────────────────────────────────────────────────────────

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
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <Text style={styles.headerTitle}>Buat Topik Baru</Text>
                <IconText style={styles.headerSubtitle} numberOfLines={1}>
                  🏛️ {parentGroupTitle}
                </IconText>
              </View>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={handleClose}
                disabled={isSubmitting}
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
              {limitNotice && (
                <View style={[styles.planNotice, limitNotice.atLimit && styles.planNoticeWarn]}>
                  <Text style={styles.planNoticeText}>{limitNotice.text}</Text>
                </View>
              )}

              {/* Title input */}
              <Text style={styles.fieldLabel}>Judul Topik *</Text>
              <TextInput
                ref={titleRef}
                style={styles.textInput}
                placeholder="cth: rencana-sprint, desain-ui..."
                placeholderTextColor={colors.textMuted}
                value={title}
                onChangeText={setTitle}
                maxLength={80}
                returnKeyType="next"
                onSubmitEditing={() => descRef.current?.focus()}
                editable={!isSubmitting}
              />

              {/* Description input */}
              <Text style={[styles.fieldLabel, { marginTop: spacing.lg }]}>
                Deskripsi (Opsional)
              </Text>
              <TextInput
                ref={descRef}
                style={[styles.textInput, styles.textArea]}
                placeholder="Jelaskan tujuan topik ini..."
                placeholderTextColor={colors.textMuted}
                value={description}
                onChangeText={setDescription}
                maxLength={200}
                multiline
                numberOfLines={3}
                returnKeyType="done"
                editable={!isSubmitting}
              />

              {/* TTL selector */}
              <Text style={[styles.fieldLabel, { marginTop: spacing.lg }]}>
                Masa Aktif
              </Text>
              <View style={styles.ttlRow}>
                {TTL_OPTIONS.map((opt) => {
                  const isSelected = ttl === opt.value;
                  const locked = !isDurationAllowed(entitlement, opt.days);
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      style={[
                        styles.ttlOption,
                        isSelected && !locked && styles.ttlOptionSelected,
                        locked && styles.ttlOptionLocked,
                      ]}
                      onPress={() => setTtl(opt.value)}
                      activeOpacity={0.75}
                      disabled={isSubmitting || locked}
                      accessibilityState={{ disabled: isSubmitting || locked }}
                    >
                      <IconText
                        style={[styles.ttlLabel, isSelected && !locked && styles.ttlLabelSelected]}
                      >
                        ⏱ {opt.label}
                      </IconText>
                      <Text
                        style={[styles.ttlDesc, isSelected && !locked && styles.ttlDescSelected]}
                      >
                        {locked ? durationLockedNote(entitlement, opt.days) : opt.description}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Public / Private toggle */}
              <View style={[styles.toggleRow, { marginTop: spacing.xl }]}>
                <View style={styles.toggleInfo}>
                  <IconText style={styles.toggleLabel}>
                    {isPublic ? '🌐 Terbuka (Publik)' : '🔒 Privat (Perlu Izin)'}
                  </IconText>
                  <Text style={styles.toggleDesc}>
                    {isPublic
                      ? 'Semua anggota grup bisa langsung bergabung'
                      : 'Anggota harus mengajukan permohonan izin'}
                  </Text>
                </View>
                <Switch
                  value={isPublic}
                  onValueChange={setIsPublic}
                  disabled={isSubmitting}
                  trackColor={{ false: colors.bgElevated, true: colors.accentPrimary }}
                  thumbColor={isPublic ? colors.textOnAccent : colors.textMuted}
                />
              </View>

              {showMemoryHint && (
                <View style={styles.memoryHint}>
                  <Icon name="bulb" size={18} color={colors.accentPrimary} />
                  <Text style={styles.memoryHintText}>
                    Saat topik berakhir, AI Memory merangkum keputusan dan poin penting. Ringkasan
                    baru masuk arsip setelah disetujui admin.
                    {aiNotice ? `\n${aiNotice.text}` : ''}
                  </Text>
                </View>
              )}

              {/* Submit button */}
              <TouchableOpacity
                style={[styles.submitBtn, (isSubmitting || atLimit) && styles.submitBtnDisabled]}
                onPress={handleSubmit}
                disabled={isSubmitting || atLimit}
                activeOpacity={0.8}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color={colors.textOnAccent} />
                ) : (
                  <IconText style={styles.submitBtnText}>✦ Buat Topik Forum</IconText>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const makeStyles = (colors: ColorTokens) => StyleSheet.create({
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
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  headerLeft: { flex: 1 },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: 0.2,
  },
  headerSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
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
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
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
    paddingTop: spacing.md,
  },
  ttlRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  ttlOption: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: colors.bgElevated,
  },
  ttlOptionSelected: {
    borderColor: colors.accentPrimary,
    backgroundColor: colors.tintAccent10,
  },
  ttlOptionLocked: {
    opacity: 0.5,
  },
  planNotice: {
    marginBottom: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.tintAccent10,
  },
  planNoticeWarn: {
    backgroundColor: colors.tintWarning10,
  },
  planNoticeText: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  ttlLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: 4,
  },
  ttlLabelSelected: {
    color: colors.accentPrimary,
  },
  ttlDesc: {
    fontSize: 11,
    color: colors.textMuted,
  },
  ttlDescSelected: {
    color: colors.textSecondary,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.md,
  },
  toggleInfo: { flex: 1 },
  toggleLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 3,
  },
  toggleDesc: {
    fontSize: 12,
    color: colors.textMuted,
  },
  memoryHint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.tintAccent10,
  },
  memoryHintText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  submitBtn: {
    marginTop: spacing.xxl,
    backgroundColor: colors.accentFill,
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  submitBtnDisabled: {
    opacity: 0.55,
  },
  submitBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textOnAccent,
    letterSpacing: 0.3,
  },
});
