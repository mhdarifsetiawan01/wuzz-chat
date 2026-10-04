/**
 * WuzzChat Mobile - DateSeparator
 * Pil tanggal di tengah linimasa ("Hari ini", "Kemarin", nama hari, atau tanggal).
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { formatDayLabel } from '../utils/dayLabel';

interface DateSeparatorProps {
  timestamp: string | number;
}

export const DateSeparator: React.FC<DateSeparatorProps> = React.memo(({ timestamp }) => {
  const label = formatDayLabel(timestamp);
  if (!label) return null;
  return (
    <View style={styles.row} accessibilityRole="header">
      <View style={styles.pill}>
        <Text style={styles.text}>{label}</Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  // Putih + teks textSecondary: 4,76:1 (textSecondary di atas bgInput hanya ±4,2:1)
  pill: {
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
});
