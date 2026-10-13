/**
 * MyForumsView — "Forum saya": forum tempat user menjadi anggota topik, dikelompokkan Aktif / Tidak aktif,
 * dengan filter peran (Semua / Admin / Anggota; creator digabung ke Admin) yang dikerjakan di klien.
 *
 * Ketahanan jaringan: data lama (per akun) tampil seketika lalu disegarkan di latar; permintaan memakai
 * AbortController 15 dtk. Tenant ditentukan server dari sesi, klien tidak mengirimnya.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Dimensions, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { subgroupsApi } from '../../api/subgroups';
import type { MyForum } from '../../api/types';
import { useAuth } from '../../context/AuthContext';
import { ColorTokens, radius, spacing, useTheme, useThemedStyles } from '../../theme';
import { formatTtlRemaining } from '../../utils/ttlCountdown';
import { Icon } from '../Icon';

type RoleFilter = 'all' | 'admin' | 'member';

export interface MyForumsViewProps {
  onOpenForum: (forum: MyForum) => void;
  onOpenMemory: (forum: MyForum) => void;
  onCreateForum: () => void;
}

// Cache per akun supaya daftar langsung tampil saat dibuka ulang; tidak pernah dibagi antar akun.
let cache: { userId: string; items: MyForum[] } | null = null;

const isAdminRole = (role: MyForum['my_role']): boolean => role === 'admin' || role === 'creator';

export const MyForumsView: React.FC<MyForumsViewProps> = ({ onOpenForum, onOpenMemory, onCreateForum }) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { user } = useAuth();
  const userId = user?.id ?? '';

  const [items, setItems] = useState<MyForum[]>(() => (cache && cache.userId === userId ? cache.items : []));
  const [isLoading, setIsLoading] = useState(!(cache && cache.userId === userId));
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<RoleFilter>('all');
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const timer = setTimeout(() => controller.abort(), 15_000);
    setFailed(false);
    try {
      const data = await subgroupsApi.listMyForums(controller.signal);
      if (abortRef.current !== controller) return;
      cache = { userId, items: data };
      setItems(data);
    } catch (err: any) {
      if (abortRef.current !== controller) return;
      // Bila sudah ada data lama, biarkan tampil; kegagalan hanya ditandai bila layar masih kosong.
      setFailed(true);
    } finally {
      clearTimeout(timer);
      if (abortRef.current === controller) setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
    return () => { abortRef.current?.abort(); };
  }, [load]);

  const counts = useMemo(() => ({
    all: items.length,
    admin: items.filter((f) => isAdminRole(f.my_role)).length,
    member: items.filter((f) => !isAdminRole(f.my_role)).length,
  }), [items]);

  const visible = useMemo(() => items.filter((f) => {
    if (filter === 'admin') return isAdminRole(f.my_role);
    if (filter === 'member') return !isAdminRole(f.my_role);
    return true;
  }), [items, filter]);

  const activeForums = useMemo(() => visible.filter((f) => f.is_active), [visible]);
  const endedForums = useMemo(() => visible.filter((f) => !f.is_active), [visible]);

  const renderRow = (forum: MyForum) => {
    const roleLabel = forum.my_role === 'creator' ? 'Pembuat' : forum.my_role === 'admin' ? 'Admin' : '';
    const status = forum.is_active && forum.expires_at ? formatTtlRemaining(forum.expires_at) : 'Berakhir';
    return (
      <TouchableOpacity
        key={forum.id}
        style={styles.row}
        onPress={() => onOpenForum(forum)}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={`Forum ${forum.title}, grup ${forum.parent_title}, ${status}${roleLabel ? `, kamu ${roleLabel}` : ''}`}
      >
        <View style={styles.rowMain}>
          <View style={styles.titleLine}>
            <Text style={styles.rowTitle} numberOfLines={1}>{forum.title}</Text>
            {roleLabel ? (
              <View accessibilityLabel={roleLabel} accessible>
                <Icon
                  name="star"
                  size={14}
                  color={colors.accentPrimary}
                  active={forum.my_role === 'creator'}
                />
              </View>
            ) : null}
          </View>
          <Text style={styles.rowMeta} numberOfLines={1}>{forum.parent_title} · {status}</Text>
        </View>
        {!forum.is_active && forum.has_approved_memory ? (
          <TouchableOpacity
            style={styles.memoryBtn}
            onPress={() => onOpenMemory(forum)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={`Buka memori forum ${forum.title}`}
          >
            <Icon name="bulb" size={16} color={colors.accentPrimary} />
            <Text style={styles.memoryBtnText}>Memori</Text>
          </TouchableOpacity>
        ) : null}
      </TouchableOpacity>
    );
  };

  if (isLoading && items.length === 0) {
    return (
      <View style={styles.centerWrap}>
        <ActivityIndicator color={colors.accentPrimary} />
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View style={styles.centerWrap}>
        <Text style={styles.emptyTitle}>{failed ? 'Gagal memuat forum' : 'Kamu belum punya forum'}</Text>
        <Text style={styles.emptyBody}>
          {failed
            ? 'Periksa koneksi lalu coba lagi.'
            : 'Buat forum di grup. Saat topik berakhir, AI Memory dapat merangkum keputusannya untuk disetujui admin.'}
        </Text>
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={failed ? load : onCreateForum}
          activeOpacity={0.85}
          accessibilityRole="button"
        >
          <Text style={styles.primaryBtnText}>{failed ? 'Coba Lagi' : '+ Buat Forum Baru'}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const chips: { key: RoleFilter; label: string }[] = [
    { key: 'all', label: 'Semua' },
    { key: 'admin', label: 'Admin' },
    { key: 'member', label: 'Anggota' },
  ];

  return (
    <View>
      <View style={styles.chipRow}>
        {chips.map((chip) => {
          const selected = filter === chip.key;
          return (
            <TouchableOpacity
              key={chip.key}
              style={[styles.chip, selected && styles.chipSelected]}
              onPress={() => setFilter(chip.key)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityState={{ selected }}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                {chip.label} {counts[chip.key]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
        {visible.length === 0 ? (
          <Text style={styles.filterEmpty}>Belum ada forum di sini.</Text>
        ) : null}
        {activeForums.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>Aktif · {activeForums.length}</Text>
            {activeForums.map(renderRow)}
          </>
        ) : null}
        {endedForums.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>Tidak aktif · {endedForums.length}</Text>
            {endedForums.map(renderRow)}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
};

const makeStyles = (colors: ColorTokens) => StyleSheet.create({
  centerWrap: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.md,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
  emptyBody: { fontSize: 13, lineHeight: 19, color: colors.textSecondary, textAlign: 'center' },
  primaryBtn: {
    marginTop: spacing.sm,
    backgroundColor: colors.accentFill,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { fontSize: 15, fontWeight: '700', color: colors.textOnAccent },
  chipRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  chip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    backgroundColor: colors.bgElevated,
  },
  chipSelected: { borderColor: colors.accentPrimary, backgroundColor: colors.tintAccent10 },
  chipText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  chipTextSelected: { color: colors.accentPrimary },
  list: { maxHeight: Dimensions.get('window').height * 0.5 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  filterEmpty: { fontSize: 13, color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.bgElevated,
  },
  rowMain: { flex: 1 },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  rowTitle: { flexShrink: 1, fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  rowMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  memoryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.tintAccent10,
  },
  memoryBtnText: { fontSize: 12, fontWeight: '600', color: colors.accentPrimary },
});
