/**
 * WuzzChat Mobile UI - RegisterScreen
 * Clean WhatsApp-Grade Dark Mode Registration Screen.
 */

import React, { useState } from 'react';
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
import { Button, Input } from '../components';
import { useAuth } from '../context';
import { colors, radius, spacing, typography } from '../theme';

interface RegisterScreenProps {
  onNavigateToLogin: () => void;
}

export const RegisterScreen: React.FC<RegisterScreenProps> = ({ onNavigateToLogin }) => {
  const { register } = useAuth();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleRegister = async () => {
    const cleanUsername = username.trim().toLowerCase();
    const cleanDisplayName = displayName.trim();

    if (!cleanUsername) {
      setErrorMessage('Harap masukkan username.');
      return;
    }
    if (cleanUsername.length < 3) {
      setErrorMessage('Username minimal 3 karakter.');
      return;
    }
    if (!password) {
      setErrorMessage('Harap masukkan password.');
      return;
    }
    if (password.length < 6) {
      setErrorMessage('Password minimal 6 karakter.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage('Konfirmasi password tidak cocok.');
      return;
    }

    setErrorMessage(null);
    setIsLoading(true);

    try {
      await register({
        username: cleanUsername,
        display_name: cleanDisplayName || cleanUsername,
        password,
      });
    } catch (err: any) {
      setErrorMessage(
        err?.detail || err?.message || 'Pendaftaran gagal. Username mungkin sudah digunakan.'
      );
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
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Buat Akun Baru</Text>
            <Text style={styles.subtitle}>
              Bergabung dengan WuzzChat untuk obrolan aman & terenkripsi
            </Text>
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
              placeholder="pilih_username"
              autoCapitalize="none"
              autoCorrect={false}
              value={username}
              onChangeText={(text) => {
                setUsername(text);
                if (errorMessage) setErrorMessage(null);
              }}
            />

            <Input
              label="Nama Tampilan (Opsional)"
              placeholder="Contoh: Alice Smith"
              value={displayName}
              onChangeText={setDisplayName}
            />

            <Input
              label="Password"
              placeholder="Minimal 6 karakter"
              secureTextEntry
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                if (errorMessage) setErrorMessage(null);
              }}
            />

            <Input
              label="Konfirmasi Password"
              placeholder="Ulangi password"
              secureTextEntry
              value={confirmPassword}
              onChangeText={(text) => {
                setConfirmPassword(text);
                if (errorMessage) setErrorMessage(null);
              }}
            />

            <Button
              title="Daftar Akun"
              isLoading={isLoading}
              onPress={handleRegister}
              style={styles.submitButton}
            />

            <View style={styles.footer}>
              <Text style={styles.footerText}>Sudah memiliki akun?</Text>
              <TouchableOpacity onPress={onNavigateToLogin} activeOpacity={0.7}>
                <Text style={styles.loginLink}>Masuk</Text>
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
    marginBottom: spacing.xxl,
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
    paddingHorizontal: spacing.md,
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
  loginLink: {
    ...typography.captionBold,
    color: colors.accentPrimary,
  },
});
