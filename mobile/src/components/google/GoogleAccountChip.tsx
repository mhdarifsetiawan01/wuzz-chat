/** Pil kecil berisi logo Google + email akun yang dipilih, supaya pengguna yakin akun mana yang sedang diproses. */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../../theme';
import { GOOGLE_UI } from './googleUi';

interface GoogleAccountChipProps {
  email?: string;
}

export const GoogleAccountChip: React.FC<GoogleAccountChipProps> = ({ email }) => {
  if (!email) return null;
  return (
    <View style={styles.chip} accessibilityLabel={`Akun Google ${email}`}>
      <View style={styles.logoWrap}>{GOOGLE_UI.renderLogo(16)}</View>
      <Text style={styles.email} numberOfLines={1} ellipsizeMode="middle">
        {email}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    maxWidth: '100%',
    flexShrink: 1,
    gap: spacing.sm,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    backgroundColor: colors.bgInput,
  },
  logoWrap: {
    flexShrink: 0,
  },
  email: {
    ...typography.caption,
    flexShrink: 1,
    color: colors.textPrimary,
  },
});
