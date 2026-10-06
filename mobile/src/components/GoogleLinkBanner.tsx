/**
 * WuzzChat GoogleLinkBannerLayout
 * Banner satu baris di atas layar untuk akun yang belum menautkan akun Google sebelum batas waktu yang ditetapkan server.
 * Tingkat urgensi dan teks diturunkan dari sisa waktu (utils/googleLinkDeadline). Tiga tingkat pertama bisa ditutup
 * sementara (disimpan per akun); dua terakhir (mendesak, sudah lewat) tidak bisa ditutup. Tidak memblokir apa pun.
 * Pola layout sama dengan UpdateBannerLayout: banner mendorong konten ke bawah dan mengambil alih inset status bar.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, typography } from '../theme';
import { Icon } from './Icon';
import { useAuth, useCall } from '../context';
import { useLinkGoogle } from '../hooks/useLinkGoogle';
import { isGoogleSignInAvailable } from '../services/googleAuth';
import { secureStorage } from '../services/secureStorage';
import {
  LinkUrgency,
  getLinkDeadlineState,
  isSnoozed,
  parseSnoozeUntil,
  snoozeStorageKey,
} from '../utils/googleLinkDeadline';

export interface GoogleLinkBannerLayoutProps {
  enabled: boolean;
  children: React.ReactNode;
}

const TONE: Record<Exclude<LinkUrgency, 'none'>, { bg: string; border: string }> = {
  info: { bg: colors.tintAccent20, border: colors.borderDefault },
  warning: { bg: colors.tintWarning10, border: colors.colorWarning },
  urgent: { bg: colors.tintError10, border: colors.colorError },
  expired: { bg: colors.tintError20, border: colors.colorError },
};

export const GoogleLinkBannerLayout: React.FC<GoogleLinkBannerLayoutProps> = ({ enabled, children }) => {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { activeCall } = useCall();
  const { link, isLinking } = useLinkGoogle();
  const [now, setNow] = useState(() => new Date());
  const [snoozeUntil, setSnoozeUntil] = useState<number | null>(null);

  // Waktu disegarkan saat aplikasi kembali ke foreground supaya hitung mundur tidak basi.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setNow(new Date());
    });
    return () => sub.remove();
  }, []);

  // Muat penunda milik akun ini.
  const userId = user?.id;
  useEffect(() => {
    setSnoozeUntil(null);
    if (!userId) return;
    let cancelled = false;
    secureStorage
      .getItem(snoozeStorageKey(userId))
      .then((raw) => {
        if (!cancelled) setSnoozeUntil(parseSnoozeUntil(raw));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const state = useMemo(
    () => getLinkDeadlineState(user?.google_link_required_by, user?.google_linked, now),
    [user?.google_link_required_by, user?.google_linked, now]
  );

  const inCall = !!activeCall && activeCall.status !== 'idle' && activeCall.status !== 'ended';
  // Tombol Google hanya berfungsi bila build ini memuat modul Google dan client ID terisi: jangan umumkan yang tak bisa dilakukan.
  const visible =
    enabled && state.urgency !== 'none' && isGoogleSignInAvailable() && !inCall && !(state.dismissible && isSnoozed(snoozeUntil, now));

  const handleDismiss = useCallback(() => {
    if (!userId || !state.dismissible) return;
    const until = Date.now() + state.snoozeMs;
    setSnoozeUntil(until);
    secureStorage.setItem(snoozeStorageKey(userId), String(until)).catch(() => {});
  }, [userId, state.dismissible, state.snoozeMs]);

  const tone = state.urgency === 'none' ? TONE.info : TONE[state.urgency];

  return (
    <View style={styles.root}>
      {visible && (
        <View style={[styles.banner, { paddingTop: insets.top + spacing.xs, backgroundColor: tone.bg, borderBottomColor: tone.border }]}>
          <Text style={styles.text} numberOfLines={2}>
            {state.message}
          </Text>
          <TouchableOpacity onPress={link} disabled={isLinking} hitSlop={8} accessibilityRole="button">
            <Text style={styles.action}>{isLinking ? 'Menghubungkan…' : 'Hubungkan'}</Text>
          </TouchableOpacity>
          {state.dismissible && (
            <TouchableOpacity onPress={handleDismiss} hitSlop={10} accessibilityRole="button" accessibilityLabel="Tutup">
              <Icon name="close" size={14} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
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
    borderBottomWidth: StyleSheet.hairlineWidth,
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
});
