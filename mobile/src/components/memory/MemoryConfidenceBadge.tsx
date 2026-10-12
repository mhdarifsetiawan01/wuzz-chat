/**
 * Lencana tingkat keyakinan AI (HIGH/MEDIUM/LOW) untuk butir memori.
 * Padanan mobile dari frontend/app/chat/memory/ConfidenceBadge.tsx.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { radius, spacing, useThemedStyles, ColorTokens, makeTypography } from '../../theme';
import type { MemoryConfidence } from '../../api/memory';

const LABELS: Record<MemoryConfidence, string> = {
  HIGH: 'Keyakinan Tinggi',
  MEDIUM: 'Keyakinan Sedang',
  LOW: 'Keyakinan Rendah',
};

export const MemoryConfidenceBadge: React.FC<{ level: MemoryConfidence }> = ({ level }) => {
  const styles = useThemedStyles(makeStyles);
  const tone = level === 'HIGH' ? styles.high : level === 'MEDIUM' ? styles.medium : styles.low;
  const textTone =
    level === 'HIGH' ? styles.highText : level === 'MEDIUM' ? styles.mediumText : styles.lowText;
  return (
    <View style={[styles.badge, tone]} accessibilityLabel={LABELS[level]}>
      <Text style={[styles.text, textTone]}>{LABELS[level] ?? LABELS.LOW}</Text>
    </View>
  );
};

const makeStyles = (colors: ColorTokens) => {
  const typography = makeTypography(colors);
  return StyleSheet.create({
    badge: {
      alignSelf: 'flex-start',
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: radius.full,
    },
    text: { ...typography.caption, fontWeight: '600' },
    high: { backgroundColor: colors.tintSuccess10 },
    medium: { backgroundColor: colors.tintWarning10 },
    low: { backgroundColor: colors.tintError10 },
    highText: { color: colors.colorSuccess },
    mediumText: { color: colors.colorWarningText },
    lowText: { color: colors.colorError },
  });
};
