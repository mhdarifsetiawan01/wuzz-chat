/**
 * WuzzChat Mobile UI - GoogleOnboardingScreen
 * Layar lanjutan setelah memilih akun Google yang BELUM tertaut ke akun Wuzz mana pun.
 * Pengguna memilih: buat akun baru (username saja, tanpa password) atau tautkan ke akun lama (username + password).
 * Tidak ada akun yang dibuat sampai pengguna mengisi data sendiri.
 */

import React, { useCallback, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActiveDeviceItem } from '../api/types';
import { Button, DeviceLimitModal, Input } from '../components';
import { useAuth } from '../context';
import { colors, radius, spacing, typography } from '../theme';
import {
  GoogleFlowError,
  googleErrorMessage,
  isDeviceLimitError,
  isGoogleTokenError,
  isLinkTokenError,
} from '../utils/googleErrors';

/** Bukti verifikasi Google yang dibawa dari layar login. idToken dipakai ulang untuk memperbarui linkToken yang kedaluwarsa. */
export interface GooglePending {
  linkToken: string;
  idToken: string;
  email?: string;
}

interface GoogleOnboardingScreenProps {
  pending: GooglePending;
  /** Kembali ke layar login. message (opsional) ditampilkan di sana. */
  onCancel: (message?: string) => void;
}

type Step = 'choose' | 'new' | 'link';

export const GoogleOnboardingScreen: React.FC<GoogleOnboardingScreenProps> = ({ pending, onCancel }) => {
  const { registerWithGoogle, linkGoogleToExistingAccount, loginWithGoogle } = useAuth();
  const [step, setStep] = useState<Step>('choose');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // link_token hanya berlaku 5 menit: simpan yang terbaru di ref supaya percobaan ulang memakai token segar.
  const linkTokenRef = useRef(pending.linkToken);

  const [deviceLimitOpen, setDeviceLimitOpen] = useState(false);
  const [activeDevices, setActiveDevices] = useState<ActiveDeviceItem[]>([]);
  const [isOverriding, setIsOverriding] = useState(false);
  const [deviceLimitError, setDeviceLimitError] = useState<string | null>(null);

  const clearError = () => {
    if (errorMessage) setErrorMessage(null);
  };

  /**
   * Menjalankan aksi dengan link_token terkini. Bila server menolak karena token berakhir, token diperbarui diam-diam
   * memakai ID token Google yang masih berlaku (tanpa pemilih akun), lalu aksi diulang SEKALI.
   * Mengembalikan false bila token tak bisa diperbarui (pengguna harus mengulang dari awal).
   */
  const runWithFreshLink = useCallback(
    async (action: (linkToken: string) => Promise<void>): Promise<void> => {
      try {
        await action(linkTokenRef.current);
        return;
      } catch (err) {
        if (!isLinkTokenError(err as GoogleFlowError)) throw err;
      }
      const refreshed = await loginWithGoogle({ idToken: pending.idToken });
      // Sudah tertaut (mis. akun terbentuk oleh percobaan sebelumnya): sesi sudah dimulai, tidak ada yang perlu diulang.
      if (refreshed?.status === 'signed_in') return;
      if (refreshed?.status !== 'not_linked') {
        throw Object.assign(new Error('link refresh'), { code: 'LINK_TOKEN_INVALID' });
      }
      linkTokenRef.current = refreshed.linkToken;
      await action(linkTokenRef.current);
    },
    [loginWithGoogle, pending.idToken]
  );

  const fail = (err: unknown, fallback: string) => {
    const e = err as GoogleFlowError;
    if (isLinkTokenError(e) || isGoogleTokenError(e)) {
      onCancel(googleErrorMessage(e, fallback));
      return;
    }
    setErrorMessage(googleErrorMessage(e, fallback));
  };

  const handleCreate = async () => {
    const cleanUsername = username.trim().toLowerCase();
    if (cleanUsername.length < 3) {
      setErrorMessage('Username minimal 3 karakter.');
      return;
    }
    setErrorMessage(null);
    setIsLoading(true);
    try {
      await runWithFreshLink((linkToken) =>
        registerWithGoogle({
          linkToken,
          username: cleanUsername,
          displayName: displayName.trim() || undefined,
        })
      );
    } catch (err) {
      fail(err, 'Pendaftaran gagal. Silakan coba lagi.');
      setIsLoading(false);
    }
    // Sukses: AuthProvider mengganti layar, komponen ini ikut dilepas.
  };

  const attemptLink = async (extra?: { confirm_override?: boolean; kick_device_id?: string }) => {
    await runWithFreshLink((linkToken) =>
      linkGoogleToExistingAccount({
        linkToken,
        username: username.trim().toLowerCase(),
        password,
        ...extra,
      })
    );
  };

  const handleLink = async () => {
    if (!username.trim()) {
      setErrorMessage('Harap masukkan username akun Wuzz Anda.');
      return;
    }
    if (!password) {
      setErrorMessage('Harap masukkan password akun Wuzz Anda.');
      return;
    }
    setErrorMessage(null);
    setIsLoading(true);
    try {
      await attemptLink();
    } catch (err) {
      const e = err as GoogleFlowError & { active_devices?: ActiveDeviceItem[]; data?: { active_devices?: ActiveDeviceItem[] } };
      if (isDeviceLimitError(e)) {
        setActiveDevices(e.active_devices || e.data?.active_devices || []);
        setDeviceLimitError(null);
        setDeviceLimitOpen(true);
      } else {
        fail(err, 'Gagal menautkan akun. Periksa username dan password Anda.');
      }
      setIsLoading(false);
    }
  };

  const handleConfirmKick = async (kickDeviceId: string) => {
    setIsOverriding(true);
    setDeviceLimitError(null);
    try {
      await attemptLink({ confirm_override: true, kick_device_id: kickDeviceId });
      setDeviceLimitOpen(false);
    } catch (err) {
      setDeviceLimitError(googleErrorMessage(err as GoogleFlowError, 'Gagal mengeluarkan perangkat lama. Silakan coba lagi.'));
    } finally {
      setIsOverriding(false);
    }
  };

  const goBack = () => {
    if (isLoading) return;
    setErrorMessage(null);
    if (step === 'choose') onCancel();
    else setStep('choose');
  };

  const renderChoose = () => (
    <>
      <Text style={styles.cardTitle}>Akun Google belum terhubung</Text>
      <Text style={styles.cardText}>
        {pending.email ? `${pending.email} belum terhubung ke akun WuzzChat mana pun.` : 'Akun Google ini belum terhubung ke akun WuzzChat mana pun.'}{' '}
        Pilih salah satu:
      </Text>
      <Button title="Buat akun baru" onPress={() => setStep('new')} style={styles.stackButton} />
      <Button
        title="Saya sudah punya akun WuzzChat"
        variant="secondary"
        onPress={() => setStep('link')}
        style={styles.stackButton}
      />
    </>
  );

  const renderNew = () => (
    <>
      <Text style={styles.cardTitle}>Buat akun baru</Text>
      <Text style={styles.cardText}>
        Anda masuk dengan Google, jadi tidak perlu membuat password. Pilih username yang akan dilihat teman Anda.
      </Text>
      <Input
        label="Username"
        placeholder="pilih_username"
        autoCapitalize="none"
        autoCorrect={false}
        value={username}
        onChangeText={(t) => {
          setUsername(t);
          clearError();
        }}
      />
      <Input
        label="Nama Tampilan (Opsional)"
        placeholder="Contoh: Alice Smith"
        value={displayName}
        onChangeText={(t) => {
          setDisplayName(t);
          clearError();
        }}
      />
      <Button title="Buat Akun" isLoading={isLoading} onPress={handleCreate} style={styles.stackButton} />
    </>
  );

  const renderLink = () => (
    <>
      <Text style={styles.cardTitle}>Tautkan ke akun lama</Text>
      <Text style={styles.cardText}>
        Masukkan username dan password akun WuzzChat Anda. Setelah itu Anda bisa masuk dengan Google.
      </Text>
      <Input
        label="Username"
        placeholder="Masukkan username"
        autoCapitalize="none"
        autoCorrect={false}
        value={username}
        onChangeText={(t) => {
          setUsername(t);
          clearError();
        }}
      />
      <Input
        label="Password"
        placeholder="Masukkan password"
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        value={password}
        onChangeText={(t) => {
          setPassword(t);
          clearError();
        }}
      />
      <Button title="Tautkan & Masuk" isLoading={isLoading} onPress={handleLink} style={styles.stackButton} />
    </>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboardView}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.formCard}>
            {errorMessage && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorBannerText}>{errorMessage}</Text>
              </View>
            )}
            {step === 'choose' && renderChoose()}
            {step === 'new' && renderNew()}
            {step === 'link' && renderLink()}

            <TouchableOpacity onPress={goBack} activeOpacity={0.7} style={styles.backLink} disabled={isLoading}>
              <Text style={styles.backLinkText}>{step === 'choose' ? 'Batal' : 'Kembali'}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <DeviceLimitModal
        visible={deviceLimitOpen}
        activeDevices={activeDevices}
        isLoading={isOverriding}
        errorMessage={deviceLimitError}
        onClose={() => {
          if (!isOverriding) setDeviceLimitOpen(false);
        }}
        onConfirm={handleConfirmKick}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.bgBase },
  keyboardView: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
  },
  formCard: {
    backgroundColor: colors.bgSurface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    padding: spacing.xxl,
  },
  cardTitle: { ...typography.h2, color: colors.textPrimary, marginBottom: spacing.sm },
  cardText: { ...typography.bodySecondary, color: colors.textSecondary, marginBottom: spacing.lg },
  errorBanner: {
    backgroundColor: colors.tintError10,
    borderWidth: 1,
    borderColor: colors.colorError,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  errorBannerText: { ...typography.caption, color: colors.colorError, fontWeight: '500' },
  stackButton: { marginTop: spacing.sm },
  backLink: { alignSelf: 'center', marginTop: spacing.xl, padding: spacing.sm },
  backLinkText: { ...typography.captionBold, color: colors.accentPrimary },
});
