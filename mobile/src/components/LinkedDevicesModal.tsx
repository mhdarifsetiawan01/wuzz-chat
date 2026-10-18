import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { createDevicesApi, LinkedDevice } from '../api/devices';
import { createLinkedDevicesController, LinkedDevicesState } from '../services/linkedDevices';
import { ColorTokens, makeTypography, radius, spacing, useTheme, useThemedStyles } from '../theme';
import { BottomSheetModal } from './BottomSheetModal';
import { Button } from './Button';
import { Icon } from './Icon';

interface Props {
  token: string;
  userId: string;
  deviceId: string;
  onClose: () => void;
  onTransfer: () => void;
  canTransfer: boolean;
}

const initial: LinkedDevicesState = { devices: [], loading: true, removing: null, error: '', notice: '' };

function devicePresentation(device: LinkedDevice) {
  const platform = ({ android: 'Android', ios: 'iOS', web: 'Web', desktop: 'Desktop' } as Record<string, string>)[device.platform] || 'Perangkat';
  const icon = device.platform === 'android' || device.platform === 'ios'
    ? 'device' : device.platform === 'web' ? 'globe' : 'laptop';
  const name = device.name === 'Browser on Unknown OS' ? 'Browser web' : device.name || platform;
  const date = device.last_seen_at ? new Date(device.last_seen_at) : null;
  const lastSeen = date && Number.isFinite(date.getTime())
    ? date.toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : 'Waktu belum tersedia';
  return { platform, icon, name, lastSeen } as const;
}

/** Mounted only while visible, keyed by account + token + device by SettingsScreen. */
export function LinkedDevicesModal({ token, userId, deviceId, onClose, onTransfer, canTransfer }: Props) {
  const { colors, scheme } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [state, setState] = useState(initial);
  const [selected, setSelected] = useState<LinkedDevice | null>(null);
  const controller = useRef<ReturnType<typeof createLinkedDevicesController> | null>(null);
  useEffect(() => {
    const current = createLinkedDevicesController({ userId, deviceId, api: createDevicesApi(token, deviceId), onChange: setState });
    controller.current = current;
    void current.refresh();
    return () => { current.dispose(); controller.current = null; };
  }, [userId, deviceId, token]);
  const busy = state.loading || state.removing !== null;
  const thisDevice = state.devices.find(device => device.id === deviceId);
  const otherDevices = state.devices.filter(device => device.id !== deviceId);
  const target = selected ? devicePresentation(selected) : null;

  const renderDevice = (device: LinkedDevice, current: boolean) => {
    const info = devicePresentation(device);
    return (
      <View style={styles.deviceRow}>
        <View style={[styles.deviceIcon, current && styles.currentIcon]}>
          <Icon name={info.icon} size={22} color={current ? colors.colorInfoText : colors.textSecondary} />
        </View>
        <View style={styles.details}>
          <Text style={styles.name} numberOfLines={2}>{info.name}</Text>
          <Text style={styles.meta}>{info.platform} · {info.lastSeen}</Text>
        </View>
        {!current && (
          <TouchableOpacity style={[styles.removeAction, busy && styles.disabled]} disabled={busy}
            accessibilityRole="button" accessibilityLabel={`Keluarkan ${info.name}`}
            onPress={() => setSelected(device)}>
            <Text style={styles.removeText}>Keluarkan</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <BottomSheetModal key={selected ? 'confirmation' : 'devices'} visible title={selected ? 'Keluarkan perangkat?' : 'Perangkat Tertaut'}
      onClose={() => { if (selected && !state.removing) setSelected(null); else onClose(); }}>
      <ScrollView key={selected ? 'confirmation' : 'devices'} style={styles.scroll} contentContainerStyle={styles.content}>
        {selected && target ? (
          <>
            <Text style={styles.description}>Perangkat berikut akan dikeluarkan dari akun Anda. Perangkat yang sedang Anda gunakan tetap masuk.</Text>
            <View style={styles.confirmDevice}>
              <View style={styles.deviceIcon}><Icon name={target.icon} size={24} color={colors.textSecondary} /></View>
              <View style={styles.details}>
                <Text style={styles.name}>{target.name}</Text>
                <Text style={styles.meta}>{target.platform} · {target.lastSeen}</Text>
              </View>
            </View>
            <Text style={styles.meta}>Kunci enkripsi akun Anda tidak direset.</Text>
            {!!state.error && <Text accessibilityRole="alert" style={styles.error}>{state.error}</Text>}
            <View style={styles.confirmActions}>
              <Button title="Batal" variant="secondary" disabled={busy} style={styles.confirmButton} onPress={() => setSelected(null)} />
              <Button title="Keluarkan" variant="danger" isLoading={state.removing === selected.id}
                disabled={state.loading} style={{ ...styles.confirmButton, backgroundColor: scheme === 'light' ? colors.colorErrorText : colors.dangerFill }} onPress={() => {
                  const current = controller.current;
                  void current?.remove(selected.id).then(() => {
                    if (controller.current === current) setSelected(null);
                  });
                }} />
            </View>
          </>
        ) : (
          <>
            <Text style={styles.description}>Kelola perangkat yang terhubung ke akun Anda.</Text>
            <View style={styles.summary}>
              <Text style={styles.summaryText}>{!state.devices.length && (state.loading || state.error)
                ? state.loading ? 'Memuat perangkat…' : 'Daftar belum tersedia'
                : `${state.devices.length} perangkat tercatat`}</Text>
              <TouchableOpacity style={[styles.refreshAction, busy && styles.disabled]} disabled={busy}
                accessibilityRole="button" accessibilityLabel="Muat ulang daftar perangkat"
                onPress={() => { void controller.current?.refresh(); }}>
                {state.loading ? <ActivityIndicator size="small" color={colors.accentPrimary} /> : <Text style={styles.refreshText}>Muat ulang</Text>}
              </TouchableOpacity>
            </View>
            {!!state.error && <Text accessibilityRole="alert" style={styles.error}>{state.error}</Text>}
            {!!state.notice && (
              <View style={styles.notice} accessibilityLiveRegion="polite">
                <Icon name="checkCircle" size={18} color={colors.colorOnline} />
                <Text style={styles.description}>{state.notice}</Text>
              </View>
            )}
            {thisDevice && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>PERANGKAT INI</Text>
                <View style={styles.currentCard}>{renderDevice(thisDevice, true)}</View>
              </View>
            )}
            {!!otherDevices.length && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>PERANGKAT LAIN</Text>
                <View style={styles.deviceList}>
                  {otherDevices.map((device, index) => (
                    <View key={device.id}>
                      {index > 0 && <View style={styles.divider} />}
                      {renderDevice(device, false)}
                    </View>
                  ))}
                </View>
              </View>
            )}
            {!busy && !state.error && !state.devices.length && <Text style={styles.description}>Belum ada perangkat yang tercatat.</Text>}
            {!busy && !state.error && thisDevice && !otherDevices.length && <Text style={styles.meta}>Tidak ada perangkat lain yang terhubung.</Text>}
            {!!state.devices.length && <Text style={styles.meta}>Waktu menunjukkan kapan perangkat terakhir terhubung.</Text>}
            <TouchableOpacity style={[styles.transferRow, (busy || !canTransfer) && styles.disabled]}
              disabled={busy || !canTransfer} accessibilityRole="button" accessibilityLabel="Transfer kunci ke perangkat lain"
              onPress={onTransfer}>
              <View style={styles.transferIcon}><Icon name="link" size={20} color={colors.colorInfoText} /></View>
              <View style={styles.details}>
                <Text style={styles.transferTitle}>Transfer kunci enkripsi</Text>
                <Text style={styles.meta}>Gunakan kunci yang sama di perangkat baru.</Text>
              </View>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </BottomSheetModal>
  );
}

const makeStyles = (colors: ColorTokens) => {
  const typography = makeTypography(colors);
  return StyleSheet.create({
    scroll: { flexShrink: 1 },
    content: { gap: spacing.md, paddingBottom: spacing.sm },
    description: { ...typography.bodySecondary, color: colors.textSecondary, flexShrink: 1 },
    meta: { ...typography.caption, color: colors.textSecondary },
    error: { ...typography.bodySecondary, color: colors.colorErrorText },
    summary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: -spacing.sm },
    summaryText: { ...typography.captionBold, color: colors.textSecondary },
    refreshAction: { minHeight: 44, minWidth: 44, paddingHorizontal: spacing.sm, justifyContent: 'center', alignItems: 'center' },
    refreshText: { ...typography.bodySecondary, color: colors.colorInfoText, fontWeight: '600' },
    section: { gap: spacing.sm },
    sectionLabel: { ...typography.captionBold, color: colors.textSecondary, letterSpacing: 0.8 },
    currentCard: { borderRadius: radius.lg, backgroundColor: colors.bgSurface, borderWidth: 1, borderColor: colors.tintAccent20 },
    deviceList: { borderRadius: radius.lg, backgroundColor: colors.bgSurface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderDefault },
    deviceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
    deviceIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: colors.bgInput },
    currentIcon: { backgroundColor: colors.tintAccent10 },
    details: { flex: 1, gap: spacing.xs },
    name: { ...typography.bodySecondary, fontWeight: '600', color: colors.textPrimary },
    removeAction: { minHeight: 44, minWidth: 44, paddingHorizontal: spacing.xs, justifyContent: 'center', alignItems: 'center' },
    removeText: { ...typography.bodySecondary, fontWeight: '600', color: colors.colorErrorText },
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.borderDefault, marginHorizontal: spacing.md },
    disabled: { opacity: 0.45 },
    notice: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    transferRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderDefault, paddingTop: spacing.lg, paddingBottom: spacing.sm, minHeight: 44 },
    transferIcon: { width: 40, height: 40, borderRadius: radius.full, backgroundColor: colors.tintAccent10, justifyContent: 'center', alignItems: 'center' },
    transferTitle: { ...typography.bodySecondary, fontWeight: '600', color: colors.colorInfoText },
    confirmDevice: { flexDirection: 'row', gap: spacing.md, alignItems: 'center', backgroundColor: colors.bgSurface, borderColor: colors.borderDefault, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg, padding: spacing.lg },
    confirmActions: { flexDirection: 'row', gap: spacing.md, paddingTop: spacing.sm },
    confirmButton: { flex: 1, minWidth: 0 },
  });
};
