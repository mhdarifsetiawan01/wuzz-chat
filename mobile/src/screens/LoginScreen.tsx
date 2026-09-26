/**
 * WuzzChat Mobile UI - LoginScreen
 * Elegant WhatsApp-Grade Dark Mode Login Screen.
 */

import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Input } from '../components';
import { useAuth } from '../context';
import { colors, radius, spacing, typography } from '../theme';

interface LoginScreenProps {
  onNavigateToRegister: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onNavigateToRegister }) => {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
        Alert.alert(
          'Batas Perangkat Tercapai',
          'Akun Anda saat ini sudah aktif di perangkat lain. Apakah Anda ingin menimpa sesi perangkat lama dan melanjutkan masuk di HP ini?',
          [
            {
              text: 'Batal',
              style: 'cancel',
            },
            {
              text: 'Ganti Sesi & Masuk',
              onPress: async () => {
                setIsLoading(true);
                setErrorMessage(null);
                try {
                  await login({
                    username: username.trim().toLowerCase(),
                    password,
                    confirm_override: true,
                  });
                } catch (overrideErr: any) {
                  setErrorMessage(
                    overrideErr?.detail ||
                    overrideErr?.message ||
                    'Gagal menimpa sesi perangkat lama. Silakan coba lagi.'
                  );
                } finally {
                  setIsLoading(false);
                }
              },
            },
          ]
        );
        return;
      }

      setErrorMessage(err?.detail || err?.message || 'Login gagal. Periksa username dan password Anda.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Brand Header */}
          <View style={styles.header}>
            <View style={styles.logoBadge}>
              <Text style={styles.logoText}>⚡</Text>
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

            <View style={styles.footer}>
              <Text style={styles.footerText}>Belum memiliki akun?</Text>
              <TouchableOpacity onPress={onNavigateToRegister} activeOpacity={0.7}>
                <Text style={styles.registerLink}>Daftar Sekarang</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
    backgroundColor: colors.tintAccent10,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  logoText: {
    fontSize: 32,
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
