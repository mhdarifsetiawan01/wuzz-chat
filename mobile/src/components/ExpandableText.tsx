/**
 * WuzzChat Mobile - ExpandableText
 * Memotong teks panjang pada N baris dengan tombol "Selengkapnya".
 * Performa: teks pendek tidak diukur sama sekali; hasil ukur di-cache per postingan
 * sehingga item FlatList yang di-recycle tidak mengukur ulang.
 */

import React, { useState } from 'react';
import { StyleProp, StyleSheet, Text, TextStyle } from 'react-native';
import { LinkifiedText } from './LinkifiedText';
import { colors } from '../theme/colors';

export interface ExpandableTextProps {
  text: string;
  /** Kunci stabil untuk cache hasil ukur (mis. id postingan) */
  cacheKey: string;
  numberOfLines?: number;
  style?: StyleProp<TextStyle>;
  onExpand: () => void;
}

const MAX_CACHE = 500;
const truncationCache = new Map<string, boolean>();

function cacheKeyFor(key: string, text: string, lines: number): string {
  return `${key}:${lines}:${text.length}`;
}

function mayOverflow(text: string, lines: number): boolean {
  if (text.length > lines * 30) return true; // ~30 karakter per baris di layar umum
  let newlines = 0;
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) newlines++;
  return newlines >= lines;
}

export const ExpandableText: React.FC<ExpandableTextProps> = ({
  text,
  cacheKey,
  numberOfLines = 6,
  style,
  onExpand,
}) => {
  const key = cacheKeyFor(cacheKey, text, numberOfLines);
  const [measured, setMeasured] = useState<boolean | undefined>(() =>
    truncationCache.has(key) ? truncationCache.get(key) : mayOverflow(text, numberOfLines) ? undefined : false
  );

  // undefined = belum diukur: render penuh sekali untuk mengetahui jumlah baris
  if (measured === undefined) {
    return (
      <LinkifiedText
        text={text}
        style={style}
        onTextLayout={(e) => {
          const overflow = e.nativeEvent.lines.length > numberOfLines;
          if (truncationCache.size >= MAX_CACHE) {
            const first = truncationCache.keys().next().value;
            if (first) truncationCache.delete(first);
          }
          truncationCache.set(key, overflow);
          setMeasured(overflow);
        }}
      />
    );
  }

  if (!measured) {
    return <LinkifiedText text={text} style={style} />;
  }

  return (
    <>
      <LinkifiedText text={text} style={style} numberOfLines={numberOfLines} />
      <Text
        style={styles.more}
        onPress={onExpand}
        accessibilityRole="button"
        accessibilityLabel="Baca selengkapnya"
      >
        Selengkapnya
      </Text>
    </>
  );
};

const styles = StyleSheet.create({
  more: {
    color: colors.accentPrimary,
    fontSize: 13.5,
    fontWeight: '700',
    marginTop: -6,
    marginBottom: 12,
  },
});
