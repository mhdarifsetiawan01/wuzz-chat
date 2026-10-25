/**
 * Kartu pintu masuk "Puzzle hari ini" di atas Feed. Tidak tampil bila fitur dimatikan server atau data
 * belum pernah berhasil dimuat. Setelah dimainkan, kartu mengecil menjadi ringkasan (waktu + streak).
 */

import React, { useCallback } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { Icon } from '../Icon';
import { useAuth } from '../../context';
import { useGameToday } from '../../hooks/useGameToday';
import { radius, spacing, useTheme, useThemedStyles, ColorTokens } from '../../theme';
import { formatDuration } from '../../utils/gameBoard';

export interface GameEntryCardProps {
  onPress: () => void;
}

export const GameEntryCard: React.FC<GameEntryCardProps> = ({ onPress }) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { user } = useAuth();
  const isFocused = useIsFocused();
  const { status, data, refresh } = useGameToday(user?.id);

  // Segarkan setiap kali tab Feed kembali terlihat (mis. setelah selesai bermain).
  React.useEffect(() => {
    if (isFocused) refresh();
  }, [isFocused, refresh]);

  const handlePress = useCallback(() => onPress(), [onPress]);

  if (status === 'disabled' || !data || !data.enabled || !data.puzzle) return null;

  const attempt = data.attempt;
  const streak = data.streak?.current ?? 0;
  const finished = attempt?.status === 'solved' || attempt?.status === 'suspicious';
  const playing = attempt?.status === 'playing';
  const puzzle = data.puzzle;

  const title = finished
    ? `Wuzz Grid #${data.number} selesai`
    : `Puzzle hari ini · Wuzz Grid #${data.number}`;
  const subtitle = finished
    ? `Waktu ${formatDuration(attempt?.duration_ms ?? 0)}${streak > 0 ? ` · Streak ${streak} hari` : ''}`
    : `Grid ${puzzle.size}×${puzzle.size}${streak > 0 ? ` · Streak ${streak} hari` : ' · Mulai streak Anda'}`;
  const cta = finished ? 'Lihat' : playing ? 'Lanjutkan' : 'Main';

  return (
    <TouchableOpacity
      style={[styles.card, finished && styles.cardDone]}
      onPress={handlePress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${subtitle}. ${cta}`}
    >
      <View style={styles.iconWrap}>
        <Icon name="star" active size={22} color={finished ? colors.successFill : colors.accentPrimary} />
      </View>
      <View style={styles.texts}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <View style={[styles.cta, finished && styles.ctaDone]}>
        <Text style={[styles.ctaText, finished && styles.ctaTextDone]}>{cta}</Text>
      </View>
    </TouchableOpacity>
  );
};

const makeStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: spacing.md,
      padding: spacing.md,
      borderRadius: radius.lg,
      backgroundColor: colors.bgCard,
      borderWidth: 1,
      borderColor: colors.accentPrimary,
    },
    cardDone: { borderColor: colors.borderDefault },
    iconWrap: {
      width: 40,
      height: 40,
      borderRadius: radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bgInput,
      marginRight: spacing.md,
    },
    texts: { flex: 1, marginRight: spacing.sm },
    title: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
    subtitle: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
    cta: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderRadius: radius.full,
      backgroundColor: colors.accentFill,
    },
    ctaDone: { backgroundColor: colors.bgInput },
    ctaText: { fontSize: 13, fontWeight: '700', color: colors.textOnAccent },
    ctaTextDone: { color: colors.textPrimary },
  });
