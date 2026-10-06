/**
 * Tombol "Lanjutkan dengan Google". Tinggi dan radius sama dengan <Button> aplikasi supaya sejajar di layar yang sama.
 * Penampilan dan logo diatur di googleUi.tsx (default) atau lewat props (per pemakaian).
 */

import React from 'react';
import { ActivityIndicator, StyleProp, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { colors, radius, spacing, typography } from '../../theme';
import { GOOGLE_BRAND } from '../../theme/brand/google';
import { GOOGLE_UI, GoogleButtonAppearance } from './googleUi';

export interface GoogleSignInButtonProps {
  title: string;
  onPress: () => void;
  isLoading?: boolean;
  disabled?: boolean;
  /** Menimpa GOOGLE_UI.buttonAppearance untuk tombol ini saja. */
  appearance?: GoogleButtonAppearance;
  /** Menimpa GOOGLE_UI.renderLogo untuk tombol ini saja. */
  renderLogo?: (size: number) => React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export const GoogleSignInButton: React.FC<GoogleSignInButtonProps> = ({
  title,
  onPress,
  isLoading = false,
  disabled = false,
  appearance = GOOGLE_UI.buttonAppearance,
  renderLogo = GOOGLE_UI.renderLogo,
  style,
}) => {
  const palette =
    appearance === 'brand'
      ? { fill: GOOGLE_BRAND.button.fill, stroke: GOOGLE_BRAND.button.stroke, text: GOOGLE_BRAND.button.text }
      : { fill: colors.bgSurface, stroke: colors.borderDefault, text: colors.textPrimary };

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      disabled={disabled || isLoading}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: disabled || isLoading, busy: isLoading }}
      style={[styles.base, { backgroundColor: palette.fill, borderColor: palette.stroke }, disabled && styles.disabled, style]}
    >
      {isLoading ? (
        <ActivityIndicator color={palette.text} size="small" />
      ) : (
        <View style={styles.row}>
          <View style={styles.logoWrap}>{renderLogo(GOOGLE_BRAND.logoSize)}</View>
          <Text style={[styles.label, { color: palette.text }]} numberOfLines={1}>
            {title}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  base: {
    height: 50,
    borderRadius: radius.md,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  // flexShrink pada baris DAN teks: judul panjang dipotong dengan elipsis, logo tidak ikut terdorong keluar tombol.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: GOOGLE_BRAND.iconGap,
    flexShrink: 1,
    maxWidth: '100%',
  },
  // Logo tidak boleh menyusut walau teks panjang (pedoman merek: logo tidak diubah ukurannya secara tak terduga).
  logoWrap: {
    flexShrink: 0,
  },
  label: {
    ...typography.button,
    fontWeight: '500',
    flexShrink: 1,
  },
  disabled: {
    opacity: 0.5,
  },
});
