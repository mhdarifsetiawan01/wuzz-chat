/**
 * WuzzChat Mobile UI - Input Component
 * Elegant text input with focus ring, label, error state, and clear accessibility.
 */

import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { colors, radius, spacing, typography } from '../theme';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string | null;
  containerStyle?: ViewStyle;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  containerStyle,
  onFocus,
  onBlur,
  ...rest
}) => {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <View style={[styles.container, containerStyle]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View
        style={[
          styles.inputWrapper,
          isFocused && styles.inputFocused,
          !!error && styles.inputError,
        ]}
      >
        <TextInput
          placeholderTextColor={colors.textMuted}
          selectionColor={colors.accentPrimary}
          style={styles.input}
          onFocus={(e) => {
            setIsFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setIsFocused(false);
            onBlur?.(e);
          }}
          {...rest}
        />
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.lg,
  },
  label: {
    ...typography.captionBold,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  inputWrapper: {
    height: 50,
    backgroundColor: colors.bgInput,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
  },
  inputFocused: {
    borderColor: colors.borderFocus,
    backgroundColor: colors.bgInputFocused,
  },
  inputError: {
    borderColor: colors.colorError,
  },
  input: {
    ...typography.input,
    color: colors.textPrimary,
    height: '100%',
  },
  errorText: {
    ...typography.caption,
    color: colors.colorError,
    marginTop: spacing.xs,
  },
});
