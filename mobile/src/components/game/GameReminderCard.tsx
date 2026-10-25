/**
 * Sakelar pengingat harian Wuzz Grid. Pengingat adalah notifikasi lokal di perangkat ini (lihat services/gameReminder):
 * satu per hari pada jam yang diatur server, berhenti sendiri bila puzzle hari itu sudah selesai.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Linking, StyleSheet, Switch, Text, View } from 'react-native';
import { GameToday, gameApi } from '../../api';
import { useAuth } from '../../context';
import { gameReminder } from '../../services/gameReminder';
import { showAlert } from '../../services/dialog';
import { DEFAULT_REMINDER_TIME, parseReminderTime } from '../../utils/gameReminder';
import { radius, spacing, useTheme, useThemedStyles, ColorTokens } from '../../theme';

export interface GameReminderCardProps {
  today: GameToday;
}

export const GameReminderCard: React.FC<GameReminderCardProps> = ({ today }) => {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const { user } = useAuth();
  const userId = user?.id;
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    gameReminder.isEnabled(userId).then((v) => {
      if (!cancelled) setEnabled(v);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const toggle = useCallback(
    async (next: boolean) => {
      if (!userId || busy) return;
      setBusy(true);
      try {
        if (next) {
          const result = await gameReminder.enable(userId, today);
          if (result === 'denied') {
            showAlert(
              'Izin notifikasi dibutuhkan',
              'Pengingat memakai notifikasi. Aktifkan izin notifikasi untuk WuzzChat di pengaturan HP, lalu nyalakan lagi.',
              [
                { text: 'Nanti', style: 'cancel' },
                { text: 'Buka Pengaturan', onPress: () => Linking.openSettings().catch(() => {}) },
              ]
            );
            return;
          }
        } else {
          await gameReminder.disable(userId);
        }
        setEnabled(next);
        // Dicatat di server sebagai preferensi akun (pengingat itu sendiri tetap lokal); kegagalan jaringan diabaikan.
        gameApi.updateSettings({ reminder_enabled: next }).catch(() => {});
      } finally {
        setBusy(false);
      }
    },
    [userId, busy, today]
  );

  const { hour, minute } = parseReminderTime(today.reminder_time ?? DEFAULT_REMINDER_TIME);
  const timeText = `${String(hour).padStart(2, '0')}.${String(minute).padStart(2, '0')}`;

  return (
    <View style={styles.box}>
      <View style={styles.row}>
        <Text style={styles.title}>Ingatkan saya setiap hari</Text>
        <Switch
          value={enabled === true}
          disabled={enabled === null || busy}
          onValueChange={toggle}
          trackColor={{ false: colors.borderStrong, true: colors.accentFill }}
          thumbColor={colors.bgSurface}
          accessibilityLabel="Ingatkan saya setiap hari"
        />
      </View>
      <Text style={styles.hint}>
        Satu pengingat per hari sekitar pukul {timeText} (jam HP Anda). Berhenti sendiri bila Anda sudah bermain hari itu.
        Bisa dimatikan kapan saja.
      </Text>
    </View>
  );
};

const makeStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    box: { marginTop: spacing.xl, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.bgCard, gap: spacing.xs },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
    title: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.textPrimary },
    hint: { fontSize: 12, lineHeight: 17, color: colors.textSecondary },
  });
