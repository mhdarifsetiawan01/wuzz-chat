/**
 * WuzzChat Mobile UI - Avatar Component
 * Deterministic color palette for initials with optional image and presence dot.
 */

import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '../theme';
import { IconText } from './IconText';

interface AvatarProps {
  name: string;
  avatarUrl?: string;
  size?: number;
  isOnline?: boolean;
  isGroup?: boolean;
  shape?: 'squircle' | 'circle';
  unreadCount?: number;
}

const AVATAR_PALETTE = [
  '#30AFFF', // Wuzz Identity Blue
  '#0d9488', // Teal
  '#4f46e5', // Indigo
  '#f59e0b', // Amber
  '#ec4899', // Rose
  '#0284c7', // Sky
  '#8b5cf6', // Violet
];

export function getAvatarColor(name: string): string {
  if (!name) return AVATAR_PALETTE[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_PALETTE.length;
  return AVATAR_PALETTE[index];
}

function getInitials(name: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].substring(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export const Avatar: React.FC<AvatarProps> = ({
  name,
  avatarUrl,
  size = 52,
  isOnline = false,
  isGroup = false,
  shape = 'circle',
  unreadCount,
}) => {
  const [hasImageError, setHasImageError] = React.useState(false);
  const bgColor = isGroup ? colors.accentPrimary : getAvatarColor(name);
  const initials = getInitials(name);
  const fontSize = Math.floor(size * 0.38);

  const borderRadius = shape === 'circle' ? size / 2 : Math.round(size * 0.28);

  const hasValidHttpUrl =
    !hasImageError &&
    !!avatarUrl &&
    avatarUrl.trim().length > 0 &&
    (avatarUrl.startsWith('http://') || avatarUrl.startsWith('https://'));

  return (
    <View style={[styles.container, { width: size, height: size, borderRadius }]}>
      {hasValidHttpUrl ? (
        <Image
          source={{ uri: avatarUrl }}
          onError={() => setHasImageError(true)}
          style={[styles.image, { width: size, height: size, borderRadius }]}
        />
      ) : (
        <View
          style={[
            styles.fallback,
            {
              width: size,
              height: size,
              borderRadius,
              backgroundColor: bgColor,
            },
          ]}
        >
          <Text style={[styles.initialsText, { fontSize }]}>{initials}</Text>
        </View>
      )}

      {/* Unread badge attached to avatar bottom-right (as shown in reference image) */}
      {unreadCount !== undefined && unreadCount > 0 ? (
        <View style={styles.unreadBadgeWrapper}>
          <Text style={styles.unreadBadgeText}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </Text>
        </View>
      ) : isOnline ? (
        <View
          style={[
            styles.onlineDot,
            {
              width: Math.max(10, size * 0.24),
              height: Math.max(10, size * 0.24),
              borderRadius: radius.full,
            },
          ]}
        />
      ) : null}

      {isGroup && !isOnline && (!unreadCount || unreadCount <= 0) && (
        <View
          style={[
            styles.groupBadge,
            {
              width: Math.max(14, size * 0.32),
              height: Math.max(14, size * 0.32),
              borderRadius: radius.full,
            },
          ]}
        >
          <IconText style={[styles.groupBadgeIcon, { fontSize: Math.max(8, size * 0.18) }]}>👥</IconText>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    resizeMode: 'cover',
  },
  fallback: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  initialsText: {
    color: '#ffffff',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  unreadBadgeWrapper: {
    position: 'absolute',
    bottom: -2,
    right: -4,
    backgroundColor: colors.unreadBadgeBg,
    borderWidth: 2,
    borderColor: '#ffffff',
    borderRadius: 12,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 4,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
  },
  unreadBadgeText: {
    color: colors.unreadBadgeText,
    fontSize: 10,
    fontWeight: '800',
  },
  onlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: colors.colorOnline,
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  groupBadge: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: colors.borderDefault,
    justifyContent: 'center',
    alignItems: 'center',
  },
  groupBadgeIcon: {
    lineHeight: 12,
  },
});

