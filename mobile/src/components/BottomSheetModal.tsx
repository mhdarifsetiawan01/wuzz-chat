/**
 * WuzzChat Mobile UI - BottomSheetModal & ActionMenuItem
 * Aurora Dark Mode action bottom sheet with smooth spring animations,
 * swipe-to-dismiss gesture, and safe-area padding compliance.
 */

import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  Modal,
  PanResponder,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, shadows, spacing, typography } from '../theme';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export interface BottomSheetModalProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

export const BottomSheetModal: React.FC<BottomSheetModalProps> = ({
  visible,
  onClose,
  title,
  children,
}) => {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  // Open & Close animations
  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.spring(translateY, {
          toValue: 0,
          damping: 24,
          mass: 0.9,
          stiffness: 260,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: SCREEN_HEIGHT,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, translateY, backdropOpacity]);

  const handleDismiss = () => {
    Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: SCREEN_HEIGHT,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onClose();
    });
  };

  // PanResponder for drag down to dismiss
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return gestureState.dy > 5;
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          translateY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 80 || gestureState.vy > 0.6) {
          handleDismiss();
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            damping: 20,
            stiffness: 250,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  if (!visible) return null;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      onRequestClose={handleDismiss}
      statusBarTranslucent
    >
      <View
        style={[
          styles.modalRoot,
          {
            paddingTop: Math.max(insets.top, 24) + spacing.lg,
          },
        ]}
      >
        {/* Backdrop */}
        <TouchableWithoutFeedback onPress={handleDismiss}>
          <Animated.View
            style={[
              styles.backdrop,
              {
                opacity: backdropOpacity,
              },
            ]}
          />
        </TouchableWithoutFeedback>

        {/* Bottom Sheet Card */}
        <Animated.View
          style={[
            styles.sheetCard,
            {
              paddingBottom: Math.max(insets.bottom, spacing.lg),
              transform: [{ translateY }],
            },
          ]}
        >
          {/* Drag Handle Area */}
          <View {...panResponder.panHandlers} style={styles.dragHandleContainer}>
            <View style={styles.dragHandle} />
            {title ? (
              <View style={styles.titleRow}>
                <Text style={styles.sheetTitle}>{title}</Text>
                <TouchableOpacity
                  onPress={handleDismiss}
                  style={styles.closeButton}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityLabel="Tutup"
                >
                  <Text style={styles.closeIcon}>✕</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>

          {/* Sheet Content */}
          <View style={styles.sheetBody}>{children}</View>
        </Animated.View>
      </View>
    </Modal>
  );
};

export interface ActionMenuItemProps {
  icon: string | React.ReactNode;
  label: string;
  subtitle?: string;
  onPress: () => void;
  destructive?: boolean;
  badge?: string | number;
}

export const ActionMenuItem: React.FC<ActionMenuItemProps> = ({
  icon,
  label,
  subtitle,
  onPress,
  destructive = false,
  badge,
}) => {
  return (
    <TouchableOpacity
      style={[styles.menuItem, destructive && styles.menuItemDestructive]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
    >
      <View style={[styles.menuIconContainer, destructive && styles.menuIconContainerDestructive]}>
        {typeof icon === 'string' ? (
          <Text style={styles.menuIconText}>{icon}</Text>
        ) : (
          icon
        )}
      </View>
      <View style={styles.menuTextContainer}>
        <Text style={[styles.menuLabel, destructive && styles.menuLabelDestructive]}>
          {label}
        </Text>
        {subtitle ? <Text style={styles.menuSubtitle}>{subtitle}</Text> : null}
      </View>
      {badge !== undefined && (
        <View style={styles.badgeContainer}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.bgOverlay,
  },
  sheetCard: {
    backgroundColor: colors.bgCard,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    borderBottomWidth: 0,
    maxHeight: '100%',
    flexShrink: 1,
    ...shadows.modal,
  },
  dragHandleContainer: {
    alignItems: 'center',
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.textMuted,
    opacity: 0.4,
    marginBottom: spacing.sm,
  },
  titleRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  sheetTitle: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: colors.tintAccent10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeIcon: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: 'bold',
  },
  sheetBody: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    flexShrink: 1,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  menuItemDestructive: {
    borderBottomWidth: 0,
    marginTop: spacing.xs,
  },
  menuIconContainer: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: colors.tintAccent10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  menuIconContainerDestructive: {
    backgroundColor: colors.tintError10,
  },
  menuIconText: {
    fontSize: 18,
  },
  menuTextContainer: {
    flex: 1,
  },
  menuLabel: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  menuLabelDestructive: {
    color: colors.colorError,
  },
  menuSubtitle: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  badgeContainer: {
    backgroundColor: colors.unreadBadgeBg,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  badgeText: {
    ...typography.caption,
    color: colors.unreadBadgeText,
    fontWeight: 'bold',
  },
});
