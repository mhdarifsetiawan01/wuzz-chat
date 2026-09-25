/**
 * WuzzChat Mobile Theme - Typography
 * Clean, modern scale for mobile screens
 */

import { TextStyle } from 'react-native';
import { colors } from './colors';

export const typography = {
  h1: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: -0.5,
  } as TextStyle,
  h2: {
    fontSize: 22,
    fontWeight: '600',
    color: colors.textPrimary,
    letterSpacing: -0.3,
  } as TextStyle,
  h3: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
  } as TextStyle,
  body: {
    fontSize: 15,
    fontWeight: '400',
    color: colors.textPrimary,
    lineHeight: 22,
  } as TextStyle,
  bodySecondary: {
    fontSize: 14,
    fontWeight: '400',
    color: colors.textSecondary,
    lineHeight: 20,
  } as TextStyle,
  caption: {
    fontSize: 12,
    fontWeight: '400',
    color: colors.textMuted,
    lineHeight: 16,
  } as TextStyle,
  captionBold: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    lineHeight: 16,
  } as TextStyle,
  button: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textOnAccent,
  } as TextStyle,
  input: {
    fontSize: 15,
    fontWeight: '400',
    color: colors.textPrimary,
  } as TextStyle,
} as const;
