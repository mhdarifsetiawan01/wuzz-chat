/**
 * Kartu video di bubble chat: thumbnail + tombol putar + ukuran berkas.
 * Video TIDAK dimuat di sini (hemat kuota dan memori); pemutaran terjadi di VideoPlayerModal saat diketuk.
 */

import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { Icon } from './Icon';
import { useThemedStyles, ColorTokens } from '../theme';
import { formatVideoSize, getVideoThumbnailUrl } from '../utils/videoMedia';

export interface VideoMessageCardProps {
  videoUrl: string;
  /** Pratinjau lokal (pesan yang baru kita kirim). */
  localThumbUri?: string;
  fileSize?: number;
  onPress: () => void;
  onLongPress?: () => void;
}

export const VideoMessageCard: React.FC<VideoMessageCardProps> = ({
  videoUrl,
  localThumbUri,
  fileSize,
  onPress,
  onLongPress,
}) => {
  const styles = useThemedStyles(makeStyles);
  const [thumbFailed, setThumbFailed] = useState(false);
  const thumbUri = localThumbUri || getVideoThumbnailUrl(videoUrl);
  const sizeLabel = formatVideoSize(fileSize);

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={280}
      style={styles.container}
      accessibilityRole="button"
      accessibilityLabel={`Putar video${sizeLabel ? `, ${sizeLabel}` : ''}`}
    >
      {thumbUri && !thumbFailed ? (
        <Image
          source={{ uri: thumbUri }}
          style={styles.thumb}
          contentFit="cover"
          recyclingKey={thumbUri}
          onError={() => setThumbFailed(true)}
        />
      ) : (
        <View style={[styles.thumb, styles.placeholder]}>
          <Icon name="video" size={36} color="rgba(255,255,255,0.55)" />
        </View>
      )}
      <View style={styles.playWrap} pointerEvents="none">
        <View style={styles.playCircle}>
          <Icon name="play" size={26} color="#ffffff" />
        </View>
      </View>
      <View style={styles.sizeChip} pointerEvents="none">
        <Icon name="video" size={12} color="#ffffff" />
        {sizeLabel ? <Text style={styles.sizeText}>{sizeLabel}</Text> : null}
      </View>
    </TouchableOpacity>
  );
};

const makeStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    container: {
      width: 240,
      height: 180,
      borderRadius: 10,
      overflow: 'hidden',
      backgroundColor: colors.bgInput,
    },
    thumb: {
      width: '100%',
      height: '100%',
    },
    placeholder: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#1e293b',
    },
    playWrap: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
    playCircle: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: 'rgba(0,0,0,0.55)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    sizeChip: {
      position: 'absolute',
      left: 8,
      bottom: 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderRadius: 10,
      backgroundColor: 'rgba(0,0,0,0.5)',
    },
    sizeText: {
      color: '#ffffff',
      fontSize: 11,
      fontWeight: '600',
    },
  });
