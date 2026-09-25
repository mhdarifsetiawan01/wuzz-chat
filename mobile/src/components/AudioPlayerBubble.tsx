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
import { colors } from '../theme/colors';

// Waveform bar heights mimicking human speech patterns (24 bars)
const WAVEFORM_HEIGHTS = [
  24, 40, 65, 30, 85, 45, 95, 70, 40, 60, 90, 50,
  75, 35, 80, 100, 60, 45, 70, 90, 55, 35, 75, 45,
];

export interface AudioPlayerBubbleProps {
  audioUrl: string;
  fileName?: string;
  isSelf?: boolean;
  onLoaded?: () => void;
}

export const AudioPlayerBubble: React.FC<AudioPlayerBubbleProps> = ({
  audioUrl,
  isSelf = false,
  onLoaded,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackRate, setPlaybackRate] = useState<1 | 1.5 | 2>(1);
  const [waveformWidth, setWaveformWidth] = useState(140);

  const playerRef = useRef<AudioPlayer | null>(null);
  const isMountedRef = useRef(true);

  // Notify parent once on load for store-and-forward ACK
  useEffect(() => {
    onLoaded?.();
  }, [onLoaded]);

  // Track component mount status and cleanup player on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
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
  }, [audioUrl]);

  // Play / Pause toggle handler
  const handleTogglePlay = async () => {
    try {
      if (isPlaying) {
        if (playerRef.current) {
          playerRef.current.pause();
        }
        setIsPlaying(false);
        audioManager.unregisterPlayer(audioUrl);
        return;
      }

      await audioManager.configureAudioMode(false);

      if (!playerRef.current) {
        setIsLoading(true);
        const player = createAudioPlayer(audioUrl);
        playerRef.current = player;

        player.addListener('playbackStatusUpdate', (status: AudioStatus) => {
          if (!isMountedRef.current) return;
          setIsPlaying(status.playing);
          setIsLoading(status.isBuffering);

          if (status.duration) {
            setDuration(status.duration);
          }

          if (status.currentTime !== undefined) {
            setCurrentTime(status.currentTime);
          }

          if (status.didJustFinish) {
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
        player.play();
        setIsPlaying(true);
        setIsLoading(false);

        audioManager.registerActivePlayer(audioUrl, player, () => {
          if (isMountedRef.current) {
            setIsPlaying(false);
          }
        });
      } else {
        const player = playerRef.current;
        audioManager.registerActivePlayer(audioUrl, player, () => {
          if (isMountedRef.current) {
            setIsPlaying(false);
          }
        });
        if (typeof player.setPlaybackRate === 'function') {
          player.setPlaybackRate(playbackRate);
        } else {
          try { (player as any).playbackRate = playbackRate; } catch {}
        }
        player.play();
        setIsPlaying(true);
      }
    } catch (err: any) {
      console.warn('[AudioPlayerBubble] Toggle play failed:', err);
      if (isMountedRef.current) {
        setIsPlaying(false);
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
      playerRef.current.seekTo(targetSeconds);
    }
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <View style={[styles.container, isSelf ? styles.selfContainer : styles.otherContainer]}>
      {/* Mic Badge Circle */}
      <View style={[styles.micBadge, isSelf ? styles.selfMicBadge : styles.otherMicBadge]}>
        <Text style={styles.micBadgeIcon}>🎙️</Text>
      </View>

      {/* Play / Pause / Buffering Button */}
      <TouchableOpacity
        style={[styles.playButton, isSelf ? styles.selfPlayButton : styles.otherPlayButton]}
        onPress={handleTogglePlay}
        activeOpacity={0.75}
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator size="small" color="#ffffff" />
        ) : isPlaying ? (
          <Text style={styles.pauseIcon}>⏸</Text>
        ) : (
          <Text style={styles.playIcon}>▶</Text>
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
                      ? colors.accentPrimary
                      : 'rgba(255, 255, 255, 0.25)',
                  },
                ]}
              />
            );
          })}
        </TouchableOpacity>

        {/* Info Row: Time & Speed */}
        <View style={styles.infoRow}>
          <Text style={styles.timeText}>
            {isPlaying || currentTime > 0
              ? `${audioManager.formatTime(currentTime)} / ${audioManager.formatTime(duration)}`
              : audioManager.formatTime(duration || 0)}
          </Text>

          <TouchableOpacity
            style={styles.speedButton}
            onPress={handleToggleSpeed}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.speedText}>{playbackRate}x</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
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
    backgroundColor: colors.tintAccent20,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  otherMicBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: colors.borderSubtle,
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
  selfPlayButton: {
    backgroundColor: colors.accentPrimary,
  },
  otherPlayButton: {
    backgroundColor: colors.accentPrimary,
  },
  playIcon: {
    fontSize: 14,
    color: '#ffffff',
    marginLeft: 2, // Centering play triangle
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
  speedButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
    paddingVertical: 1,
    paddingHorizontal: 5,
  },
  speedText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textPrimary,
  },
});
