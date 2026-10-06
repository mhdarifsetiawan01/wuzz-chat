/**
 * WuzzChat Mobile UI - GoogleOnboardingScreen
 * Layar lanjutan setelah memilih akun Google yang BELUM tertaut ke akun Wuzz mana pun.
 * Pengguna memilih: buat akun baru (username saja, tanpa password) atau tautkan ke akun lama (username + password).
 * Tidak ada akun yang dibuat sampai pengguna mengisi data sendiri.
 */

import React, { useCallback, useRef, useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActiveDeviceItem } from '../api/types';
import { DeviceLimitModal } from '../components';
import { useAuth } from '../context';
import { SUPPORT_EMAIL } from '../api/config';
import { colors } from '../theme';
import { getUsernameHint } from '../utils/usernameRules';
import { GoogleOnboardingView } from './googleOnboarding/GoogleOnboardingView';
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

  const handleSelectStep = (next: Exclude<Step, 'choose'>) => {
    setErrorMessage(null);
    setStep(next);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboardView}>
        <GoogleOnboardingView
          step={step}
          email={pending.email}
          username={username}
          displayName={displayName}
          password={password}
          usernameHint={getUsernameHint(username)}
          errorMessage={errorMessage}
          isLoading={isLoading}
          onChangeUsername={(t) => {
            setUsername(t);
            clearError();
          }}
          onChangeDisplayName={(t) => {
            setDisplayName(t);
            clearError();
          }}
          onChangePassword={(t) => {
            setPassword(t);
            clearError();
          }}
          onSelectStep={handleSelectStep}
          onSubmitNew={handleCreate}
          onSubmitLink={handleLink}
          onBack={goBack}
          onOpenSupport={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`).catch(() => {})}
        />
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
});
