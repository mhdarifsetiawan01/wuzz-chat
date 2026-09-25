/**
 * WuzzChat Mobile UI - Button Component
 * Touch-optimized button with loading spinner and disabled state.
 */

import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableOpacityProps,
  ViewStyle,
} from 'react-native';
import { colors, radius, spacing, typography } from '../theme';

interface ButtonProps extends TouchableOpacityProps {
  title: string;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  isLoading?: boolean;
  style?: ViewStyle;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  variant = 'primary',
  isLoading = false,
  disabled,
  style,
  ...rest
}) => {
  const getBackgroundColor = () => {
    if (disabled || isLoading) {
      return colors.bgElevated;
    }
    switch (variant) {
      case 'primary':
        return colors.accentPrimary;
      case 'secondary':
        return colors.bgSurface;
      case 'danger':
        return colors.colorDanger;
      case 'ghost':
        return 'transparent';
      default:
        return colors.accentPrimary;
    }
  };

  const getTextColor = () => {
    if (disabled) {
      return colors.textMuted;
    }
    if (variant === 'ghost') {
      return colors.accentPrimary;
    }
    return colors.textOnAccent;
  };

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      disabled={disabled || isLoading}
      style={[
        styles.base,
        { backgroundColor: getBackgroundColor() },
        variant === 'secondary' && styles.secondaryBorder,
        style,
      ]}
      {...rest}
    >
      {isLoading ? (
        <ActivityIndicator color={getTextColor()} size="small" />
      ) : (
        <Text style={[typography.button, { color: getTextColor() }]}>{title}</Text>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  base: {
    height: 50,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    flexDirection: 'row',
  },
  secondaryBorder: {
    borderWidth: 1,
    borderColor: colors.borderDefault,
  },
});
