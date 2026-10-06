/**
 * Tampilan murni layar "akun dibekukan, hubungkan Google" (tanpa konteks/hook) supaya bisa dipratinjau secara visual.
 * Perilaku (menautkan, keluar, hapus akun) disuntikkan lewat props oleh GoogleLinkRequiredScreen.
 */

import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, radius, spacing, typography } from '../theme';
import { Button } from './Button';
import { GoogleSignInButton } from './google/GoogleSignInButton';

export interface GoogleLinkRequiredViewProps {
  username?: string;
  isLinking: boolean;
  isLoggingOut: boolean;
  onLink: () => void;
  onLogout: () => void;
  onDelete: () => void;
}

export const GoogleLinkRequiredView: React.FC<GoogleLinkRequiredViewProps> = ({
  username,
  isLinking,
  isLoggingOut,
  onLink,
  onLogout,
  onDelete,
}) => (
  <ScrollView contentContainerStyle={styles.scrollContent}>
    <View style={styles.card}>
      <Text style={styles.title}>Hubungkan akun Google untuk melanjutkan</Text>
      <Text style={styles.body}>
        Batas waktu menautkan akun Google sudah lewat, sehingga akun{username ? ` @${username}` : ''} dibatasi sementara.
      </Text>
      <Text style={styles.body}>
        Pesan, teman, dan data Anda aman dan tidak dihapus. Hubungkan akun Google untuk membuka kembali akun Anda.
      </Text>

      <GoogleSignInButton title="Hubungkan Akun Google" isLoading={isLinking} onPress={onLink} style={styles.button} />
      <Button title="Keluar" variant="ghost" disabled={isLinking || isLoggingOut} onPress={onLogout} style={styles.button} />

      <TouchableOpacity onPress={onDelete} activeOpacity={0.7} style={styles.deleteLink} disabled={isLinking}>
        <Text style={styles.deleteLinkText}>Hapus akun saya</Text>
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
  title: { ...typography.h2, color: colors.textPrimary, marginBottom: spacing.md },
  body: { ...typography.bodySecondary, color: colors.textSecondary, marginBottom: spacing.md },
  button: { marginTop: spacing.sm },
  deleteLink: { alignSelf: 'center', marginTop: spacing.xl, padding: spacing.sm },
  deleteLinkText: { ...typography.captionBold, color: colors.colorError },
});
