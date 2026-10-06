/**
 * WuzzChat Mobile UI - GoogleLinkRequiredScreen
 * Menggantikan seluruh aplikasi untuk akun yang DIBEKUKAN: batas waktu menautkan akun Google sudah lewat. Data tidak
 * dihapus. Tiga jalan keluar: hubungkan Google (akun langsung dibuka kembali), keluar, atau hapus akun (syarat
 * kebijakan Google Play, tidak boleh terblokir walau akun beku).
 */

import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, DeleteAccountModal } from '../components';
import { useAuth } from '../context';
import { useLinkGoogle } from '../hooks/useLinkGoogle';
import { colors, radius, spacing, typography } from '../theme';

export const GoogleLinkRequiredScreen: React.FC = () => {
  const { user, logout, deleteAccount } = useAuth();
  const { link, isLinking } = useLinkGoogle();
  const [isDeleteVisible, setIsDeleteVisible] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await logout();
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <Text style={styles.title}>Hubungkan akun Google untuk melanjutkan</Text>
          <Text style={styles.body}>
            Batas waktu menautkan akun Google sudah lewat, sehingga akun{user?.username ? ` @${user.username}` : ''} dibatasi
            sementara.
          </Text>
          <Text style={styles.body}>
            Pesan, teman, dan data Anda aman dan tidak dihapus. Hubungkan akun Google untuk membuka kembali akun Anda.
          </Text>

          <Button title="Hubungkan Akun Google" isLoading={isLinking} onPress={link} style={styles.button} />
          <Button
            title="Keluar"
            variant="secondary"
            disabled={isLinking || isLoggingOut}
            onPress={handleLogout}
            style={styles.button}
          />

          <TouchableOpacity onPress={() => setIsDeleteVisible(true)} activeOpacity={0.7} style={styles.deleteLink} disabled={isLinking}>
            <Text style={styles.deleteLinkText}>Hapus akun saya</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <DeleteAccountModal
        visible={isDeleteVisible}
        onClose={() => setIsDeleteVisible(false)}
        onConfirm={deleteAccount}
        hasPassword={user?.has_password !== false}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.bgBase },
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
