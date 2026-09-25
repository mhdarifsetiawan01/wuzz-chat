/**
 * WuzzChat Mobile UI - Avatar Component
 * Deterministic color palette for initials with optional image and presence dot.
 */

import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '../theme';

interface AvatarProps {
  name: string;
  avatarUrl?: string;
  size?: number;
  isOnline?: boolean;
  isGroup?: boolean;
}

const AVATAR_PALETTE = [
  '#3b82f6', // blue
  '#10b981', // emerald
  '#8b5cf6', // purple
  '#f59e0b', // amber
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#6366f1', // indigo
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
  size = 48,
  isOnline = false,
  isGroup = false,
}) => {
  const [hasImageError, setHasImageError] = React.useState(false);
  const bgColor = isGroup ? colors.accentPrimary : getAvatarColor(name);
  const initials = getInitials(name);
  const fontSize = Math.floor(size * 0.4);

  const hasValidHttpUrl =
    !hasImageError &&
    !!avatarUrl &&
    avatarUrl.trim().length > 0 &&
    (avatarUrl.startsWith('http://') || avatarUrl.startsWith('https://'));

  return (
    <View style={[styles.container, { width: size, height: size, borderRadius: size / 2 }]}>
      {hasValidHttpUrl ? (
        <Image
          source={{ uri: avatarUrl }}
          onError={() => setHasImageError(true)}
          style={[styles.image, { width: size, height: size, borderRadius: size / 2 }]}
        />
      ) : (
        <View
          style={[
            styles.fallback,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: bgColor,
              borderWidth: isGroup ? 1.5 : 0,
              borderColor: isGroup ? colors.colorCyanNeon : 'transparent',
            },
          ]}
        >
          <Text style={[styles.initialsText, { fontSize }]}>{initials}</Text>
        </View>
      )}

      {isOnline && (
        <View
          style={[
            styles.onlineDot,
            {
              width: Math.max(10, size * 0.25),
              height: Math.max(10, size * 0.25),
              borderRadius: radius.full,
            },
          ]}
        />
      )}

      {isGroup && !isOnline && (
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
          <Text style={[styles.groupBadgeIcon, { fontSize: Math.max(8, size * 0.18) }]}>👥</Text>
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
  },
  onlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: colors.colorOnline,
    borderWidth: 2,
    borderColor: colors.bgBase,
  },
  groupBadge: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    backgroundColor: colors.bgCardSolid,
    borderWidth: 1.5,
    borderColor: colors.accentPrimary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  groupBadgeIcon: {
    lineHeight: 12,
  },
});

