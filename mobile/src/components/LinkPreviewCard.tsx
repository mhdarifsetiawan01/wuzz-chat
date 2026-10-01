/**
 * WuzzChat Mobile - LinkPreviewCard Component
 * Menampilkan kartu pratinjau OpenGraph / oEmbed (thumbnail, favicon, site name, title, description)
 * Dilengkapi in-memory caching untuk menjaga performa rendering 60 FPS di FlatList.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { LinkPreview } from '../api/types';
import { fetchLinkPreview } from '../api/linkPreview';
import { safeOpenUrl } from '../utils/linkUtils';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';

interface LinkPreviewCardProps {
  url: string;
  isSelf?: boolean;
}

export const LinkPreviewCard: React.FC<LinkPreviewCardProps> = ({ url, isSelf = false }) => {
  const [preview, setPreview] = useState<LinkPreview | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [imageError, setImageError] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setImageError(false);

    fetchLinkPreview(url)
      .then((data) => {
        if (isMounted) {
          setPreview(data);
        }
      })
      .catch(() => {
        // Silent catch: gagal scrape cukup sembunyikan kartu
      })
      .finally(() => {
        if (isMounted) {
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [url]);

  // Jika sedang memuat pertama kali, tampilkan skeleton ringkas
  if (loading) {
    return (
      <View style={[styles.skeletonContainer, isSelf ? styles.skeletonSelf : styles.skeletonOther]}>
        <ActivityIndicator size="small" color={isSelf ? 'rgba(255,255,255,0.7)' : colors.accentPrimary} />
        <Text style={[styles.skeletonText, isSelf && styles.skeletonTextSelf]}>
          Memuat pratinjau...
        </Text>
      </View>
    );
  }

  // Jika tidak ada data atau tidak ada judul, sembunyikan
  if (!preview || !preview.title) {
    return null;
  }

  // Tentukan host fallback jika site_name kosong
  let hostname = preview.site_name;
  if (!hostname) {
    try {
      const parsed = new URL(url);
      hostname = parsed.hostname.replace(/^www\./, '');
    } catch {
      hostname = url;
    }
  }

  return (
    <TouchableOpacity
      style={[styles.card, isSelf ? styles.cardSelf : styles.cardOther]}
      activeOpacity={0.85}
      onPress={() => safeOpenUrl(url)}
    >
      {/* Thumbnail Gambar Web */}
      {preview.image && !imageError ? (
        <View style={styles.imageWrapper}>
          <Image
            source={{ uri: preview.image }}
            style={styles.thumbnail}
            resizeMode="cover"
            onError={() => setImageError(true)}
          />
        </View>
      ) : null}

      <View style={styles.contentCol}>
        {/* Header: Favicon & Domain */}
        <View style={styles.headerRow}>
          {preview.favicon ? (
            <Image
              source={{ uri: preview.favicon }}
              style={styles.favicon}
              resizeMode="contain"
            />
          ) : (
            <Text style={styles.globeIcon}>🌐</Text>
          )}
          <Text
            style={[styles.siteName, isSelf && styles.siteNameSelf]}
            numberOfLines={1}
          >
            {hostname}
          </Text>
        </View>

        {/* Judul Web */}
        <Text
          style={[styles.title, isSelf && styles.titleSelf]}
          numberOfLines={2}
        >
          {preview.title}
        </Text>

        {/* Deskripsi Singkat */}
        {preview.description ? (
          <Text
            style={[styles.description, isSelf && styles.descriptionSelf]}
            numberOfLines={2}
          >
            {preview.description}
          </Text>
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
  },
  cardSelf: {
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },
  cardOther: {
    backgroundColor: colors.bgInput,
    borderColor: colors.borderDefault,
  },
  imageWrapper: {
    width: '100%',
    height: 125,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  contentCol: {
    padding: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 3,
  },
  favicon: {
    width: 13,
    height: 13,
    borderRadius: 2,
    marginRight: 5,
  },
  globeIcon: {
    fontSize: 11,
    marginRight: 5,
  },
  siteName: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'lowercase',
    flex: 1,
  },
  siteNameSelf: {
    color: 'rgba(255, 255, 255, 0.85)',
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
    lineHeight: 17,
    marginBottom: 3,
  },
  titleSelf: {
    color: colors.textOnAccent,
  },
  description: {
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 15,
  },
  descriptionSelf: {
    color: 'rgba(255, 255, 255, 0.75)',
  },
  skeletonContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 8,
    marginTop: spacing.xs,
  },
  skeletonSelf: {
    backgroundColor: 'rgba(0, 0, 0, 0.06)',
  },
  skeletonOther: {
    backgroundColor: 'rgba(0, 0, 0, 0.03)',
  },
  skeletonText: {
    fontSize: 11,
    color: colors.textMuted,
    marginLeft: 6,
    fontStyle: 'italic',
  },
  skeletonTextSelf: {
    color: 'rgba(255, 255, 255, 0.7)',
  },
});
