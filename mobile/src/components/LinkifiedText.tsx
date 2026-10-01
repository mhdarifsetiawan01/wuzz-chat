/**
 * WuzzChat Mobile - LinkifiedText
 * Teks dengan tautan http/https yang bisa diketuk (dipakai Feed, Mode Baca, Komentar).
 * Tokenisasi di-memo per teks; pembukaan URL lewat safeOpenUrl (hanya http/https).
 */

import React, { useMemo } from 'react';
import { StyleProp, StyleSheet, Text, TextLayoutEventData, TextStyle, NativeSyntheticEvent } from 'react-native';
import { safeOpenUrl, tokenizeLinks } from '../utils/linkUtils';
import { colors } from '../theme/colors';

export interface LinkifiedTextProps {
  text: string;
  style?: StyleProp<TextStyle>;
  linkStyle?: StyleProp<TextStyle>;
  numberOfLines?: number;
  selectable?: boolean;
  onTextLayout?: (e: NativeSyntheticEvent<TextLayoutEventData>) => void;
}

export const LinkifiedText: React.FC<LinkifiedTextProps> = React.memo(
  ({ text, style, linkStyle, numberOfLines, selectable, onTextLayout }) => {
    const tokens = useMemo(() => tokenizeLinks(text), [text]);

    return (
      <Text
        style={style}
        numberOfLines={numberOfLines}
        ellipsizeMode="tail"
        selectable={selectable}
        onTextLayout={onTextLayout}
      >
        {tokens.map((t, i) =>
          t.url ? (
            <Text
              key={i}
              style={[styles.link, linkStyle]}
              onPress={() => safeOpenUrl(t.url!)}
              accessibilityRole="link"
            >
              {t.text}
            </Text>
          ) : (
            t.text
          )
        )}
      </Text>
    );
  }
);

const styles = StyleSheet.create({
  link: {
    color: colors.accentPrimary,
    textDecorationLine: 'underline',
  },
});
