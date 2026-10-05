/**
 * WuzzChat Mobile UI - LoginScreen
 * Elegant WhatsApp-Grade Dark Mode Login Screen.
 */

import React, { useRef, useState } from 'react';
import {
  Image,
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
import { isGoogleSignInAvailable, GoogleAuthError } from '../services/googleAuth';
import { GoogleFlowError, googleErrorMessage, isDeviceLimitError } from '../utils/googleErrors';
import type { GooglePending } from './GoogleOnboardingScreen';

interface LoginScreenProps {
  onNavigateToRegister: () => void;
  /** Akun Google valid tetapi belum tertaut: lanjut ke layar pilihan daftar/tautkan. */
  onGoogleNotLinked: (pending: GooglePending) => void;
  /** Pesan dari layar sebelumnya (mis. sesi verifikasi Google berakhir). */
  initialMessage?: string | null;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onNavigateToRegister, onGoogleNotLinked, initialMessage }) => {
  const { login, loginWithGoogle } = useAuth();
  const googleAvailable = isGoogleSignInAvailable();
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  // ID token Google dipertahankan untuk percobaan ulang konfirmasi ganti perangkat (tanpa pemilih akun kedua).
  const googleIdTokenRef = useRef<string | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(initialMessage ?? null);

  // Device limit override state
  const [isDeviceLimitModalOpen, setIsDeviceLimitModalOpen] = useState(false);
  const [activeDevices, setActiveDevices] = useState<ActiveDeviceItem[]>([]);
  const [isOverriding, setIsOverriding] = useState(false);
  const [deviceLimitError, setDeviceLimitError] = useState<string | null>(null);

  const handleLogin = async () => {
    if (!username.trim()) {
      setErrorMessage('Harap masukkan username Anda.');
      return;
    }
    if (!password) {
      setErrorMessage('Harap masukkan password Anda.');
      return;
    }

    setErrorMessage(null);
    setIsLoading(true);

    try {
      await login({
        username: username.trim().toLowerCase(),
        password,
      });
    } catch (err: any) {
      if (err?.code === 'DEVICE_LIMIT_REACHED' || err?.status === 409) {
        const devices: ActiveDeviceItem[] =
          err?.active_devices || err?.data?.active_devices || [];
        setActiveDevices(devices);
        setDeviceLimitError(null);
        setIsDeviceLimitModalOpen(true);
        return;
      }

      setErrorMessage(err?.detail || err?.message || 'Login gagal. Periksa username dan password Anda.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogle = async () => {
    if (isGoogleLoading || isLoading) return;
    setErrorMessage(null);
    setIsGoogleLoading(true);
    googleIdTokenRef.current = null;
    try {
      const outcome = await loginWithGoogle();
      if (!outcome) return; // pengguna menutup pemilih akun
      googleIdTokenRef.current = outcome.idToken;
      if (outcome.status === 'not_linked') {
        onGoogleNotLinked({ linkToken: outcome.linkToken, idToken: outcome.idToken, email: outcome.email });
      }
      // signed_in: AuthProvider mengganti layar.
    } catch (err: any) {
      if (isDeviceLimitError(err)) {
        setActiveDevices(err?.active_devices || err?.data?.active_devices || []);
        setDeviceLimitError(null);
        setIsDeviceLimitModalOpen(true);
        return;
      }
      const message =
        err instanceof GoogleAuthError ? err.message : googleErrorMessage(err as GoogleFlowError, 'Login dengan Google gagal. Silakan coba lagi.');
      setErrorMessage(message);
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleConfirmKickDevice = async (kickDeviceId: string) => {
    setIsOverriding(true);
    setDeviceLimitError(null);
    try {
      if (googleIdTokenRef.current) {
        // Konflik datang dari login Google: ulangi dengan ID token yang sama.
        await loginWithGoogle({
          idToken: googleIdTokenRef.current,
          confirm_override: true,
          kick_device_id: kickDeviceId,
        });
      } else {
        await login({
          username: username.trim().toLowerCase(),
          password,
          confirm_override: true,
          kick_device_id: kickDeviceId,
        });
      }
      setIsDeviceLimitModalOpen(false);
    } catch (overrideErr: any) {
      setDeviceLimitError(
        overrideErr?.detail ||
          overrideErr?.message ||
          'Gagal mengeluarkan perangkat lama. Silakan coba lagi.'
      );
    } finally {
      setIsOverriding(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Brand Header */}
          <View style={styles.header}>
            <View style={styles.logoBadge}>
              <Image source={require('../../assets/icon.png')} style={styles.logoImage} />
            </View>
            <Text style={styles.title}>WuzzChat</Text>
            <Text style={styles.subtitle}>End-to-End Encrypted Messenger</Text>
          </View>

          {/* Form Card */}
          <View style={styles.formCard}>
            {errorMessage && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorBannerText}>{errorMessage}</Text>
              </View>
            )}

            {googleAvailable && (
              <>
                <Button
                  title="Lanjutkan dengan Google"
                  variant="secondary"
                  isLoading={isGoogleLoading}
                  disabled={isLoading}
                  onPress={handleGoogle}
                />
                <Text style={styles.googleHint}>Akun baru dibuat lewat Google.</Text>
                <View style={styles.divider}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>atau masuk dengan username</Text>
                  <View style={styles.dividerLine} />
                </View>
              </>
            )}

            <Input
              label="Username"
              placeholder="Masukkan username"
              autoCapitalize="none"
              autoCorrect={false}
              value={username}
              onChangeText={(text) => {
                setUsername(text);
                if (errorMessage) setErrorMessage(null);
              }}
            />

            <Input
              label="Password"
              placeholder="Masukkan password"
              secureTextEntry
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                if (errorMessage) setErrorMessage(null);
              }}
            />

            <Button
              title="Masuk"
              isLoading={isLoading}
              onPress={handleLogin}
              style={styles.submitButton}
            />

            {!googleAvailable && (
              <View style={styles.footer}>
                <Text style={styles.footerText}>Belum memiliki akun?</Text>
                <TouchableOpacity onPress={onNavigateToRegister} activeOpacity={0.7}>
                  <Text style={styles.registerLink}>Daftar Sekarang</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Modal Dialog Batas Perangkat Tercapai */}
      <DeviceLimitModal
        visible={isDeviceLimitModalOpen}
        activeDevices={activeDevices}
        isLoading={isOverriding}
        errorMessage={deviceLimitError}
        onClose={() => {
          if (!isOverriding) {
            setIsDeviceLimitModalOpen(false);
          }
        }}
        onConfirm={handleConfirmKickDevice}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bgBase,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xxxl,
  },
  logoBadge: {
    width: 68,
    height: 68,
    borderRadius: radius.xl,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  title: {
    ...typography.h1,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.bodySecondary,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  formCard: {
    backgroundColor: colors.bgSurface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    padding: spacing.xxl,
  },
  errorBanner: {
    backgroundColor: colors.tintError10,
    borderWidth: 1,
    borderColor: colors.colorError,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  errorBannerText: {
    ...typography.caption,
    color: colors.colorError,
    fontWeight: '500',
  },
  submitButton: {
    marginTop: spacing.sm,
  },
  googleHint: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.lg,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.borderDefault,
  },
  dividerText: {
    ...typography.caption,
    color: colors.textMuted,
    marginHorizontal: spacing.md,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  footerText: {
    ...typography.caption,
    color: colors.textMuted,
    marginRight: spacing.xs,
  },
  registerLink: {
    ...typography.captionBold,
    color: colors.accentPrimary,
  },
});
