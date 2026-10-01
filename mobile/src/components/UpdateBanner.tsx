/**
 * WuzzChat UpdateBanner
 * Banner tipis (satu baris) di atas layar saat ada versi aplikasi yang lebih baru.
 * Bisa ditutup (state di memori: muncul lagi saat aplikasi dibuka ulang) dan tidak memblokir apa pun.
 * Layout membungkus konten: banner mendorong konten ke bawah dan mengambil alih inset status bar,
 * sehingga header layar tidak tertimpa maupun mendapat padding ganda.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, typography } from '../theme';
import { AppUpdateInfo, fetchAppUpdateInfo, isUpdateAvailable } from '../services/appUpdate';
import { useCall } from '../context';

export interface UpdateBannerLayoutProps {
  enabled: boolean;
  children: React.ReactNode;
}

export const UpdateBannerLayout: React.FC<UpdateBannerLayoutProps> = ({ enabled, children }) => {
  const insets = useSafeAreaInsets();
  const { activeCall } = useCall();
  const [info, setInfo] = useState<AppUpdateInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);

  // Cek saat login/aplikasi dibuka dan saat kembali ke foreground (di-cache 30 menit di service)
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const check = () => {
      fetchAppUpdateInfo().then((res) => {
        if (!cancelled) setInfo(res);
      });
    };
    check();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [enabled]);

  const inCall = !!activeCall && activeCall.status !== 'idle' && activeCall.status !== 'ended';
  const visible = enabled && !dismissed && !inCall && isUpdateAvailable(info);

  const handleUpdate = useCallback(async () => {
    if (!info?.download_url) return;
    try {
      await Linking.openURL(info.download_url);
    } catch (err) {
      console.warn('[UpdateBanner] Gagal membuka tautan pembaruan:', err);
    }
  }, [info]);

  return (
    <View style={styles.root}>
      {visible && (
        <View style={[styles.banner, { paddingTop: insets.top + spacing.xs }]}>
          <Text style={styles.text} numberOfLines={1}>
            {info?.latest_version ? `Versi ${info.latest_version} tersedia` : 'Pembaruan tersedia'}
          </Text>
          {!!info?.download_url && (
            <TouchableOpacity onPress={handleUpdate} hitSlop={8} accessibilityRole="button">
              <Text style={styles.action}>Perbarui</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={() => setDismissed(true)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Tutup"
          >
            <Text style={styles.close}>✕</Text>
          </TouchableOpacity>
        </View>
      )}
      <SafeAreaInsetsContext.Provider value={visible ? { ...insets, top: 0 } : insets}>
        <View style={styles.root}>{children}</View>
      </SafeAreaInsetsContext.Provider>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xs,
    backgroundColor: colors.tintAccent20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderDefault,
  },
  text: {
    ...typography.caption,
    flex: 1,
    color: colors.textPrimary,
  },
  action: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.accentHover,
  },
  close: {
    ...typography.caption,
    color: colors.textSecondary,
  },
});
