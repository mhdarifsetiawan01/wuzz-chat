/**
 * WuzzChat Icon — komponen ikon vektor tunggal.
 *
 * Penggunaan: <Icon name="chat" size={22} color={colors.accentHover} active />
 * Definisi bentuk ada di ./icons/registry.ts.
 */

import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors } from '../theme';
import { ICONS, IconDef, IconName } from './icons/registry';

/** Ketebalan garis standar Wuzz pada kanvas 24×24. */
const STROKE_WIDTH = 1.75;
const STROKE_WIDTH_ACTIVE = 2.1;

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  /** Tampilkan varian aktif (filled bila ada, jika tidak garis lebih tebal). */
  active?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const Icon: React.FC<IconProps> = ({
  name,
  size = 22,
  color = colors.textSecondary,
  active = false,
  style,
}) => {
  const def = ICONS[name] as IconDef;
  const hasFilledVariant = active && !!def.filled && def.filled.length > 0;
  const useFilled = hasFilledVariant || !!def.solid;
  const paths = hasFilledVariant ? def.filled! : def.outline;
  const strokeWidth = active && !useFilled ? STROKE_WIDTH_ACTIVE : STROKE_WIDTH;

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={style}>
      {paths.map((d, i) => (
        <Path
          key={i}
          d={d}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill={useFilled ? color : 'none'}
        />
      ))}
    </Svg>
  );
};
