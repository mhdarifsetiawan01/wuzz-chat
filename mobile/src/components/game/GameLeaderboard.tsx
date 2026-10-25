/**
 * Papan skor Wuzz Grid: tab Teman / Grup, periode Hari ini / Minggu ini. Data dari server (hanya penyelesaian
 * sah; pengguna yang berhubungan blokir tidak tampil). Kegagalan jaringan menampilkan tombol coba lagi.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { ApiError, GameBoardEntry, GameBoardPeriod, GameBoardScope, GameLeaderboard as Board, GameSettings, gameApi } from '../../api';
import { Avatar } from '../Avatar';
import { Icon } from '../Icon';
import { ReportModal, ReportTarget } from '../ReportModal';
import { useConversations } from '../../context';
import { radius, spacing, useTheme, useThemedStyles, ColorTokens } from '../../theme';
import { formatBoardResult, isBoardGroupId } from '../../utils/gameBoard';

export interface GameLeaderboardProps {
  /** Berubah saat pemain menyelesaikan puzzle, supaya papan dimuat ulang. */
  refreshKey?: string | number;
}

export const GameLeaderboard: React.FC<GameLeaderboardProps> = ({ refreshKey }) => {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const { conversations } = useConversations();
  const groups = useMemo(
    () => conversations.filter((c) => isBoardGroupId(c.id)).map((c) => ({ id: c.id, title: c.title || c.name || 'Grup' })),
    [conversations]
  );

  const [scope, setScope] = useState<GameBoardScope>('friends');
  const [period, setPeriod] = useState<GameBoardPeriod>('day');
  const [groupId, setGroupId] = useState<string | null>(null);
  const [board, setBoard] = useState<Board | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  // Pengaturan privasi game (opt-in papan publik, sembunyikan dari teman dan grup) diambil dari server sekali.
  const [settings, setSettings] = useState<GameSettings | null>(null);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);

  // Grup terpilih harus selalu salah satu grup yang masih ada.
  const activeGroupId = groupId && groups.some((g) => g.id === groupId) ? groupId : groups[0]?.id ?? null;

  const load = useCallback(async () => {
    if (scope === 'group' && !activeGroupId) {
      setBoard(null);
      setLoading(false);
      setError(null);
      return;
    }
    const mine = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const res = await gameApi.getLeaderboard({ scope, period, groupId: scope === 'group' ? activeGroupId ?? undefined : undefined });
      if (mine === requestId.current) setBoard(res);
    } catch (err) {
      if (mine === requestId.current) setError((err as ApiError)?.detail || 'Tidak dapat memuat papan skor.');
    } finally {
      if (mine === requestId.current) setLoading(false);
    }
  }, [scope, period, activeGroupId]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  useEffect(() => {
    let cancelled = false;
    gameApi
      .getSettings()
      .then((st) => {
        if (!cancelled) setSettings(st);
      })
      .catch(() => {
        if (!cancelled) setSettings(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const updateSetting = useCallback(
    async (patch: Partial<GameSettings>) => {
      setSettingsBusy(true);
      setSettingsError(null);
      try {
        setSettings(await gameApi.updateSettings(patch));
        await load();
      } catch (err) {
        setSettingsError((err as ApiError)?.detail || 'Tidak dapat menyimpan pengaturan.');
      } finally {
        setSettingsBusy(false);
      }
    },
    [load]
  );

  const reportEntry = useCallback((e: GameBoardEntry) => {
    setReportTarget({ type: 'user', id: e.user_id, userId: e.user_id, label: `@${e.username}` });
  }, []);

  const emptyText =
    scope === 'public'
      ? 'Belum ada pemain di papan publik. Nyalakan pilihan di atas untuk tampil pertama.'
      : scope === 'group'
      ? 'Belum ada anggota grup yang menyelesaikan puzzle ini.'
      : period === 'day'
        ? 'Belum ada teman yang menyelesaikan puzzle hari ini.'
        : 'Belum ada teman yang menyelesaikan puzzle minggu ini.';

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>Papan skor</Text>

      <View style={styles.pillRow}>
        <Pill label="Teman" active={scope === 'friends'} onPress={() => setScope('friends')} />
        <Pill label="Grup" active={scope === 'group'} onPress={() => setScope('group')} />
        <Pill label="Publik" active={scope === 'public'} onPress={() => setScope('public')} />
      </View>
      <View style={styles.pillRow}>
        <Pill label="Hari ini" active={period === 'day'} onPress={() => setPeriod('day')} />
        <Pill label="Minggu ini" active={period === 'week'} onPress={() => setPeriod('week')} />
      </View>

      {scope === 'public' ? (
        <View style={styles.optInBox}>
          <View style={styles.optInRow}>
            <Text style={styles.optInTitle}>Tampilkan saya di papan publik</Text>
            <Switch
              value={settings?.leaderboard_public === true}
              disabled={settings === null || settingsBusy}
              onValueChange={(v) => updateSetting({ leaderboard_public: v })}
              trackColor={{ false: colors.borderStrong, true: colors.accentFill }}
              thumbColor={colors.bgSurface}
              accessibilityLabel="Tampilkan saya di papan publik"
            />
          </View>
          <Text style={styles.optInHint}>
            Bila menyala, orang lain bisa melihat @username dan waktu Anda. Nama dan foto profil tidak ditampilkan.
            Anda bisa mematikannya kapan saja.
          </Text>
          {settingsError ? <Text style={styles.errorText}>{settingsError}</Text> : null}
        </View>
      ) : null}

      {scope === 'group' && groups.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.groupRow}>
          {groups.map((g) => (
            <Pill key={g.id} label={g.title} active={g.id === activeGroupId} onPress={() => setGroupId(g.id)} small />
          ))}
        </ScrollView>
      ) : null}

      {loading && !board ? (
        <ActivityIndicator style={styles.loader} />
      ) : error ? (
        <View style={styles.messageBox}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={load} accessibilityRole="button">
            <Text style={styles.retry}>Coba lagi</Text>
          </TouchableOpacity>
        </View>
      ) : scope === 'group' && groups.length === 0 ? (
        <Text style={styles.empty}>Anda belum bergabung ke grup mana pun.</Text>
      ) : !board || board.entries.length === 0 ? (
        <Text style={styles.empty}>{emptyText}</Text>
      ) : (
        <View style={styles.list}>
          {board.entries.map((e) => (
            <View key={e.user_id} style={[styles.row, e.is_me && styles.rowMe]}>
              <Text style={styles.rank}>{e.rank}</Text>
              <Avatar name={e.display_name || e.username} avatarUrl={e.avatar_url} size={32} shape="circle" />
              <Text style={styles.name} numberOfLines={1}>
                {e.display_name || `@${e.username}`}
              </Text>
              {e.is_me ? <Text style={styles.meTag}>Anda</Text> : null}
              <Text style={styles.result}>{formatBoardResult(board.period, e.solved_days, e.duration_ms)}</Text>
              {board.scope === 'public' && !e.is_me ? (
                <TouchableOpacity
                  onPress={() => reportEntry(e)}
                  hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel={`Laporkan @${e.username}`}
                >
                  <Icon name="alert" size={16} color={colors.textMuted} />
                </TouchableOpacity>
              ) : null}
            </View>
          ))}
        </View>
      )}

      {scope !== 'public' ? (
        <View style={styles.optInBox}>
          <View style={styles.optInRow}>
            <Text style={styles.optInTitle}>Sembunyikan hasil saya dari teman dan grup</Text>
            <Switch
              value={settings?.hide_from_social === true}
              disabled={settings === null || settingsBusy}
              onValueChange={(v) => updateSetting({ hide_from_social: v })}
              trackColor={{ false: colors.borderStrong, true: colors.accentFill }}
              thumbColor={colors.bgSurface}
              accessibilityLabel="Sembunyikan hasil saya dari teman dan grup"
            />
          </View>
          <Text style={styles.optInHint}>
            {settings?.hide_from_social
              ? 'Teman dan anggota grup tidak melihat waktu Anda. Anda tetap melihat hasil sendiri, dan streak tidak terpengaruh.'
              : 'Saat ini teman dan anggota grup Anda melihat nama, foto, dan waktu Anda di papan ini. Nyalakan untuk menyembunyikannya.'}
          </Text>
          {settingsError ? <Text style={styles.errorText}>{settingsError}</Text> : null}
        </View>
      ) : null}

      <ReportModal visible={Boolean(reportTarget)} target={reportTarget} onClose={() => setReportTarget(null)} />
    </View>
  );
};

const Pill: React.FC<{ label: string; active: boolean; onPress: () => void; small?: boolean }> = ({
  label,
  active,
  onPress,
  small,
}) => {
  const styles = useThemedStyles(makeStyles);
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[styles.pill, small && styles.pillSmall, active && styles.pillActive]}
    >
      <Text style={[styles.pillText, active && styles.pillTextActive]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
};

const makeStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    wrap: { marginTop: spacing.xxl, gap: spacing.md },
    heading: { fontSize: 16, fontWeight: '800', color: colors.textPrimary },
    pillRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
    optInBox: { padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.bgCard, gap: spacing.xs },
    optInRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
    optInTitle: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.textPrimary },
    optInHint: { fontSize: 12, lineHeight: 17, color: colors.textSecondary },
    groupRow: { gap: spacing.sm, paddingVertical: spacing.xs },
    pill: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.full,
      backgroundColor: colors.bgInput,
    },
    pillSmall: { maxWidth: 160 },
    pillActive: { backgroundColor: colors.accentFill },
    pillText: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
    pillTextActive: { color: colors.textOnAccent },
    loader: { marginVertical: spacing.xl },
    messageBox: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg },
    errorText: { fontSize: 13, color: colors.colorErrorText, textAlign: 'center' },
    retry: { fontSize: 14, fontWeight: '700', color: colors.accentPrimary },
    empty: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', paddingVertical: spacing.lg },
    list: { borderRadius: radius.lg, backgroundColor: colors.bgCard, overflow: 'hidden' },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderDefault,
    },
    rowMe: { backgroundColor: colors.bgInput },
    rank: { width: 24, fontSize: 15, fontWeight: '800', color: colors.textSecondary, textAlign: 'center' },
    name: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.textPrimary },
    // Lencana terpisah (tidak menyusut) supaya penanda "Anda" tetap terlihat saat nama panjang terpotong.
    meTag: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.accentPrimary,
      paddingHorizontal: spacing.sm,
      paddingVertical: 1,
      borderRadius: radius.full,
      backgroundColor: colors.bgSurface,
      overflow: 'hidden',
    },
    result: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  });
