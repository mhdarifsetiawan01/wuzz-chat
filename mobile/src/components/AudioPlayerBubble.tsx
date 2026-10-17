/**
 * WuzzChat AudioPlayerBubble Component
 * Interactive WhatsApp-grade voice note audio player with animated waveform bars,
 * scrubbing/seeking support, playback speed switch (1x/1.5x/2x), and singleton playback coordination.
 * Uses official modern Expo SDK 57 expo-audio.
 * Conforms to frontend/DESIGN.md & WhatsApp Aurora theme.
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  GestureResponderEvent,
  LayoutChangeEvent,
} from 'react-native';
import { createAudioPlayer, AudioPlayer, AudioStatus } from 'expo-audio';
import { audioManager } from '../services/audioManager';
import { playOrReplayAudio } from '../services/audioPlayback';
import { mediaCache } from '../services/mediaCache';
import { mediaDownloadFeedback } from '../utils/mediaDownloadFeedback';
import { showAlert } from '../services/dialog';
import { useTheme, useThemedStyles, ColorTokens, ResolvedScheme } from '../theme';
import { getBubblePalette } from '../theme/bubblePalette';
import { IconText } from './IconText';

// Waveform bar heights mimicking human speech patterns (24 bars)
const WAVEFORM_HEIGHTS = [
  24, 40, 65, 30, 85, 45, 95, 70, 40, 60, 90, 50,
  75, 35, 80, 100, 60, 45, 70, 90, 55, 35, 75, 45,
];

export interface AudioPlayerBubbleProps {
  audioUrl: string;
  messageId?: string;
  fileName?: string;
  fileSize?: number;
  isSelf?: boolean;
  onLoaded?: () => void;
}

export const AudioPlayerBubble: React.FC<AudioPlayerBubbleProps> = ({
  audioUrl,
  messageId,
  fileName,
  fileSize,
  isSelf = false,
  onLoaded,
}) => {
  const { colors, scheme } = useTheme();
  const bubblePalette = getBubblePalette(scheme);
  const styles = useThemedStyles(makeStyles);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackRate, setPlaybackRate] = useState<1 | 1.5 | 2>(1);
  const [waveformWidth, setWaveformWidth] = useState(140);

  const playerRef = useRef<AudioPlayer | null>(null);
  const finishedRef = useRef(false);
  const isMountedRef = useRef(true);

  const openingRef = useRef(false);
  const epochRef = useRef(0);
  const downloadRef = useRef<AbortController | null>(null);
  const loadedRef = useRef(onLoaded);
  loadedRef.current = onLoaded;

  // Track component mount status and cleanup player on unmount
  useEffect(() => {
    isMountedRef.current = true;
    epochRef.current++;
    openingRef.current = false;
    finishedRef.current = false;
    setIsPlaying(false);
    setIsLoading(false);
    setDownloadProgress(null);
    setCurrentTime(0);
    setDuration(0);
    return () => {
      epochRef.current++;
      downloadRef.current?.abort();
      isMountedRef.current = false;
      if (playerRef.current) {
        try {
          playerRef.current.pause();
          playerRef.current.release();
        } catch {}
        playerRef.current = null;
      }
      audioManager.unregisterPlayer(audioUrl);
    };
  }, [audioUrl, messageId]);

  // Play / Pause toggle handler
  const handleTogglePlay = async () => {
    if (openingRef.current) return;
    openingRef.current = true;
    const epoch = epochRef.current;
    const current = () => isMountedRef.current && epochRef.current === epoch;
    try {
      if (isPlaying) {
        if (playerRef.current) {
          playerRef.current.pause();
        }
        setIsPlaying(false);
        audioManager.unregisterPlayer(audioUrl);
        return;
      }

      const playbackRequest = audioManager.beginPlaybackRequest();
      setIsLoading(true);
      await audioManager.configureAudioMode(false);
      if (!current() || !audioManager.isCurrentPlaybackRequest(playbackRequest)) return;

      if (!playerRef.current) {
        setIsLoading(true);
        const controller = new AbortController();
        downloadRef.current = controller;
        const local = await mediaCache.downloadToCache(audioUrl, messageId || '', fileName, {
          expectedSize: fileSize,
          allowLocalSource: isSelf,
          signal: controller.signal,
          onProgress: (progress) => { if (current()) setDownloadProgress(progress); },
        });
        if (!current()) return;
        setDownloadProgress(null);
        loadedRef.current?.();
        if (!audioManager.isCurrentPlaybackRequest(playbackRequest)) return;
        const player = createAudioPlayer(local);
        playerRef.current = player;

        player.addListener('playbackStatusUpdate', (status: AudioStatus) => {
          if (!current()) return;
          if (status.error) {
            setIsPlaying(false);
            setIsLoading(false);
            player.release();
            if (playerRef.current === player) playerRef.current = null;
            audioManager.unregisterPlayer(audioUrl);
            showAlert('Gagal Memutar Audio', 'Berkas audio tidak dapat dibuka. Ketuk untuk mencoba lagi.');
            return;
          }
          setIsPlaying(status.playing);
          setIsLoading(status.isBuffering);

          if (status.duration) {
            setDuration(status.duration);
          }

          if (status.currentTime !== undefined) {
            setCurrentTime(status.currentTime);
          }

          if (status.didJustFinish) {
            finishedRef.current = true;
            setIsPlaying(false);
            setCurrentTime(0);
            audioManager.unregisterPlayer(audioUrl);
          }
        });

        if (typeof player.setPlaybackRate === 'function') {
          player.setPlaybackRate(playbackRate);
        } else {
          try { (player as any).playbackRate = playbackRate; } catch {}
        }
        if (!await playOrReplayAudio(player, false, () => current() && audioManager.isCurrentPlaybackRequest(playbackRequest))) return;
        finishedRef.current = false;
        setIsPlaying(true);
        setIsLoading(false);

        audioManager.registerActivePlayer(audioUrl, player, () => {
          if (isMountedRef.current) {
            setIsPlaying(false);
          }
        });
      } else {
        const player = playerRef.current;
        if (typeof player.setPlaybackRate === 'function') {
          player.setPlaybackRate(playbackRate);
        } else {
          try { (player as any).playbackRate = playbackRate; } catch {}
        }
        if (!await playOrReplayAudio(player, finishedRef.current, () => current() && audioManager.isCurrentPlaybackRequest(playbackRequest))) return;
        finishedRef.current = false;
        setIsPlaying(true);
        audioManager.registerActivePlayer(audioUrl, player, () => {
          if (isMountedRef.current) setIsPlaying(false);
        });
      }
    } catch (err) {
      if (current()) {
        const feedback = mediaDownloadFeedback(err, 'Audio');
        if (feedback) showAlert(feedback.title, feedback.message);
        setIsPlaying(false);
        setIsLoading(false);
      }
    } finally {
      if (current()) {
        openingRef.current = false;
        setDownloadProgress(null);
        setIsLoading(false);
      }
    }
  };

  // Playback speed cycle: 1x -> 1.5x -> 2x -> 1x
  const handleToggleSpeed = () => {
    const rates: Array<1 | 1.5 | 2> = [1, 1.5, 2];
    const nextRate = rates[(rates.indexOf(playbackRate) + 1) % rates.length];
    setPlaybackRate(nextRate);

    if (playerRef.current) {
      if (typeof playerRef.current.setPlaybackRate === 'function') {
        playerRef.current.setPlaybackRate(nextRate);
      } else {
        try { (playerRef.current as any).playbackRate = nextRate; } catch {}
      }
    }
  };

  // Measure waveform layout width for touch seeking calculation
  const handleWaveformLayout = (e: LayoutChangeEvent) => {
    const { width } = e.nativeEvent.layout;
    if (width > 0) {
      setWaveformWidth(width);
    }
  };

  // Seek on waveform touch / drag
  const handleWaveformTouch = (e: GestureResponderEvent) => {
    if (!duration || duration <= 0) return;
    const touchX = Math.max(0, Math.min(e.nativeEvent.locationX, waveformWidth));
    const seekRatio = touchX / waveformWidth;
    const targetSeconds = seekRatio * duration;

    setCurrentTime(targetSeconds);

    if (playerRef.current) {
      finishedRef.current = false;
      playerRef.current.seekTo(targetSeconds);
    }
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <View style={[styles.container, isSelf ? styles.selfContainer : styles.otherContainer]}>
      {/* Mic Badge Circle */}
      <View style={[styles.micBadge, isSelf ? styles.selfMicBadge : styles.otherMicBadge]}>
        <IconText style={styles.micBadgeIcon}>🎙️</IconText>
      </View>

      {/* Play / Pause / Buffering Button */}
      <TouchableOpacity
        style={[styles.playButton, isSelf ? styles.selfPlayButton : styles.otherPlayButton]}
        onPress={handleTogglePlay}
        activeOpacity={0.75}
        disabled={isLoading}
        accessibilityLabel={isLoading ? 'Mengunduh audio' : isPlaying ? 'Jeda audio' : 'Putar audio'}
        accessibilityState={{ disabled: isLoading, busy: isLoading }}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      >
        {isLoading ? (
          <ActivityIndicator size="small" color={isSelf ? bubblePalette.self.background : '#ffffff'} />
        ) : isPlaying ? (
          <IconText style={[styles.pauseIcon, isSelf && styles.playIconSelf]}>⏸</IconText>
        ) : (
          <IconText style={[styles.playIcon, isSelf && styles.playIconSelf]}>▶</IconText>
        )}
      </TouchableOpacity>

      {/* Waveform Scrubber & Time Details */}
      <View style={styles.rightContent}>
        {/* Interactive Waveform Bars */}
        <TouchableOpacity
          activeOpacity={1}
          onPress={handleWaveformTouch}
          onLayout={handleWaveformLayout}
          style={styles.waveformContainer}
        >
          {WAVEFORM_HEIGHTS.map((height, i) => {
            const barPercent = (i / WAVEFORM_HEIGHTS.length) * 100;
            const isFilled = progressPercent >= barPercent;
            return (
              <View
                key={i}
                style={[
                  styles.waveformBar,
                  {
                    height: Math.max(height * 0.26, 4),
                    backgroundColor: isFilled
                      ? isSelf
                      ? '#ffffff'
                      : colors.accentPrimary
                      : isSelf
                      ? 'rgba(255, 255, 255, 0.4)'
                      : colors.borderStrong,
                  },
                ]}
              />
            );
          })}
        </TouchableOpacity>

        {/* Info Row: Time & Speed */}
        <View style={styles.infoRow}>
          <Text style={[styles.timeText, isSelf && styles.timeTextSelf]}>
            {downloadProgress !== null ? `Mengunduh ${Math.round(downloadProgress * 100)}%` : isPlaying || currentTime > 0
              ? `${audioManager.formatTime(currentTime)} / ${audioManager.formatTime(duration)}`
              : audioManager.formatTime(duration || 0)}
          </Text>

          <TouchableOpacity
            style={[styles.speedButton, isSelf && styles.speedButtonSelf]}
            onPress={handleToggleSpeed}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[styles.speedText, isSelf && styles.speedTextSelf]}>{playbackRate}x</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const makeStyles = (colors: ColorTokens, scheme: ResolvedScheme) => {
  const bubblePalette = getBubblePalette(scheme);
  return StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 6,
    minWidth: 220,
    maxWidth: 290,
  },
  selfContainer: {
    backgroundColor: 'transparent',
  },
  otherContainer: {
    backgroundColor: 'transparent',
  },
  micBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  selfMicBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  otherMicBadge: {
    backgroundColor: colors.tintAccent10,
    borderWidth: 1,
    borderColor: colors.borderDefault,
  },
  micBadgeIcon: {
    fontSize: 18,
  },
  playButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  // Tombol putih di bubble biru; di bubble putih tetap biru identitas dengan ikon putih
  selfPlayButton: {
    backgroundColor: colors.bgSurface,
  },
  otherPlayButton: {
    backgroundColor: '#0a6cb8',
  },
  playIcon: {
    fontSize: 14,
    color: '#ffffff',
    marginLeft: 2, // Centering play triangle
  },
  playIconSelf: {
    color: bubblePalette.self.background,
  },
  pauseIcon: {
    fontSize: 14,
    color: '#ffffff',
  },
  rightContent: {
    flex: 1,
    justifyContent: 'center',
  },
  waveformContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 28,
    paddingVertical: 2,
  },
  waveformBar: {
    width: 2.8,
    borderRadius: 1.5,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  timeText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontVariant: ['tabular-nums'],
    fontWeight: '500',
  },
  timeTextSelf: {
    color: bubblePalette.self.textSecondary,
  },
  speedButton: {
    backgroundColor: colors.bgInput,
    borderRadius: 8,
    paddingVertical: 1,
    paddingHorizontal: 5,
  },
  speedButtonSelf: {
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
  },
  speedText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  speedTextSelf: {
    color: bubblePalette.self.text,
  },
});
};
