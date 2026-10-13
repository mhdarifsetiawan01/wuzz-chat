/**
 * ForumGroupPicker — memilih grup tempat forum baru akan dibuat.
 * Hanya grup yang dikelola user (admin/creator) yang ditampilkan, karena backend menolak
 * pembuatan forum oleh anggota biasa. Dipisah dari alur bubble agar kelak mudah
 * ditambah opsi "tanpa grup".
 */

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { Conversation } from '../../api/types';
import { ColorTokens, radius, spacing, useThemedStyles } from '../../theme';
import { Avatar } from '../Avatar';

export interface ForumGroupPickerProps {
  /** Grup yang dikelola user (admin/creator). */
  managedGroups: Conversation[];
  /** Apakah user punya grup apa pun, sebagai anggota biasa sekalipun. */
  hasAnyGroup: boolean;
  onPick: (group: Conversation) => void;
  onCreateGroup: () => void;
}

export const ForumGroupPicker: React.FC<ForumGroupPickerProps> = ({
  managedGroups,
  hasAnyGroup,
  onPick,
  onCreateGroup,
}) => {
  const styles = useThemedStyles(makeStyles);

  if (managedGroups.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.emptyTitle}>
          {hasAnyGroup ? 'Hanya admin grup yang bisa membuat forum' : 'Forum dibuat di dalam grup'}
        </Text>
        <Text style={styles.emptyBody}>
          {hasAnyGroup
            ? 'Kamu belum menjadi admin di grup mana pun. Buat grup baru, lalu lanjut membuat forum di dalamnya.'
            : 'Kamu belum punya grup. Buat grup dulu, lalu lanjut membuat forum di dalamnya.'}
        </Text>
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={onCreateGroup}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Buat grup baru"
        >
          <Text style={styles.primaryBtnText}>+ Buat Grup Baru</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View>
      <Text style={styles.hint}>Pilih grup tempat forum akan dibuat</Text>
      {managedGroups.map((group) => {
        const title = group.title || group.name || 'Grup';
        return (
          <TouchableOpacity
            key={group.id}
            style={styles.row}
            onPress={() => onPick(group)}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel={`Buat forum di grup ${title}`}
          >
            <Avatar name={title} avatarUrl={group.avatar_url} size={40} isGroup />
            <Text style={styles.rowTitle} numberOfLines={1}>{title}</Text>
          </TouchableOpacity>
        );
      })}
      <TouchableOpacity
        style={styles.linkBtn}
        onPress={onCreateGroup}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel="Buat grup baru"
      >
        <Text style={styles.linkBtnText}>+ Buat grup baru</Text>
      </TouchableOpacity>
    </View>
  );
};

const makeStyles = (colors: ColorTokens) => StyleSheet.create({
  hint: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.bgElevated,
  },
  rowTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  linkBtn: {
    alignSelf: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  linkBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.accentPrimary,
  },
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    gap: spacing.md,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  emptyBody: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
    textAlign: 'center',
  },
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
  primaryBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textOnAccent,
  },
});
