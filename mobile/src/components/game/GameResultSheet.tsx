/** Ringkasan setelah puzzle selesai: waktu, streak, dan tombol bagikan (teks tanpa spoiler). */

import React, { useCallback } from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';
import { BottomSheetModal } from '../BottomSheetModal';
import { Button } from '../Button';
import { spacing, useThemedStyles, ColorTokens } from '../../theme';
import { buildShareText, formatDuration } from '../../utils/gameBoard';

export interface GameResultSheetProps {
  visible: boolean;
  onClose: () => void;
  number: number;
  durationMs: number;
  streak: number;
  /** true = waktu tidak masuk papan skor (selesai terlalu cepat untuk manusia). */
  suspicious?: boolean;
}

export const GameResultSheet: React.FC<GameResultSheetProps> = ({
  visible,
  onClose,
  number,
  durationMs,
  streak,
  suspicious = false,
}) => {
  const styles = useThemedStyles(makeStyles);

  const handleShare = useCallback(async () => {
    try {
      await Share.share({ message: buildShareText(number, durationMs, streak) });
    } catch {
      // Pengguna membatalkan atau tidak ada aplikasi tujuan: tidak perlu pesan galat.
    }
  }, [number, durationMs, streak]);

  return (
    <BottomSheetModal visible={visible} onClose={onClose} title="Puzzle selesai!">
      <View style={styles.body}>
        <Text style={styles.label}>{number > 0 ? `Wuzz Grid #${number}` : 'Wuzz Grid'}</Text>
        <Text style={styles.time} accessibilityLabel={`Waktu ${formatDuration(durationMs)}`}>
          {formatDuration(durationMs)}
        </Text>
        {streak > 0 ? <Text style={styles.streak}>Streak {streak} hari berturut-turut</Text> : null}
        {suspicious ? (
          <Text style={styles.note}>Waktu ini tidak masuk papan skor karena terlalu cepat.</Text>
        ) : null}
        <View style={styles.actions}>
          <Button title="Bagikan hasil" onPress={handleShare} />
          <Button title="Tutup" variant="ghost" onPress={onClose} />
        </View>
      </View>
    </BottomSheetModal>
  );
};

const makeStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    body: { alignItems: 'center', paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
    label: { fontSize: 13, color: colors.textSecondary },
    time: { fontSize: 44, fontWeight: '800', color: colors.textPrimary, marginVertical: spacing.sm },
    streak: { fontSize: 15, fontWeight: '600', color: colors.accentPrimary },
    note: { fontSize: 12, color: colors.textSecondary, marginTop: spacing.sm, textAlign: 'center' },
    actions: { alignSelf: 'stretch', marginTop: spacing.lg, gap: spacing.sm },
  });
