/**
 * WuzzChat Mobile - MediaViewerModal
 * Interactive Fullscreen Media Viewer with Pinch-to-Zoom, Pan,
 * Double-Tap to Zoom, Swipe-Down to Dismiss, Cinematic Overlay, and Native Share.
 * Conforms to frontend/DESIGN.md & Aurora Dark Theme.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Animated,
  PanResponder,
  Dimensions,
  Share,
  StatusBar,
  GestureResponderEvent,
  PanResponderGestureState,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { IconText } from './IconText';
import { Icon } from './Icon';
import { spacing } from '../theme/spacing';

export interface MediaViewerModalProps {
  visible: boolean;
  mediaUrl: string | null;
  fileName?: string;
  caption?: string;
  senderName?: string;
  timestamp?: string;
  mediaType?: 'image' | 'video' | 'file';
  onClose: () => void;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Helper to calculate euclidean distance between 2 touches
function getTouchDistance(touches: any[]): number {
  if (touches.length < 2) return 0;
  const [t1, t2] = touches;
  const dx = t1.pageX - t2.pageX;
  const dy = t1.pageY - t2.pageY;
  return Math.hypot(dx, dy);
}

export const MediaViewerModal: React.FC<MediaViewerModalProps> = ({
  visible,
  mediaUrl,
  fileName,
  caption,
  senderName,
  timestamp,
  mediaType = 'image',
  onClose,
}) => {
  const insets = useSafeAreaInsets();
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [showControls, setShowControls] = useState(true);

  // Animated values
  const scale = useRef(new Animated.Value(1)).current;
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const controlsOpacity = useRef(new Animated.Value(1)).current;

  // Mutable gesture tracking references
  const currentScaleRef = useRef(1);
  const currentPanRef = useRef({ x: 0, y: 0 });
  const initialTouchDistanceRef = useRef<number | null>(null);
  const initialScaleOnTouchRef = useRef(1);
  const lastTapRef = useRef<{ time: number; x: number; y: number }>({ time: 0, x: 0, y: 0 });
  const tapTimeoutRef = useRef<any>(null);
  const isPinchingRef = useRef(false);
  const isSwipingDismissRef = useRef(false);

  // Sync animated values with ref trackers
  useEffect(() => {
    const scaleListener = scale.addListener((v) => {
      currentScaleRef.current = v.value;
    });
    const panListener = pan.addListener((v) => {
      currentPanRef.current = v;
    });
    return () => {
      scale.removeListener(scaleListener);
      pan.removeListener(panListener);
    };
  }, [scale, pan]);

  // Reset transforms whenever modal opens/closes or URL changes
  const resetTransforms = useCallback(() => {
    currentScaleRef.current = 1;
    currentPanRef.current = { x: 0, y: 0 };
    scale.setValue(1);
    pan.setValue({ x: 0, y: 0 });
    setIsLoading(true);
    setHasError(false);
    setShowControls(true);
    controlsOpacity.setValue(1);
  }, [scale, pan, controlsOpacity]);

  useEffect(() => {
    if (visible) {
      resetTransforms();
    }
  }, [visible, mediaUrl, resetTransforms]);

  // Toggle cinematic overlay controls with fade animation
  const toggleControls = useCallback(() => {
    setShowControls((prev) => {
      const next = !prev;
      Animated.timing(controlsOpacity, {
        toValue: next ? 1 : 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
      return next;
    });
  }, [controlsOpacity]);

  // Double tap to zoom toggle (1x <-> 2.5x)
  const handleDoubleTap = useCallback(
    (_x: number, _y: number) => {
      if (currentScaleRef.current > 1.2) {
        // Zoom out to normal 1x
        Animated.parallel([
          Animated.spring(scale, {
            toValue: 1,
            friction: 7,
            useNativeDriver: true,
          }),
          Animated.spring(pan, {
            toValue: { x: 0, y: 0 },
            friction: 7,
            useNativeDriver: true,
          }),
        ]).start();
      } else {
        // Zoom in to 2.5x
        Animated.spring(scale, {
          toValue: 2.5,
          friction: 7,
          useNativeDriver: true,
        }).start();
      }
    },
    [scale, pan]
  );

  // PanResponder for multi-touch pinch, 1-finger pan, and swipe-down dismiss
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Capture move if moving more than 3px or if 2 fingers are touching
        return (
          Math.abs(gestureState.dx) > 3 ||
          Math.abs(gestureState.dy) > 3 ||
          gestureState.numberActiveTouches > 1
        );
      },
      onPanResponderGrant: (evt: GestureResponderEvent) => {
        const touches = evt.nativeEvent.touches;
        if (touches.length === 2) {
          isPinchingRef.current = true;
          initialTouchDistanceRef.current = getTouchDistance(touches);
          initialScaleOnTouchRef.current = currentScaleRef.current;
        } else {
          isPinchingRef.current = false;
        }
      },
      onPanResponderMove: (evt: GestureResponderEvent, gestureState: PanResponderGestureState) => {
        const touches = evt.nativeEvent.touches;

        // MULTI-TOUCH PINCH TO ZOOM
        if (touches.length === 2 && initialTouchDistanceRef.current) {
          const currentDistance = getTouchDistance(touches);
          const ratio = currentDistance / initialTouchDistanceRef.current;
          let newScale = initialScaleOnTouchRef.current * ratio;
          // Clamp between 0.75x (slight bounce back) and 4.5x
          newScale = Math.max(0.75, Math.min(newScale, 4.5));
          scale.setValue(newScale);
          return;
        }

        // SINGLE TOUCH
        if (touches.length === 1) {
          if (currentScaleRef.current > 1.05) {
            // Panning when zoomed in
            pan.setValue({
              x: currentPanRef.current.x + gestureState.dx * 0.5,
              y: currentPanRef.current.y + gestureState.dy * 0.5,
            });
          } else {
            // At normal scale: detect Swipe-Down to Dismiss
            if (gestureState.dy > 10 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx * 1.2)) {
              isSwipingDismissRef.current = true;
              pan.setValue({
                x: 0,
                y: gestureState.dy,
              });
              // Subtle scale down during swipe dismiss
              const dismissScale = Math.max(0.85, 1 - gestureState.dy / (SCREEN_HEIGHT * 2));
              scale.setValue(dismissScale);
            }
          }
        }
      },
      onPanResponderRelease: (evt: GestureResponderEvent, gestureState: PanResponderGestureState) => {
        initialTouchDistanceRef.current = null;
        isPinchingRef.current = false;

        // If swiping down to dismiss and pulled down past threshold
        if (isSwipingDismissRef.current) {
          isSwipingDismissRef.current = false;
          if (gestureState.dy > 110 || gestureState.vy > 0.8) {
            Animated.timing(pan.y, {
              toValue: SCREEN_HEIGHT,
              duration: 200,
              useNativeDriver: true,
            }).start(() => {
              onClose();
            });
            return;
          } else {
            // Snap back up
            Animated.parallel([
              Animated.spring(pan, {
                toValue: { x: 0, y: 0 },
                friction: 7,
                useNativeDriver: true,
              }),
              Animated.spring(scale, {
                toValue: 1,
                friction: 7,
                useNativeDriver: true,
              }),
            ]).start();
            return;
          }
        }

        // If scale released below 1x, spring back to 1x
        if (currentScaleRef.current < 1) {
          Animated.parallel([
            Animated.spring(scale, {
              toValue: 1,
              friction: 7,
              useNativeDriver: true,
            }),
            Animated.spring(pan, {
              toValue: { x: 0, y: 0 },
              friction: 7,
              useNativeDriver: true,
            }),
          ]).start();
          return;
        }

        // If scale released above 4x, clamp back to 4x
        if (currentScaleRef.current > 4) {
          Animated.spring(scale, {
            toValue: 4,
            friction: 7,
            useNativeDriver: true,
          }).start();
        }

        // Check for Single Tap vs Double Tap
        const now = Date.now();
        const touchX = evt.nativeEvent.pageX;
        const touchY = evt.nativeEvent.pageY;
        const timeDiff = now - lastTapRef.current.time;
        const distDiff = Math.hypot(
          touchX - lastTapRef.current.x,
          touchY - lastTapRef.current.y
        );

        if (
          Math.abs(gestureState.dx) < 8 &&
          Math.abs(gestureState.dy) < 8
        ) {
          if (timeDiff < 300 && distDiff < 40) {
            // Double tap detected!
            if (tapTimeoutRef.current) {
              clearTimeout(tapTimeoutRef.current);
              tapTimeoutRef.current = null;
            }
            handleDoubleTap(touchX, touchY);
            lastTapRef.current = { time: 0, x: 0, y: 0 };
          } else {
            // Single tap candidate
            lastTapRef.current = { time: now, x: touchX, y: touchY };
            tapTimeoutRef.current = setTimeout(() => {
              toggleControls();
              tapTimeoutRef.current = null;
            }, 300);
          }
        }
      },
    })
  ).current;

  // Format timestamp helper
  const formattedTime = () => {
    if (!timestamp) return '';
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    } catch {
      return '';
    }
  };

  // Native Share Sheet trigger
  const handleShare = async () => {
    if (!mediaUrl) return;
    try {
      await Share.share({
        title: fileName || 'Media Wuzz Chat',
        message: caption ? `${caption}\n${mediaUrl}` : mediaUrl,
        url: mediaUrl,
      });
    } catch (err) {
      console.warn('[MediaViewerModal] Share error:', err);
    }
  };

  if (!visible || !mediaUrl) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <StatusBar barStyle="light-content" backgroundColor="rgba(0,0,0,0.95)" />

      <View style={styles.backdrop}>
        {/* Pinch-and-Pan Interactive Image Layer */}
        <Animated.View
          style={[
            styles.imageContainer,
            {
              transform: [
                { scale },
                { translateX: pan.x },
                { translateY: pan.y },
              ],
            },
          ]}
          {...panResponder.panHandlers}
        >
          <Image
            source={{ uri: mediaUrl }}
            style={styles.image}
            resizeMode="contain"
            onLoadStart={() => setIsLoading(true)}
            onLoad={() => {
              setIsLoading(false);
              setHasError(false);
            }}
            onError={() => {
              setIsLoading(false);
              setHasError(true);
            }}
          />

          {isLoading ? (
            <View style={styles.loaderOverlay} pointerEvents="none">
              <ActivityIndicator size="large" color={colors.accentPrimary} />
            </View>
          ) : null}

          {hasError ? (
            <View style={styles.errorOverlay} pointerEvents="none">
              <IconText style={styles.errorIcon}>⚠️</IconText>
              <Text style={styles.errorTitle}>Gagal Memuat Media</Text>
              <Text style={styles.errorSubtitle}>
                Berkas tidak dapat ditampilkan atau telah kedaluwarsa.
              </Text>
            </View>
          ) : null}
        </Animated.View>

        {/* Top Header Overlay (Cinematic Fade) */}
        <Animated.View
          style={[
            styles.topOverlay,
            {
              paddingTop: Math.max(insets.top + spacing.xs, 36),
              opacity: controlsOpacity,
            },
          ]}
          pointerEvents={showControls ? 'auto' : 'none'}
        >
          <View style={styles.headerRow}>
            {/* Close Button ✕ */}
            <TouchableOpacity
              style={styles.iconButton}
              onPress={onClose}
              hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
              activeOpacity={0.7}
            >
              <Icon name="close" size={20} color={colors.textPrimary} />
            </TouchableOpacity>

            {/* Info Center */}
            <View style={styles.headerInfo}>
              <Text style={styles.headerTitle} numberOfLines={1}>
                {senderName || fileName || 'Foto'}
              </Text>
              {timestamp ? (
                <Text style={styles.headerSubtitle}>{formattedTime()}</Text>
              ) : null}
            </View>

            {/* Action Buttons: Native Share */}
            <TouchableOpacity
              style={styles.iconButton}
              onPress={handleShare}
              hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
              activeOpacity={0.7}
            >
              <IconText style={styles.shareIconText}>📤</IconText>
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* Bottom Caption Overlay (Cinematic Fade) */}
        {caption ? (
          <Animated.View
            style={[
              styles.bottomOverlay,
              {
                paddingBottom: Math.max(insets.bottom + spacing.md, 32),
                opacity: controlsOpacity,
              },
            ]}
            pointerEvents={showControls ? 'auto' : 'none'}
          >
            <View style={styles.captionContainer}>
              <Text style={styles.captionText}>{caption}</Text>
            </View>
          </Animated.View>
        ) : null}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageContainer: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  loaderOverlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorOverlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  errorIcon: {
    fontSize: 42,
    marginBottom: spacing.sm,
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  errorSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  topOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(9, 13, 22, 0.75)',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  shareIconText: {
    fontSize: 18,
    color: colors.textPrimary,
  },
  headerInfo: {
    flex: 1,
    marginHorizontal: spacing.md,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  headerSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 1,
  },
  bottomOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(9, 13, 22, 0.85)',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  captionContainer: {
    maxHeight: 120,
  },
  captionText: {
    fontSize: 14,
    color: colors.textPrimary,
    lineHeight: 20,
  },
});
