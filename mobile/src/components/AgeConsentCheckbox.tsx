/**
 * Kotak centang pernyataan usia (13+) dan persetujuan Syarat Layanan + Kebijakan Privasi pada pembuatan akun.
 * Aturan validasinya ada di utils/ageGate.ts; komponen ini hanya tampilan.
 */

import React from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LEGAL_URLS } from '../api/config';
import { colors, radius, spacing, typography } from '../theme';
import { MIN_AGE_YEARS } from '../utils/ageGate';
import { Icon } from './Icon';

interface AgeConsentCheckboxProps {
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
  hasError?: boolean;
}

const open = (url: string) => Linking.openURL(url).catch(() => {});

export const AgeConsentCheckbox: React.FC<AgeConsentCheckboxProps> = ({ checked, onToggle, disabled = false, hasError = false }) => (
  <View style={styles.row}>
    <TouchableOpacity
      onPress={onToggle}
      disabled={disabled}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      activeOpacity={0.7}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      accessibilityLabel={`Saya berusia ${MIN_AGE_YEARS} tahun atau lebih`}
      style={[styles.box, checked && styles.boxChecked, hasError && !checked && styles.boxError]}
    >
      {checked && <Icon name="check" size={16} color={colors.textInverse} />}
    </TouchableOpacity>
    <Text style={styles.text}>
      Saya berusia {MIN_AGE_YEARS} tahun atau lebih, dan menyetujui{' '}
      <Text style={styles.link} onPress={() => open(LEGAL_URLS.terms)} accessibilityRole="link">
        Syarat Layanan
      </Text>{' '}
      dan{' '}
      <Text style={styles.link} onPress={() => open(LEGAL_URLS.privacy)} accessibilityRole="link">
        Kebijakan Privasi
      </Text>
      .
    </Text>
  </View>
);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, marginTop: spacing.sm, marginBottom: spacing.md },
  box: {
    width: 24,
    height: 24,
    marginTop: 1,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.borderDefault,
    backgroundColor: colors.bgInput,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxChecked: { backgroundColor: colors.accentPrimary, borderColor: colors.accentPrimary },
  boxError: { borderColor: colors.colorError },
  text: { ...typography.caption, color: colors.textSecondary, flex: 1 },
  link: { color: colors.accentHover, fontWeight: '600' },
});
