/**
 * WuzzChat GoogleLinkBannerLayout
 * Banner satu baris di atas layar untuk akun yang belum menautkan akun Google sebelum batas waktu yang ditetapkan server.
 * Tingkat urgensi dan teks diturunkan dari sisa waktu (utils/googleLinkDeadline). Tiga tingkat pertama bisa ditutup
 * sementara (disimpan per akun); dua terakhir (mendesak, sudah lewat) tidak bisa ditutup. Tidak memblokir apa pun.
 * Pola layout sama dengan UpdateBannerLayout: banner mendorong konten ke bawah dan mengambil alih inset status bar.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';
import { GoogleLinkBannerView } from './GoogleLinkBannerView';
import { useAuth, useCall } from '../context';
import { useLinkGoogle } from '../hooks/useLinkGoogle';
import { isGoogleSignInAvailable } from '../services/googleAuth';
import { secureStorage } from '../services/secureStorage';
import {
  getLinkDeadlineState,
  isSnoozed,
  parseSnoozeUntil,
  snoozeStorageKey,
} from '../utils/googleLinkDeadline';

export interface GoogleLinkBannerLayoutProps {
  enabled: boolean;
  children: React.ReactNode;
}

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

  return (
    <View style={styles.root}>
      {visible && (
        <GoogleLinkBannerView state={state} topInset={insets.top} isLinking={isLinking} onLink={link} onDismiss={handleDismiss} />
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
});
