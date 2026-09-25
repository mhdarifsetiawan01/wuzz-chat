/**
 * WuzzChat Mobile UI - VerifiedBadge Component
 * Premium Rosette Verified Badge (Centang Biru / Cyan Neon)
 * Matches WuzzChat Web design standard for verified accounts & identities.
 */

import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { colors, radius, typography } from '../theme';

export interface VerifiedBadgeProps {
  size?: number;
  showLabel?: boolean;
  label?: string;
  style?: ViewStyle;
}

export const VerifiedBadge: React.FC<VerifiedBadgeProps> = ({
  size = 16,
  showLabel = false,
  label = 'Terverifikasi',
  style,
}) => {
  const iconSize = Math.max(9, Math.floor(size * 0.65));

  return (
    <View style={[styles.container, style]}>
      <View
        style={[
          styles.badge,
          {
            width: size,
            height: size,
            borderRadius: radius.full,
          },
        ]}
      >
        <Text
          style={[
            styles.checkmark,
            {
              fontSize: iconSize,
              lineHeight: iconSize + 1,
            },
          ]}
        >
          ✓
        </Text>
      </View>
      {showLabel && <Text style={styles.label}>{label}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  badge: {
    backgroundColor: '#00b4d8', // Electric Cyan / Azure Blue
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#00b4d8',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.45,
    shadowRadius: 3,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#90e0ef',
  },
  checkmark: {
    color: '#ffffff',
    fontWeight: '900',
    textAlign: 'center',
    includeFontPadding: false,
  },
  label: {
    ...typography.caption,
    color: colors.colorCyanNeon,
    fontWeight: '600',
  },
});
