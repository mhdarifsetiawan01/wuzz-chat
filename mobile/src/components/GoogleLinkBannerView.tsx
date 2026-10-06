/**
 * Tampilan murni banner pengumuman penautan Google (tanpa konteks/hook) supaya bisa dipratinjau dan diuji secara visual.
 * Logika kapan banner tampil ada di GoogleLinkBannerLayout.
 */

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, spacing, typography } from '../theme';
import { Icon } from './Icon';
import type { LinkDeadlineState, LinkUrgency } from '../utils/googleLinkDeadline';

export interface GoogleLinkBannerViewProps {
  state: LinkDeadlineState;
  /** Inset status bar: banner mengambil alih inset teratas layar. */
  topInset: number;
  isLinking: boolean;
  onLink: () => void;
  onDismiss: () => void;
}

const TONE: Record<Exclude<LinkUrgency, 'none'>, { bg: string; border: string }> = {
  info: { bg: colors.tintAccent20, border: colors.borderDefault },
  warning: { bg: colors.tintWarning10, border: colors.colorWarning },
  urgent: { bg: colors.tintError10, border: colors.colorError },
  expired: { bg: colors.tintError20, border: colors.colorError },
};

export const GoogleLinkBannerView: React.FC<GoogleLinkBannerViewProps> = ({ state, topInset, isLinking, onLink, onDismiss }) => {
  if (state.urgency === 'none') return null;
  const tone = TONE[state.urgency];
  return (
    <View style={[styles.banner, { paddingTop: topInset + spacing.xs, backgroundColor: tone.bg, borderBottomColor: tone.border }]}>
      <Text style={styles.text} numberOfLines={2}>
        {state.message}
      </Text>
      <TouchableOpacity onPress={onLink} disabled={isLinking} hitSlop={8} accessibilityRole="button" accessibilityState={{ busy: isLinking }}>
        <Text style={[styles.action, isLinking && styles.actionBusy]}>Hubungkan</Text>
      </TouchableOpacity>
      {state.dismissible && (
        <TouchableOpacity onPress={onDismiss} hitSlop={10} accessibilityRole="button" accessibilityLabel="Tutup">
          <Icon name="close" size={14} color={colors.textSecondary} />
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
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
  // textPrimary + garis bawah: kontras tinggi di atas semua latar berwarna dan jelas bisa diketuk (accentHover terlalu
  // terang di atas tint biru untuk teks 12 px).
  action: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.textPrimary,
    textDecorationLine: 'underline',
  },
  actionBusy: {
    opacity: 0.5,
  },
});
