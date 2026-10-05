/**
 * WuzzChat AppErrorBoundary
 * Menangkap error render React agar aplikasi tidak menutup tiba-tiba tanpa penjelasan, mencatatnya ke Crashlytics
 * (tanpa data pribadi), dan memberi tombol "Coba Lagi".
 */

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, radius, spacing, typography } from '../theme';
import { recordNonFatal } from '../services/crashReporting';

interface State {
  hasError: boolean;
}

export class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error): void {
    recordNonFatal(error, 'error_boundary');
  }

  private reset = () => this.setState({ hasError: false });

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Terjadi kesalahan</Text>
        <Text style={styles.message}>
          Aplikasi mengalami masalah tak terduga. Pesan Anda aman. Laporan teknis dikirim otomatis tanpa isi pesan.
        </Text>
        <TouchableOpacity style={styles.button} onPress={this.reset} accessibilityRole="button">
          <Text style={styles.buttonText}>Coba Lagi</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgBase,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
  },
  title: { ...typography.h2, color: colors.textPrimary, marginBottom: spacing.sm, textAlign: 'center' },
  message: { ...typography.bodySecondary, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.xl },
  button: {
    backgroundColor: colors.accentPrimary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xxl,
    borderRadius: radius.lg,
  },
  buttonText: { color: colors.textOnAccent, fontSize: 15, fontWeight: '600' },
});
