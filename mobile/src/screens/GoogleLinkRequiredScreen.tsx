/**
 * WuzzChat Mobile UI - GoogleLinkRequiredScreen
 * Menggantikan seluruh aplikasi untuk akun yang DIBEKUKAN: batas waktu menautkan akun Google sudah lewat. Data tidak
 * dihapus. Tiga jalan keluar: hubungkan Google (akun langsung dibuka kembali), keluar, atau hapus akun (syarat
 * kebijakan Google Play, tidak boleh terblokir walau akun beku).
 */

import React, { useState } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DeleteAccountModal } from '../components';
import { GoogleLinkRequiredView } from '../components/GoogleLinkRequiredView';
import { useAuth } from '../context';
import { useLinkGoogle } from '../hooks/useLinkGoogle';
import { colors } from '../theme';

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
      <GoogleLinkRequiredView
        username={user?.username}
        isLinking={isLinking}
        isLoggingOut={isLoggingOut}
        onLink={link}
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
