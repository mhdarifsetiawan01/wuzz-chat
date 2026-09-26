/**
 * Active Call Overlay Component (Aurora Dark Mode)
 * Fullscreen calling screen with caller/callee profile, connection status,
 * live call duration timer, and in-call controls (Mute, Speaker, Hangup).
 * Reference: docs/plans/active/DECISION_LOG.md DEC-M28, DEC-M29, DEC-M30
 */

import React from 'react';
import {
  Modal,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useCall } from '../context';
import { colors, radius, spacing, typography } from '../theme';
import { Avatar } from './Avatar';

function formatCallDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const mm = mins < 10 ? `0${mins}` : `${mins}`;
  const ss = secs < 10 ? `0${secs}` : `${secs}`;
  return `${mm}:${ss}`;
}

export const ActiveCallOverlay: React.FC = () => {
  const {
    activeCall,
    callDuration,
    isMuted,
    isSpeaker,
    endCall,
    toggleMute,
    toggleSpeaker,
  } = useCall();

  const isVisible =
    !!activeCall &&
    activeCall.status !== 'idle' &&
    activeCall.status !== 'incoming_ringing';

  if (!isVisible || !activeCall) return null;

  const getStatusText = () => {
    switch (activeCall.status) {
      case 'outgoing_calling':
        return 'Memanggil...';
      case 'connecting':
        return 'Menghubungkan...';
      case 'connected':
        return formatCallDuration(callDuration);
      case 'ended':
        return 'Panggilan Berakhir';
      default:
        return '';
    }
  };

  const getStatusColor = () => {
    switch (activeCall.status) {
      case 'connected':
        return colors.accentPrimary;
      case 'ended':
        return colors.colorError;
      default:
        return colors.textSecondary;
    }
  };

  return (
    <Modal
      visible={isVisible}
      transparent={false}
      animationType="slide"
      statusBarTranslucent
      onRequestClose={endCall}
    >
      <SafeAreaView style={styles.container}>
        {/* Top Header info */}
        <View style={styles.headerSection}>
          <View style={styles.securityBadge}>
            <Text style={styles.securityBadgeIcon}>🔒</Text>
            <Text style={styles.securityBadgeText}>P2P Voice Call • WebRTC</Text>
          </View>
        </View>

        {/* Center Profile & Status Area */}
        <View style={styles.profileSection}>
          <View style={styles.avatarWrapper}>
            <Avatar
              name={activeCall.peerNickname || 'Pengguna'}
              avatarUrl={activeCall.peerAvatar}
              size={120}
            />
          </View>
          <Text style={styles.peerName} numberOfLines={1}>
            {activeCall.peerNickname || 'Pengguna WuzzChat'}
          </Text>
          <View style={styles.statusBadge}>
            {activeCall.status === 'connected' && (
              <View style={[styles.liveDot, { backgroundColor: getStatusColor() }]} />
            )}
            <Text style={[styles.statusText, { color: getStatusColor() }]}>
              {getStatusText()}
            </Text>
          </View>
        </View>

        {/* Bottom Call Controls */}
        <View style={styles.controlsSection}>
          <View style={styles.controlsRow}>
            {/* Mute Mic Button */}
            <View style={styles.controlWrapper}>
              <TouchableOpacity
                style={[
                  styles.controlButton,
                  isMuted && styles.controlButtonActive,
                ]}
                onPress={toggleMute}
                disabled={activeCall.status === 'ended'}
                activeOpacity={0.75}
              >
                <Text style={styles.controlIcon}>{isMuted ? '🔇' : '🎙️'}</Text>
              </TouchableOpacity>
              <Text style={styles.controlLabel}>{isMuted ? 'Muted' : 'Mute'}</Text>
            </View>

            {/* Hangup / End Call Button */}
            <View style={styles.controlWrapper}>
              <TouchableOpacity
                style={[styles.controlButton, styles.hangupButton]}
                onPress={endCall}
                activeOpacity={0.8}
              >
                <Text style={styles.hangupIcon}>📵</Text>
              </TouchableOpacity>
              <Text style={styles.controlLabel}>Tutup</Text>
            </View>

            {/* Speakerphone Toggle Button */}
            <View style={styles.controlWrapper}>
              <TouchableOpacity
                style={[
                  styles.controlButton,
                  isSpeaker && styles.controlButtonActive,
                ]}
                onPress={toggleSpeaker}
                disabled={activeCall.status === 'ended'}
                activeOpacity={0.75}
              >
                <Text style={styles.controlIcon}>{isSpeaker ? '🔊' : '🔈'}</Text>
              </TouchableOpacity>
              <Text style={styles.controlLabel}>
                {isSpeaker ? 'Speaker' : 'Earpiece'}
              </Text>
            </View>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgBase,
    justifyContent: 'space-between',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  headerSection: {
    alignItems: 'center',
    paddingTop: spacing.lg,
  },
  securityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgElevated,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    gap: spacing.xs,
  },
  securityBadgeIcon: {
    fontSize: 12,
  },
  securityBadgeText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  profileSection: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarWrapper: {
    marginBottom: spacing.lg,
    shadowColor: colors.accentPrimary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 18,
    elevation: 10,
  },
  peerName: {
    ...typography.h1,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    ...typography.body,
    fontWeight: '600',
    fontSize: 16,
  },
  controlsSection: {
    paddingBottom: spacing.xxl,
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  controlWrapper: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  controlButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlButtonActive: {
    backgroundColor: colors.tintAccent10,
    borderColor: colors.accentPrimary,
  },
  hangupButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.colorError,
    borderColor: colors.colorError,
    shadowColor: colors.colorError,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 12,
  },
  controlIcon: {
    fontSize: 24,
  },
  hangupIcon: {
    fontSize: 30,
  },
  controlLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '500',
  },
});
