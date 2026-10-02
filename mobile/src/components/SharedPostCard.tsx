/**
 * WuzzChat Mobile - SharedPostCard
 * Kartu postingan feed di dalam bubble chat. Cuplikan berasal dari isi pesan; thumbnail dan
 * status terkini (mis. sudah dihapus) diambil dari GET /api/feed/:id dengan cache in-memory.
 */

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { feedApi } from '../api/feedApi';
import { FeedPost } from '../api/types';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';

type PostState = { status: 'ok'; post: FeedPost } | { status: 'gone' } | { status: 'error' };

const postCache = new Map<string, PostState>();
const inflight = new Map<string, Promise<PostState>>();

function loadPost(postId: string): Promise<PostState> {
  const pending = inflight.get(postId);
  if (pending) return pending;

  const request = feedApi
    .getPost(postId)
    .then((post): PostState => ({ status: 'ok', post }))
    .catch((err: any): PostState => (err?.status === 404 ? { status: 'gone' } : { status: 'error' }))
    .then((state) => {
      // Gagal jaringan tidak di-cache agar bisa dicoba lagi saat kartu dirender ulang
      if (state.status !== 'error') postCache.set(postId, state);
      inflight.delete(postId);
      return state;
    });
  inflight.set(postId, request);
  return request;
}

interface SharedPostCardProps {
  postId: string;
  text: string;
  isSelf?: boolean;
  onPress?: (postId: string, post?: FeedPost) => void;
}

export const SharedPostCard: React.FC<SharedPostCardProps> = ({ postId, text, isSelf = false, onPress }) => {
  const [state, setState] = useState<PostState | null>(postCache.get(postId) ?? null);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    let mounted = true;
    const cached = postCache.get(postId);
    if (cached) {
      setState(cached);
      return;
    }
    setState(null);
    loadPost(postId).then((result) => {
      if (mounted) setState(result);
    });
    return () => {
      mounted = false;
    };
  }, [postId]);

  const gone = state?.status === 'gone';
  const post = state?.status === 'ok' ? state.post : undefined;
  const thumb = post?.media_urls?.[0];
  const authorName = post?.author?.display_name || post?.author?.username;

  return (
    <TouchableOpacity
      style={[styles.card, isSelf ? styles.cardSelf : styles.cardOther, gone && styles.cardGone]}
      activeOpacity={0.85}
      onPress={() => onPress?.(postId, post)}
    >
      {thumb && !imageError && !gone ? (
        <Image source={{ uri: thumb }} style={styles.thumbnail} resizeMode="cover" onError={() => setImageError(true)} />
      ) : null}

      <View style={styles.body}>
        <View style={styles.headerRow}>
          <Text style={[styles.label, isSelf && styles.labelSelf]} numberOfLines={1}>
            📢 {authorName ? `Postingan @${authorName}` : 'Postingan Komunitas'}
          </Text>
          {state === null ? <ActivityIndicator size="small" color={isSelf ? 'rgba(255,255,255,0.7)' : colors.accentPrimary} /> : null}
        </View>

        {gone ? (
          <Text style={[styles.goneText, isSelf && styles.textSelf]}>Postingan sudah dihapus</Text>
        ) : (
          <Text style={[styles.snippet, isSelf && styles.textSelf]} numberOfLines={4}>
            {text}
          </Text>
        )}

        {!gone ? (
          <Text style={[styles.cta, isSelf && styles.labelSelf]}>Ketuk untuk membaca</Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    minWidth: 220,
  },
  cardSelf: {
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },
  cardOther: {
    backgroundColor: colors.bgInput,
    borderColor: colors.borderDefault,
  },
  cardGone: {
    opacity: 0.65,
  },
  thumbnail: {
    width: '100%',
    height: 140,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
  body: {
    padding: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    flex: 1,
  },
  labelSelf: {
    color: 'rgba(255, 255, 255, 0.85)',
  },
  snippet: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.textPrimary,
  },
  textSelf: {
    color: '#ffffff',
  },
  goneText: {
    fontSize: 13,
    fontStyle: 'italic',
    color: colors.textSecondary,
  },
  cta: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '600',
    color: colors.accentPrimary,
  },
});
