/**
 * Pemutar video layar penuh untuk pesan video. Pemutar (expo-video) hanya dibuat saat modal terbuka dan dilepas
 * otomatis saat ditutup, jadi daftar chat tidak menahan decoder video.
 */

import React from 'react';
import { ActivityIndicator, Modal, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useEvent } from 'expo';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from './Icon';
import { spacing } from '../theme/spacing';

export interface VideoPlayerModalProps {
  visible: boolean;
  videoUrl: string | null;
  senderName?: string;
  onClose: () => void;
}

const PlayerBody: React.FC<{ videoUrl: string; senderName?: string; onClose: () => void }> = ({
  videoUrl,
  senderName,
  onClose,
}) => {
  const insets = useSafeAreaInsets();
  const player = useVideoPlayer({ uri: videoUrl }, (p) => {
    p.loop = false;
    p.play();
  });
  const { status, error } = useEvent(player, 'statusChange', { status: player.status, error: undefined });

  return (
    <View style={styles.root}>
      <VideoView
        player={player}
        style={styles.video}
        nativeControls
        contentFit="contain"
      />
      {status === 'loading' ? (
        <View style={styles.center} pointerEvents="none">
          <ActivityIndicator size="large" color="#ffffff" />
        </View>
      ) : null}
      {status === 'error' ? (
        <View style={styles.center}>
          <Icon name="alert" size={28} color="#ffffff" />
          <Text style={styles.errorText}>
            Video tidak dapat diputar{error?.message ? `: ${error.message}` : ''}. Periksa koneksi atau video sudah kedaluwarsa.
          </Text>
        </View>
      ) : null}
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]} pointerEvents="box-none">
        <TouchableOpacity
          onPress={onClose}
          style={styles.closeBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Tutup video"
        >
          <Icon name="close" size={22} color="#ffffff" />
        </TouchableOpacity>
        {senderName ? <Text style={styles.sender} numberOfLines={1}>{senderName}</Text> : null}
      </View>
    </View>
  );
};

export const VideoPlayerModal: React.FC<VideoPlayerModalProps> = ({ visible, videoUrl, senderName, onClose }) => {
  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      {visible && videoUrl ? (
        <>
          <StatusBar barStyle="light-content" />
          <PlayerBody videoUrl={videoUrl} senderName={senderName} onClose={onClose} />
        </>
      ) : null}
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  video: { flex: 1 },
  center: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  errorText: { color: '#ffffff', fontSize: 14, textAlign: 'center' },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sender: { flex: 1, color: '#ffffff', fontSize: 15, fontWeight: '600' },
});
