/**
 * WuzzChat Mobile - PostMedia
 * Grid/gambar tunggal untuk lampiran postingan. Ketuk membuka MediaViewerModal (zoom).
 * Hanya URL http/https yang dirender (defense-in-depth selain validasi server).
 */

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';

export interface PostMediaProps {
  urls?: string[];
  onPressImage: (url: string) => void;
  /** Mode baca: gambar penuh selebar layar, bukan grid kecil */
  large?: boolean;
}

const isHttpUrl = (u: string) => /^https?:\/\//i.test(u);

export const PostMedia: React.FC<PostMediaProps> = React.memo(({ urls, onPressImage, large }) => {
  const safe = (urls ?? []).filter(isHttpUrl).slice(0, 4);
  if (safe.length === 0) return null;

  if (large || safe.length === 1) {
    return (
      <View style={styles.stack}>
        {safe.map((url) => (
          <TouchableOpacity
            key={url}
            activeOpacity={0.9}
            onPress={() => onPressImage(url)}
            style={large ? styles.largeWrapper : styles.singleWrapper}
            accessibilityRole="imagebutton"
            accessibilityLabel="Perbesar gambar"
          >
            <Image source={{ uri: url }} style={styles.fill} contentFit={large ? 'contain' : 'cover'} transition={120} />
          </TouchableOpacity>
        ))}
      </View>
    );
  }

  return (
    <View style={styles.grid}>
      {safe.map((url, idx) => (
        <TouchableOpacity
          key={url}
          activeOpacity={0.9}
          onPress={() => onPressImage(url)}
          style={styles.gridWrapper}
          accessibilityRole="imagebutton"
          accessibilityLabel="Perbesar gambar"
        >
          <Image source={{ uri: url }} style={styles.fill} contentFit="cover" transition={120} />
          {idx === 3 && (urls?.length ?? 0) > 4 && (
            <View style={styles.moreOverlay}>
              <Text style={styles.moreText}>+{(urls?.length ?? 0) - 4}</Text>
            </View>
          )}
        </TouchableOpacity>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  stack: { gap: 8, marginBottom: 12 },
  singleWrapper: {
    width: '100%',
    height: 200,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#f1f5f9',
  },
  largeWrapper: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#f1f5f9',
  },
  fill: { width: '100%', height: '100%' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  gridWrapper: {
    width: '48.5%',
    height: 120,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#f1f5f9',
  },
  moreOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreText: { color: '#ffffff', fontSize: 18, fontWeight: '800' },
});
