/**
 * CollapsibleText
 * Teks panjang yang diringkas ke beberapa baris dengan tombol "Selengkapnya" / "Sembunyikan".
 * Jumlah baris asli diukur lewat <Text> tersembunyi tanpa batas baris, sehingga tombol hanya
 * muncul bila teks memang terpotong (tidak bergantung pada tebakan jumlah karakter) dan
 * baris baru (\n) ikut terhitung.
 */

import React, { useState } from 'react';
import { StyleProp, StyleSheet, Text, TextStyle, TouchableOpacity, View } from 'react-native';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

export interface CollapsibleTextProps {
  text: string;
  style?: StyleProp<TextStyle>;
  /** Jumlah baris saat diringkas (default 3). */
  collapsedLines?: number;
}

export const CollapsibleText: React.FC<CollapsibleTextProps> = ({
  text,
  style,
  collapsedLines = 3,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [totalLines, setTotalLines] = useState(0);
  const isTruncatable = totalLines > collapsedLines;

  return (
    <View style={styles.container}>
      {/* Pengukur: teks lengkap, tak terlihat, tidak ikut aksesibilitas */}
      <Text
        style={[style, styles.measurer]}
        onTextLayout={(e) => setTotalLines(e.nativeEvent.lines.length)}
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
      >
        {text}
      </Text>

      <Text style={style} numberOfLines={expanded ? undefined : collapsedLines}>
        {text}
      </Text>

      {isTruncatable ? (
        <TouchableOpacity
          onPress={() => setExpanded((v) => !v)}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel={expanded ? 'Sembunyikan deskripsi' : 'Tampilkan deskripsi lengkap'}
        >
          <Text style={styles.toggleText}>{expanded ? 'Sembunyikan' : 'Selengkapnya'}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  measurer: {
    position: 'absolute',
    left: 0,
    right: 0,
    opacity: 0,
  },
  toggleText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.accentPrimary,
    marginTop: spacing.xs,
  },
});
