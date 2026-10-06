/**
 * WuzzChat Mobile UI - ReportModal
 * Dialog pelaporan konten/pengguna (syarat kebijakan User-Generated Content Google Play).
 */

import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CreateReportRequest, ReportReason, reportsApi } from '../api';
import { colors, radius, shadows, spacing, typography } from '../theme';
import { showAlert } from '../services/dialog';
import { Button } from './Button';
import { Input } from './Input';

const REASONS: { key: ReportReason; label: string }[] = [
  { key: 'spam', label: 'Spam atau penipuan' },
  { key: 'harassment', label: 'Pelecehan atau perundungan' },
  { key: 'hate', label: 'Ujaran kebencian' },
  { key: 'sexual', label: 'Konten seksual' },
  { key: 'violence', label: 'Kekerasan atau ancaman' },
  { key: 'illegal', label: 'Aktivitas ilegal' },
  { key: 'impersonation', label: 'Meniru identitas orang lain' },
  { key: 'other', label: 'Lainnya' },
];

export interface ReportTarget {
  type: CreateReportRequest['target_type'];
  id: string;
  userId?: string;
  /** Teks yang dilaporkan; untuk pesan E2EE ini satu-satunya bukti yang dapat ditinjau moderator. */
  evidence?: string;
  /** Nama untuk judul dialog, mis. "pesan", "postingan", "Budi". */
  label: string;
}

export interface ReportModalProps {
  visible: boolean;
  target: ReportTarget | null;
  onClose: () => void;
}

export const ReportModal: React.FC<ReportModalProps> = ({ visible, target, onClose }) => {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    if (!visible) {
      setReason(null);
      setDetails('');
      setIsSending(false);
    }
  }, [visible]);

  if (!visible || !target) return null;

  const submit = async () => {
    if (!reason) return;
    setIsSending(true);
    try {
      await reportsApi.create({
        target_type: target.type,
        target_id: target.id,
        target_user_id: target.userId,
        reason,
        details: details.trim() || undefined,
        evidence: target.evidence ? target.evidence.slice(0, 2000) : undefined,
      });
      onClose();
      showAlert('Laporan terkirim', 'Terima kasih. Tim kami akan meninjau laporan Anda.');
    } catch (err: any) {
      setIsSending(false);
      showAlert('Gagal mengirim', err?.detail || 'Periksa koneksi lalu coba lagi.');
    }
  };

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={isSending ? undefined : onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.card}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
            <Text style={styles.title}>Laporkan {target.label}</Text>
            <Text style={styles.description}>Pilih alasan yang paling sesuai.</Text>
            {REASONS.map((r) => {
              const selected = reason === r.key;
              return (
                <TouchableOpacity
                  key={r.key}
                  style={[styles.option, selected && styles.optionSelected]}
                  onPress={() => setReason(r.key)}
                  disabled={isSending}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                >
                  <View style={[styles.radio, selected && styles.radioSelected]} />
                  <Text style={styles.optionText}>{r.label}</Text>
                </TouchableOpacity>
              );
            })}
            <Input
              placeholder="Keterangan tambahan (opsional)"
              value={details}
              onChangeText={setDetails}
              maxLength={500}
              multiline
              editable={!isSending}
              containerStyle={styles.details}
            />
            <View style={styles.actions}>
              <Button title="Kirim Laporan" isLoading={isSending} disabled={!reason} onPress={submit} style={styles.btn} />
              <Button title="Batal" variant="secondary" disabled={isSending} onPress={onClose} style={styles.btn} />
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: colors.bgOverlay, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.xl },
  card: {
    width: '100%',
    maxWidth: 380,
    maxHeight: '90%',
    backgroundColor: colors.bgCardSolid,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    ...shadows.modal,
  },
  content: { padding: spacing.xl },
  title: { ...typography.h3, color: colors.textPrimary, marginBottom: spacing.xs },
  description: { ...typography.bodySecondary, color: colors.textSecondary, marginBottom: spacing.md },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  optionSelected: { backgroundColor: colors.tintAccent10, borderColor: colors.tintAccent20 },
  radio: { width: 18, height: 18, borderRadius: radius.full, borderWidth: 2, borderColor: colors.textMuted },
  radioSelected: { borderColor: colors.accentPrimary, backgroundColor: colors.accentPrimary },
  optionText: { ...typography.body, color: colors.textPrimary, flexShrink: 1 },
  details: { marginTop: spacing.md },
  actions: { gap: spacing.sm, marginTop: spacing.md },
  btn: { width: '100%', height: 48, borderRadius: radius.lg },
});
