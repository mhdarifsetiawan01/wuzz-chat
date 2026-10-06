/**
 * Kartu pilihan: ikon, judul, deskripsi, dan panah. Dipakai untuk memilih satu dari beberapa jalur
 * (mis. "Buat akun baru" atau "Saya sudah punya akun"). Area sentuh seluruh kartu (jauh di atas 44 dp).
 */

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, radius, spacing, typography } from '../theme';
import { Icon } from './Icon';
import type { IconName } from './icons/registry';

interface OptionCardProps {
  icon: IconName;
  title: string;
  description: string;
  onPress: () => void;
  disabled?: boolean;
}

export const OptionCard: React.FC<OptionCardProps> = ({ icon, title, description, onPress, disabled = false }) => (
  <TouchableOpacity
    activeOpacity={0.75}
    onPress={onPress}
    disabled={disabled}
    accessibilityRole="button"
    accessibilityLabel={`${title}. ${description}`}
    style={[styles.card, disabled && styles.disabled]}
  >
    <View style={styles.iconCircle}>
      <Icon name={icon} size={22} color={colors.accentHover} />
    </View>
    <View style={styles.texts}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
    </View>
    <Icon name="forward" size={16} color={colors.textMuted} />
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    backgroundColor: colors.bgSurface,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.tintAccent20,
  },
  texts: { flex: 1 },
  title: { ...typography.body, fontWeight: '600', color: colors.textPrimary },
  description: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  disabled: { opacity: 0.5 },
});
