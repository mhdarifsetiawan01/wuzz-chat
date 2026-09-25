/**
 * JoinRequestsModal — M-Mobile-8.2B
 * Displays pending join-requests for a private forum topic.
 * Accessible only to admin / creator of the parent group.
 *
 * Conforms to:
 *  - Mandatory Dual-Platform Frontend Architecture Rule
 *  - Slow & Flaky Server Resilience Rule (AbortController 15s)
 *  - Immutable UUID-Only Checking (DEC-008)
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { subgroupsApi } from '../api/subgroups';
import { JoinRequest } from '../api/types';
import { Avatar } from './Avatar';
import { colors } from '../theme/colors';
import { spacing, radius, shadows } from '../theme/spacing';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface JoinRequestsModalProps {
  visible: boolean;
  subGroupId: string;
  subGroupTitle: string;
  onClose: () => void;
  /** Called when any request was approved so parent can refresh member count */
  onRequestActioned?: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const JoinRequestsModal: React.FC<JoinRequestsModalProps> = ({
  visible,
  subGroupId,
  subGroupTitle,
  onClose,
  onRequestActioned,
}) => {
  const insets = useSafeAreaInsets();

  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ── Load requests on open ─────────────────────────────────────────────────

  const loadRequests = useCallback(async () => {
    if (!visible || !subGroupId) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const timer = setTimeout(() => controller.abort(), 15_000);

    setIsLoading(true);
    try {
      const data = await subgroupsApi.listJoinRequests(subGroupId, controller.signal);
      const list = Array.isArray(data) ? data : ((data as any)?.requests || []);
      const pending = list.filter((r: JoinRequest) => r.status === 'pending');
      setRequests(pending);
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        Alert.alert('Gagal memuat permohonan', 'Silakan coba lagi.');
      }
    } finally {
      clearTimeout(timer);
      setIsLoading(false);
    }
  }, [visible, subGroupId]);

  useEffect(() => {
    loadRequests();
    return () => {
      abortRef.current?.abort();
    };
  }, [loadRequests]);

  // ── Action: approve / reject ──────────────────────────────────────────────

  const handleAction = useCallback(
    async (requestId: string, approve: boolean) => {
      setActioningId(requestId);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15_000);

      try {
        await subgroupsApi.reviewJoinRequest(subGroupId, requestId, approve, controller.signal);
        // Remove actioned request from list
        setRequests((prev) => prev.filter((r) => r.id !== requestId));
        if (approve) {
          onRequestActioned?.();
        }
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          Alert.alert(
            approve ? 'Gagal menyetujui' : 'Gagal menolak',
            'Silakan coba lagi.'
          );
        }
      } finally {
        clearTimeout(timer);
        setActioningId(null);
      }
    },
    [subGroupId, onRequestActioned]
  );

  // ── Render helpers ────────────────────────────────────────────────────────

  const renderRequest = useCallback(
    ({ item }: { item: JoinRequest }) => {
      const isActioning = actioningId === item.id;
      return (
        <View style={styles.requestCard}>
          <Avatar
            name={item.display_name || item.username}
            avatarUrl={item.avatar_url}
            size={40}
          />
          <View style={styles.requestInfo}>
            <Text style={styles.requestName} numberOfLines={1}>
              {item.display_name || item.username}
            </Text>
            <Text style={styles.requestUsername} numberOfLines={1}>
              @{item.username}
            </Text>
          </View>
          <View style={styles.requestActions}>
            {isActioning ? (
              <ActivityIndicator size="small" color={colors.accentPrimary} />
            ) : (
              <>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.approveBtn]}
                  onPress={() => handleAction(item.id, true)}
                  activeOpacity={0.75}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 4 }}
                >
                  <Text style={styles.approveBtnText}>✓ Setujui</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.rejectBtn]}
                  onPress={() => handleAction(item.id, false)}
                  activeOpacity={0.75}
                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
                >
                  <Text style={styles.rejectBtnText}>✗ Tolak</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      );
    },
    [actioningId, handleAction]
  );

  const ListEmpty = (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyIcon}>📭</Text>
      <Text style={styles.emptyText}>Tidak ada permohonan yang menunggu</Text>
    </View>
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text style={styles.headerTitle}>Permohonan Izin</Text>
              <Text style={styles.headerSubtitle} numberOfLines={1}>
                🔒 {subGroupTitle}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={onClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Content */}
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.accentPrimary} />
            </View>
          ) : (
            <FlatList
              data={requests}
              keyExtractor={(item) => item.id}
              renderItem={renderRequest}
              contentContainerStyle={requests.length === 0 ? { flex: 1 } : { paddingBottom: spacing.lg }}
              ListEmptyComponent={ListEmpty}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>
      </View>
    </Modal>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(9, 13, 22, 0.80)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.bgCardSolid,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: '75%',
    ...shadows.modal,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  headerLeft: { flex: 1 },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: 0.2,
  },
  headerSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.huge,
  },
  requestCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    gap: spacing.md,
  },
  requestInfo: {
    flex: 1,
    minWidth: 0,
  },
  requestName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  requestUsername: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  requestActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  actionBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.sm,
    minWidth: 64,
    alignItems: 'center',
  },
  approveBtn: {
    backgroundColor: colors.tintSuccess10,
    borderWidth: 1,
    borderColor: colors.colorSuccess,
  },
  approveBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.colorSuccess,
  },
  rejectBtn: {
    backgroundColor: colors.tintError10,
    borderWidth: 1,
    borderColor: colors.colorError,
  },
  rejectBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.colorError,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.huge,
  },
  emptyIcon: { fontSize: 40, marginBottom: spacing.md },
  emptyText: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
