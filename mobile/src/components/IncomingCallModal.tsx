/**
 * Incoming Call Modal Component (Aurora Dark Mode)
 * Displays incoming WebRTC 1-on-1 voice call prompt with caller identity,
 * pulsing ring animation, and Accept / Reject action buttons.
 * Reference: docs/plans/active/DECISION_LOG.md DEC-M28 & DEC-M30
 */

import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useCall } from '../context';
import { colors, radius, spacing, typography } from '../theme';
import { Avatar } from './Avatar';

export const IncomingCallModal: React.FC = () => {
  const { activeCall, acceptCall, rejectCall } = useCall();
  const isVisible = activeCall?.status === 'incoming_ringing';

  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isVisible) {
      const pulseLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.15,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      );
      pulseLoop.start();
      return () => pulseLoop.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isVisible, pulseAnim]);

  if (!isVisible || !activeCall) return null;

  return (
    <Modal
      visible={isVisible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={rejectCall}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Pulsing Avatar Area */}
          <View style={styles.avatarSection}>
            <Animated.View
              style={[
                styles.pulseGlow,
                {
                  transform: [{ scale: pulseAnim }],
                },
              ]}
            />
            <Avatar
              name={activeCall.peerNickname || 'Pengguna'}
              avatarUrl={activeCall.peerAvatar}
              size={96}
            />
          </View>

          {/* Caller Details */}
          <Text style={styles.callerName} numberOfLines={1}>
            {activeCall.peerNickname || 'Pengguna WuzzChat'}
          </Text>
          <View style={styles.callBadge}>
            <Text style={styles.callBadgeIcon}>📞</Text>
            <Text style={styles.callBadgeText}>Panggilan Suara Masuk...</Text>
          </View>

          {/* Action Buttons */}
          <View style={styles.actionRow}>
            {/* Reject Button */}
            <TouchableOpacity
              style={[styles.actionButton, styles.rejectButton]}
              onPress={rejectCall}
              activeOpacity={0.8}
            >
              <Text style={styles.actionIcon}>✕</Text>
              <Text style={styles.actionLabel}>Tolak</Text>
            </TouchableOpacity>

            {/* Accept Button */}
            <TouchableOpacity
              style={[styles.actionButton, styles.acceptButton]}
              onPress={acceptCall}
              activeOpacity={0.8}
            >
              <Text style={styles.actionIcon}>📞</Text>
              <Text style={styles.actionLabel}>Terima</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(5, 7, 15, 0.88)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  container: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.bgElevated,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    shadowColor: colors.tintAccent10,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 20,
  },
  avatarSection: {
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  pulseGlow: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(16, 185, 129, 0.25)',
  },
  callerName: {
    ...typography.h2,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  callBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.tintAccent10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    marginBottom: spacing.xxl,
  },
  callBadgeIcon: {
    fontSize: 14,
    marginRight: spacing.xs,
  },
  callBadgeText: {
    ...typography.caption,
    color: colors.accentPrimary,
    fontWeight: '600',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    gap: spacing.lg,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    gap: spacing.xs,
  },
  rejectButton: {
    backgroundColor: colors.tintError10,
    borderWidth: 1,
    borderColor: colors.colorError,
  },
  acceptButton: {
    backgroundColor: colors.accentPrimary,
    borderWidth: 1,
    borderColor: '#059669',
  },
  actionIcon: {
    fontSize: 18,
    color: colors.textPrimary,
  },
  actionLabel: {
    ...typography.body,
    fontWeight: '700',
    color: colors.textPrimary,
  },
});
