/**
 * WuzzChat Mobile - SystemMessageRow
 * Pesan sistem di linimasa (mis. "Bob bergabung ke grup."): pil kecil di tengah, tanpa aksi pesan.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ColorTokens, useThemedStyles } from '../theme';
import { spacing } from '../theme/spacing';

interface SystemMessageRowProps {
  text: string;
}

export const SystemMessageRow: React.FC<SystemMessageRowProps> = React.memo(({ text }) => {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.row}>
      <View style={styles.pill}>
        <Text style={styles.text}>{text}</Text>
      </View>
    </View>
  );
});

const makeStyles = (colors: ColorTokens) => StyleSheet.create({
  row: {
    alignItems: 'center',
    marginVertical: spacing.xs,
    paddingHorizontal: spacing.xxl,
  },
  // Putih + textSecondary: 4,76:1, sama dengan pil tanggal
  pill: {
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    maxWidth: '100%',
  },
  text: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
