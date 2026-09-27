/**
 * WuzzChat Mobile UI — CallsHistoryScreen
 * Tab Panggilan — Riwayat WebRTC Voice Call (M-Mobile-8.19)
 *
 * Displays call history (incoming, outgoing, missed) with
 * Aurora Dark Mode styling and a FAB to initiate a new call.
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  ListRenderItem,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, shadows, spacing, typography } from '../theme';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type CallType = 'incoming' | 'outgoing' | 'missed';

interface CallRecord {
  id: string;
  contactName: string;
  username: string;
  timestamp: Date;
  type: CallType;
  durationSeconds?: number; // undefined if missed
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const CALL_META: Record<CallType, { icon: string; label: string; color: string }> = {
  incoming: { icon: '↙️', label: 'Masuk',     color: colors.colorOnline },
  outgoing: { icon: '↗️', label: 'Keluar',    color: colors.accentPrimary },
  missed:   { icon: '📵', label: 'Tak Terjawab', color: colors.colorError },
};

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function formatTimestamp(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const dayMs = 86400000;

  if (diff < dayMs && now.getDate() === date.getDate()) {
    return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  }
  if (diff < 2 * dayMs) return 'Kemarin';
  return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock Data — akan diganti dengan real data dari CallContext / API
// ─────────────────────────────────────────────────────────────────────────────
const MOCK_CALLS: CallRecord[] = [
  {
    id: '1',
    contactName: 'Alice Novita',
    username: 'alice',
    timestamp: new Date(Date.now() - 5 * 60000),
    type: 'incoming',
    durationSeconds: 142,
  },
  {
    id: '2',
    contactName: 'Bob Santoso',
    username: 'bob',
    timestamp: new Date(Date.now() - 2 * 3600000),
    type: 'missed',
  },
  {
    id: '3',
    contactName: 'Charlie Dev',
    username: 'charlie',
    timestamp: new Date(Date.now() - 24 * 3600000),
    type: 'outgoing',
    durationSeconds: 73,
  },
  {
    id: '4',
    contactName: 'Diana Putra',
    username: 'diana',
    timestamp: new Date(Date.now() - 25 * 3600000),
    type: 'missed',
  },
  {
    id: '5',
    contactName: 'Evan Wijaya',
    username: 'evan',
    timestamp: new Date(Date.now() - 48 * 3600000),
    type: 'outgoing',
    durationSeconds: 301,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Call List Item
// ─────────────────────────────────────────────────────────────────────────────
const CallListItem = React.memo(({ item }: { item: CallRecord }) => {
  const meta = CALL_META[item.type];

  return (
    <TouchableOpacity
      style={styles.callItem}
      activeOpacity={0.75}
      onPress={() => {
        /* TODO: navigate to contact or initiate call */
      }}
    >
      {/* Avatar */}
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>
          {item.contactName.charAt(0).toUpperCase()}
        </Text>
      </View>

      {/* Info */}
      <View style={styles.callInfo}>
        <Text style={styles.contactName} numberOfLines={1}>
          {item.contactName}
        </Text>
        <View style={styles.callMeta}>
          <Text style={[styles.callTypeIcon]}>{meta.icon}</Text>
          <Text style={[styles.callTypeLabel, { color: meta.color }]}>
            {meta.label}
          </Text>
          {item.durationSeconds !== undefined && (
            <Text style={styles.callDuration}>
              {' · '}{formatDuration(item.durationSeconds)}
            </Text>
          )}
        </View>
      </View>

      {/* Timestamp + callback button */}
      <View style={styles.callRight}>
        <Text style={styles.callTimestamp}>{formatTimestamp(item.timestamp)}</Text>
        <TouchableOpacity
          style={styles.callbackButton}
          activeOpacity={0.75}
          onPress={() => {
            /* TODO: initiate call to item.username */
          }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.callbackIcon}>📞</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Main Screen
// ─────────────────────────────────────────────────────────────────────────────
export const CallsHistoryScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const calls = MOCK_CALLS;

  const renderItem: ListRenderItem<CallRecord> = useCallback(
    ({ item }) => <CallListItem item={item} />,
    []
  );

  const keyExtractor = useCallback((item: CallRecord) => item.id, []);

  const ListEmpty = useMemo(
    () => (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyIcon}>📞</Text>
        <Text style={styles.emptyTitle}>Belum ada riwayat panggilan</Text>
        <Text style={styles.emptySubtitle}>
          Mulai panggilan suara dengan menekan tombol + di bawah
        </Text>
      </View>
    ),
    []
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Panggilan</Text>
      </View>

      {/* Call History List */}
      <FlatList
        data={calls}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        ListEmptyComponent={ListEmpty}
        contentContainerStyle={[
          styles.listContent,
          calls.length === 0 && styles.listContentEmpty,
        ]}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        showsVerticalScrollIndicator={false}
      />

      {/* FAB — Initiate New Call */}
      <TouchableOpacity
        style={[
          styles.fab,
          {
            bottom: Math.max(insets.bottom + spacing.xl, spacing.xxxl),
          },
        ]}
        activeOpacity={0.85}
        onPress={() => {
          /* TODO: open contact picker to start a call */
        }}
      >
        <Text style={styles.fabIcon}>📞</Text>
      </TouchableOpacity>
    </View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgBase,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.bgSurface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  headerTitle: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  listContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxxl,
  },
  listContentEmpty: {
    flex: 1,
  },
  separator: {
    height: 1,
    backgroundColor: colors.borderSubtle,
    marginLeft: 72,
  },

  // ── Call Item ──────────────────────────────────────────────────────────────
  callItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    backgroundColor: colors.tintAccent20,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  avatarText: {
    ...typography.h3,
    color: colors.accentPrimary,
  },
  callInfo: {
    flex: 1,
    marginRight: spacing.sm,
  },
  contactName: {
    ...typography.body,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  callMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  callTypeIcon: {
    fontSize: 13,
    marginRight: 4,
  },
  callTypeLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  callDuration: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  callRight: {
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  callTimestamp: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  callbackButton: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: colors.tintAccent10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  callbackIcon: {
    fontSize: 14,
  },

  // ── Empty State ────────────────────────────────────────────────────────────
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxxl,
  },
  emptyIcon: {
    fontSize: 56,
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  emptySubtitle: {
    ...typography.bodySecondary,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },

  // ── FAB ───────────────────────────────────────────────────────────────────
  fab: {
    position: 'absolute',
    right: spacing.xl,
    width: 56,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: colors.accentPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.modal,
  },
  fabIcon: {
    fontSize: 24,
  },
});
