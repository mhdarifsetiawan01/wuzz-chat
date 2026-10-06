/**
 * WuzzChat Mobile UI - AccountSuspendedScreen
 * Menggantikan seluruh aplikasi untuk akun yang DITANGGUHKAN moderator. Data tidak dihapus. Jalan keluar yang masih
 * diizinkan server: ajukan banding (email ke support), keluar, atau hapus akun (syarat kebijakan Google Play, tidak
 * boleh terblokir walau akun ditangguhkan).
 */

import React, { useState } from 'react';
import { Linking, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SUPPORT_EMAIL } from '../api/config';
import { DeleteAccountModal } from '../components';
import { AccountSuspendedView } from '../components/AccountSuspendedView';
import { accountSuspendedCopy } from '../components/accountSuspendedCopy';
import { useAuth } from '../context';
import { colors } from '../theme';

export const AccountSuspendedScreen: React.FC = () => {
  const { user, logout, deleteAccount, recheckAccountStatus } = useAuth();
  const [isDeleteVisible, setIsDeleteVisible] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await logout();
    } finally {
      setIsLoggingOut(false);
    }
  };

  // Berhasil (penangguhan dicabut): AuthContext membuka kembali aplikasi, layar ini hilang dengan sendirinya.
  const handleCheck = async () => {
    if (isChecking) return;
    setIsChecking(true);
    setStatusMessage(null);
    try {
      const restored = await recheckAccountStatus();
      if (!restored) setStatusMessage(accountSuspendedCopy.stillSuspended);
    } catch {
      setStatusMessage(accountSuspendedCopy.checkFailed);
    } finally {
      setIsChecking(false);
    }
  };

  const handleAppeal = () => {
    const subject = encodeURIComponent(accountSuspendedCopy.appealSubject(user?.username));
    Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${subject}`).catch(() => {});
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <AccountSuspendedView
        username={user?.username}
        supportEmail={SUPPORT_EMAIL}
        isLoggingOut={isLoggingOut}
        isChecking={isChecking}
        statusMessage={statusMessage}
        onCheck={handleCheck}
        onAppeal={handleAppeal}
        onLogout={handleLogout}
        onDelete={() => setIsDeleteVisible(true)}
      />

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
});
