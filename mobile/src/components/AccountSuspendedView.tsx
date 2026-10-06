/**
 * Tampilan murni layar "akun ditangguhkan" (tanpa konteks/hook) supaya bisa dipratinjau secara visual.
 * Perilaku (banding, keluar, hapus akun) disuntikkan lewat props oleh AccountSuspendedScreen.
 * Teks ada di accountSuspendedCopy.ts; warna hanya dari token tema.
 */

import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, radius, spacing, typography } from '../theme';
import { Button } from './Button';
import { Icon } from './Icon';
import { accountSuspendedCopy as copy } from './accountSuspendedCopy';

export interface AccountSuspendedViewProps {
  username?: string;
  supportEmail: string;
  isLoggingOut: boolean;
  isChecking?: boolean;
  /** Hasil pemeriksaan terakhir (masih ditangguhkan / gagal menjangkau server); kosong bila belum memeriksa. */
  statusMessage?: string | null;
  onCheck?: () => void;
  onAppeal: () => void;
  onLogout: () => void;
  onDelete: () => void;
}

export const AccountSuspendedView: React.FC<AccountSuspendedViewProps> = ({
  username,
  supportEmail,
  isLoggingOut,
  isChecking = false,
  statusMessage,
  onCheck,
  onAppeal,
  onLogout,
  onDelete,
}) => (
  <ScrollView contentContainerStyle={styles.scrollContent}>
    <View style={styles.card}>
      <View style={styles.iconCircle}>
        <Icon name="ban" size={28} color={colors.colorError} />
      </View>
      <Text style={styles.title} accessibilityRole="header">
        {copy.title}
      </Text>
      <Text style={styles.body}>{copy.body(username)}</Text>
      <Text style={styles.body}>{copy.safeData}</Text>

      <Button title={copy.appeal} onPress={onAppeal} style={styles.button} />
      {/* Alamat di baris sendiri agar tidak terpotong di tengah dan bisa disalin. */}
      <Text style={styles.contactLine}>{copy.contactIntro}</Text>
      <Text style={styles.contactEmail} selectable>
        {supportEmail}
      </Text>
      <Text style={styles.contactLine}>{copy.contactHint}</Text>
      {onCheck ? (
        <Button
          title={copy.checkStatus}
          variant="secondary"
          isLoading={isChecking}
          disabled={isChecking || isLoggingOut}
          onPress={onCheck}
          style={styles.button}
        />
      ) : null}
      {statusMessage ? (
        <Text style={styles.statusMessage} accessibilityLiveRegion="polite">
          {statusMessage}
        </Text>
      ) : null}
      <Button title={copy.logout} variant="ghost" disabled={isLoggingOut} onPress={onLogout} style={styles.button} />

      <TouchableOpacity onPress={onDelete} activeOpacity={0.7} style={styles.deleteLink}>
        <Text style={styles.deleteLinkText}>{copy.deleteAccount}</Text>
      </TouchableOpacity>
    </View>
  </ScrollView>
);

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
  },
  card: {
    backgroundColor: colors.bgSurface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    padding: spacing.xxl,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.tintError10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  title: { ...typography.h2, color: colors.textPrimary, marginBottom: spacing.md },
  body: { ...typography.bodySecondary, color: colors.textSecondary, marginBottom: spacing.md },
  button: { marginTop: spacing.sm },
  statusMessage: { ...typography.caption, color: colors.colorError, marginTop: spacing.sm, textAlign: 'center' },
  contactLine: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs, textAlign: 'center' },
  contactEmail: { ...typography.captionBold, color: colors.textPrimary, marginTop: spacing.xs, textAlign: 'center' },
  deleteLink: { alignSelf: 'center', marginTop: spacing.xl, padding: spacing.sm },
  deleteLinkText: { ...typography.captionBold, color: colors.colorError },
});
