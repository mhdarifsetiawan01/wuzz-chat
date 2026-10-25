/**
 * WuzzChat Mobile UI — GameScreen (Wuzz Grid)
 * Layar penuh puzzle harian. Alur: intro -> Mulai (waktu dicatat server) -> isi grid -> kirim otomatis
 * saat papan sah. Papan disimpan lokal tiap perubahan; waktu dihitung server dari started_at sehingga
 * jaringan buruk tidak merugikan pemain. Jawaban yang gagal terkirim bisa dikirim ulang dengan tombol.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiError } from '../api';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { GameGrid } from '../components/game/GameGrid';
import { GameLeaderboard } from '../components/game/GameLeaderboard';
import { GameResultSheet } from '../components/game/GameResultSheet';
import { useAuth } from '../context';
import { useGameToday } from '../hooks/useGameToday';
import { gameStorage } from '../services/gameStorage';
import { showAlert } from '../services/dialog';
import { radius, spacing, useTheme, useThemedStyles, ColorTokens } from '../theme';
import {
  Board,
  boardToPlacement,
  computeCellSize,
  emptyBoard,
  findConflicts,
  formatDuration,
  hasConflict,
  isSubmittable,
  shouldShowFreezeBadge,
  starCount,
  tapCell,
} from '../utils/gameBoard';

const GUTTER = spacing.lg;

export interface GameScreenProps {
  onBack: () => void;
}

export const GameScreen: React.FC<GameScreenProps> = ({ onBack }) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { user } = useAuth();
  const userId = user?.id;
  const { status, data, error, refresh, start, submit } = useGameToday(userId);

  const puzzle = data?.puzzle;
  const attempt = data?.attempt;
  const playing = attempt?.status === 'playing';
  const finished = attempt?.status === 'solved' || attempt?.status === 'suspicious';

  const [board, setBoard] = useState<Board | null>(null);
  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitFailed, setSubmitFailed] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const lastSentKey = useRef<string | null>(null);

  // Muat papan tersimpan (atau kosong) begitu puzzle diketahui.
  useEffect(() => {
    if (!userId || !puzzle) return;
    let cancelled = false;
    gameStorage.loadBoard(userId, puzzle.date, puzzle.size).then((saved) => {
      if (!cancelled) setBoard(saved ?? emptyBoard(puzzle.size));
    });
    return () => {
      cancelled = true;
    };
  }, [userId, puzzle?.date, puzzle?.size]);

  // Penghitung waktu hanya berjalan saat bermain.
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [playing]);

  const conflicts = useMemo(
    () => (board && puzzle ? findConflicts(board, puzzle.regions) : null),
    [board, puzzle]
  );
  const stars = board ? starCount(board) : 0;
  const canSubmit = Boolean(board && puzzle && isSubmittable(board, puzzle.regions));

  const cellSize = puzzle ? computeCellSize(width - GUTTER * 2, puzzle.size) : 0;

  const elapsedMs = useMemo(() => {
    if (!attempt) return 0;
    if (finished) return attempt.duration_ms;
    return Math.max(0, now - Date.parse(attempt.started_at));
  }, [attempt, finished, now]);

  const handleStart = useCallback(async () => {
    setStarting(true);
    await start();
    setStarting(false);
  }, [start]);

  const handleTap = useCallback(
    (r: number, c: number) => {
      if (!playing || !puzzle || !userId) return;
      setBoard((prev) => {
        if (!prev) return prev;
        const next = tapCell(prev, r, c);
        gameStorage.saveBoard(userId, puzzle.date, next);
        return next;
      });
      setSubmitFailed(false);
    },
    [playing, puzzle, userId]
  );

  const handleClear = useCallback(() => {
    if (!puzzle || !userId) return;
    showAlert('Hapus semua tanda?', 'Papan dikosongkan. Waktu tetap berjalan.', [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: () => {
          const cleared = emptyBoard(puzzle.size);
          setBoard(cleared);
          lastSentKey.current = null;
          setSubmitFailed(false);
          gameStorage.saveBoard(userId, puzzle.date, cleared);
        },
      },
    ]);
  }, [puzzle, userId]);

  const doSubmit = useCallback(async () => {
    if (!board || !puzzle || submitting) return;
    setSubmitting(true);
    setSubmitFailed(false);
    try {
      const res = await submit(boardToPlacement(board));
      if (res.solved) {
        setResultOpen(true);
      } else {
        showAlert('Belum tepat', 'Jawaban belum sesuai. Periksa lagi papan Anda; waktu tetap berjalan.');
      }
    } catch (err) {
      const status = (err as ApiError)?.status;
      if (status === 409) {
        // Hari berganti atau percobaan belum tercatat: ambil ulang keadaan dari server.
        await refresh();
      }
      setSubmitFailed(true);
    } finally {
      setSubmitting(false);
    }
  }, [board, puzzle, submitting, submit, refresh]);

  // Kirim otomatis sekali per papan sah; kegagalan jaringan ditangani tombol "Kirim ulang".
  useEffect(() => {
    if (!playing || !canSubmit || !board || submitting) return;
    const key = JSON.stringify(board);
    if (lastSentKey.current === key) return;
    lastSentKey.current = key;
    doSubmit();
  }, [playing, canSubmit, board, submitting, doSubmit]);

  // ─── Render ────────────────────────────────────────────────────────────────

  const header = (
    <View style={styles.header}>
      <TouchableOpacity
        onPress={onBack}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityLabel="Kembali"
      >
        <Icon name="back" size={24} color={colors.textPrimary} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>{data?.number ? `Wuzz Grid #${data.number}` : 'Wuzz Grid'}</Text>
      <View style={styles.headerSpacer} />
    </View>
  );

  if (status === 'loading' && !data) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {header}
        <View style={styles.center}>
          <ActivityIndicator color={colors.accentPrimary} />
        </View>
      </View>
    );
  }

  if (status === 'error' && !data) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {header}
        <View style={styles.center}>
          <Text style={styles.message}>{error ?? 'Tidak dapat memuat game hari ini.'}</Text>
          <Button title="Coba lagi" onPress={refresh} />
        </View>
      </View>
    );
  }

  if (!data?.enabled || !puzzle) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {header}
        <View style={styles.center}>
          <Text style={styles.message}>Game harian belum tersedia saat ini.</Text>
        </View>
      </View>
    );
  }

  const streak = data.streak?.current ?? 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {header}
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, spacing.lg) + spacing.lg }]}
      >
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Icon name="clock" size={16} color={colors.textSecondary} />
            <Text style={styles.statText} accessibilityLabel={`Waktu ${formatDuration(elapsedMs)}`}>
              {attempt ? formatDuration(elapsedMs) : '0:00'}
            </Text>
          </View>
          <View style={styles.stat}>
            <Icon name="star" active size={16} color={colors.accentPrimary} />
            <Text style={styles.statText}>
              {playing ? `${stars}/${puzzle.size}` : `${puzzle.size}×${puzzle.size}`}
            </Text>
          </View>
          <View style={styles.stat}>
            <Icon name="bolt" size={16} color={colors.warningFill} />
            <Text style={styles.statText}>Streak {streak}</Text>
            {shouldShowFreezeBadge(data.streak) ? (
              <View
                style={styles.freezeBadge}
                accessible
                accessibilityLabel={`${data.streak?.freezes_available} pembeku streak tersedia`}
              >
                <Icon name="shield" size={12} color={colors.accentPrimary} />
                <Text style={styles.freezeText}>{data.streak?.freezes_available}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {!attempt ? (
          <View style={styles.intro}>
            <Text style={styles.introTitle}>Cara bermain</Text>
            <Text style={styles.introLine}>
              Taruh 1 bintang di setiap baris, kolom, dan wilayah berwarna.
            </Text>
            <Text style={styles.introLine}>Dua bintang tidak boleh bersentuhan, termasuk diagonal.</Text>
            <Text style={styles.introLine}>Ketuk sekali untuk tanda X, dua kali untuk bintang.</Text>
            <Text style={styles.introHint}>Waktu mulai berjalan saat Anda menekan Mulai.</Text>
            <Button title="Mulai" onPress={handleStart} isLoading={starting} disabled={starting} />
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </View>
        ) : (
          <>
            {board && conflicts ? (
              <View style={styles.gridWrap}>
                <GameGrid
                  regions={puzzle.regions}
                  board={board}
                  conflicts={conflicts}
                  cellSize={cellSize}
                  disabled={!playing}
                  onTapCell={handleTap}
                />
              </View>
            ) : (
              <ActivityIndicator color={colors.accentPrimary} style={styles.gridLoading} />
            )}

            {playing ? (
              <View style={styles.footer}>
                {board && hasConflict(conflicts ?? []) ? (
                  <Text style={styles.warnText}>Ada bintang yang bentrok (ditandai merah).</Text>
                ) : (
                  <Text style={styles.hintText}>Ketuk sel: kosong → X → bintang → kosong.</Text>
                )}
                {submitFailed ? (
                  <View style={styles.retryBox}>
                    <Text style={styles.warnText}>Jawaban belum terkirim. Periksa koneksi Anda.</Text>
                    <Button
                      title="Kirim ulang"
                      onPress={doSubmit}
                      isLoading={submitting}
                      disabled={submitting || !canSubmit}
                    />
                  </View>
                ) : null}
                <Button title="Hapus semua" variant="secondary" onPress={handleClear} />
              </View>
            ) : (
              <View style={styles.footer}>
                <Text style={styles.doneText}>
                  Selesai dalam {formatDuration(attempt.duration_ms)}
                  {attempt.status === 'suspicious' ? ' (tidak masuk papan skor)' : ''}
                </Text>
                <Button title="Lihat hasil" onPress={() => setResultOpen(true)} />
              </View>
            )}
          </>
        )}

        <GameLeaderboard refreshKey={attempt?.status ?? 'none'} />
        <Text style={styles.freezeNote}>
          Pembeku streak: 1 per minggu, terpakai otomatis bila Anda melewatkan satu hari.
        </Text>
      </ScrollView>

      {attempt && finished ? (
        <GameResultSheet
          visible={resultOpen}
          onClose={() => setResultOpen(false)}
          number={data.number ?? 0}
          durationMs={attempt.duration_ms}
          streak={streak}
          suspicious={attempt.status === 'suspicious'}
        />
      ) : null}
    </View>
  );
};

const makeStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bgBase },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: GUTTER,
      paddingVertical: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderDefault,
      backgroundColor: colors.bgSurface,
    },
    headerTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
    headerSpacer: { width: 24 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, gap: spacing.lg },
    message: { fontSize: 15, color: colors.textSecondary, textAlign: 'center' },
    content: { paddingHorizontal: GUTTER, paddingTop: spacing.lg },
    statsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.lg,
    },
    stat: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    statText: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
    freezeBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      marginLeft: spacing.xs,
      paddingHorizontal: spacing.xs + 2,
      paddingVertical: 1,
      borderRadius: radius.full,
      backgroundColor: colors.bgInput,
    },
    freezeText: { fontSize: 11, fontWeight: '700', color: colors.accentPrimary },
    freezeNote: { fontSize: 11, color: colors.textMuted, textAlign: 'center', marginTop: spacing.lg },
    intro: {
      padding: spacing.lg,
      borderRadius: radius.lg,
      backgroundColor: colors.bgCard,
      gap: spacing.sm,
    },
    introTitle: { fontSize: 18, fontWeight: '800', color: colors.textPrimary, marginBottom: spacing.xs },
    introLine: { fontSize: 14, lineHeight: 21, color: colors.textPrimary },
    introHint: { fontSize: 12, color: colors.textSecondary, marginBottom: spacing.sm },
    errorText: { fontSize: 12, color: colors.colorErrorText },
    gridWrap: { alignItems: 'center' },
    gridLoading: { marginVertical: spacing.xxxl },
    footer: { marginTop: spacing.lg, gap: spacing.md },
    hintText: { fontSize: 12, color: colors.textSecondary, textAlign: 'center' },
    warnText: { fontSize: 13, color: colors.colorErrorText, textAlign: 'center' },
    retryBox: { gap: spacing.sm },
    doneText: { fontSize: 15, fontWeight: '600', color: colors.textPrimary, textAlign: 'center' },
  });
