import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
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

/** Mounted only while visible, keyed by account + token + device by SettingsScreen. */
export function LinkedDevicesModal({ token, userId, deviceId, onClose, onTransfer, canTransfer }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [state, setState] = useState(initial);
  const [selected, setSelected] = useState<LinkedDevice | null>(null);
  const scroll = useRef<ScrollView>(null);
  const controller = useRef<ReturnType<typeof createLinkedDevicesController> | null>(null);
  useEffect(() => {
    const current = createLinkedDevicesController({ userId, deviceId, api: createDevicesApi(token, deviceId), onChange: setState });
    controller.current = current;
    void current.refresh();
    return () => { current.dispose(); controller.current = null; };
  }, [userId, deviceId, token]);
  const busy = state.loading || state.removing !== null;

  return (
    <BottomSheetModal visible onClose={onClose} title="Perangkat Tertaut">
      <ScrollView ref={scroll} style={styles.scroll} contentContainerStyle={styles.content}
        onContentSizeChange={() => { if (selected) scroll.current?.scrollToEnd({ animated: true }); }}>
        <Text style={styles.description}>Perangkat yang memiliki akses ke akun Anda. Maksimal 2 perangkat aktif.</Text>
        {state.loading && <ActivityIndicator accessibilityLabel="Memuat perangkat" color={colors.accentPrimary} />}
        {!!state.error && <Text accessibilityRole="alert" style={styles.error}>{state.error}</Text>}
        {!!state.notice && <Text accessibilityLiveRegion="polite" style={styles.description}>{state.notice}</Text>}
        {!busy && !state.error && state.devices.length === 0 && <Text style={styles.description}>Tidak ada perangkat aktif yang tercatat.</Text>}
        {state.devices.map(device => {
          const current = device.id === deviceId;
          const platform = ({ android: 'Android', ios: 'iOS', web: 'Web', desktop: 'Desktop' } as Record<string, string>)[device.platform] || 'Perangkat';
          const lastSeen = device.last_seen_at ? new Date(device.last_seen_at) : null;
          return (
            <View key={device.id} style={styles.card}>
              <View style={styles.row}>
                <Icon name="laptop" size={24} color={colors.accentPrimary} />
                <View style={styles.details}>
                  <Text style={styles.name}>{device.name || platform}</Text>
                  <Text style={styles.description}>{platform}{current ? ' · Perangkat Ini' : ''}</Text>
                  <Text style={styles.description}>Aktivitas terakhir: {lastSeen && Number.isFinite(lastSeen.getTime()) ? lastSeen.toLocaleString('id-ID') : 'Belum tersedia'}</Text>
                </View>
              </View>
              {!current && <Button title="Keluarkan" variant="secondary" disabled={busy} accessibilityLabel={`Keluarkan ${device.name || platform}`} onPress={() => setSelected(device)} />}
            </View>
          );
        })}
        {selected && (
          <View style={styles.card}>
            <Text style={styles.name}>Keluarkan {selected.name || selected.platform}?</Text>
            <Text style={styles.description}>Akses akun di perangkat tersebut akan dicabut dan obrolannya terputus. Perangkat ini tetap masuk. Kunci E2EE akun tidak direset.</Text>
            <Button title="Ya, Keluarkan" variant="danger" isLoading={state.removing === selected.id} disabled={state.loading} onPress={() => {
              const current = controller.current;
              void current?.remove(selected.id).then(() => {
                if (controller.current === current) setSelected(null);
              });
            }} />
            <Button title="Batal" variant="secondary" disabled={busy} onPress={() => setSelected(null)} />
          </View>
        )}
        <Button title="Muat Ulang" variant="secondary" disabled={busy} onPress={() => { setSelected(null); void controller.current?.refresh(); }} />
        <Text style={styles.description}>Login di perangkat baru, lalu gunakan Transfer Kunci untuk menerima kunci enkripsi dari perangkat ini.</Text>
        <Button title="Transfer Kunci ke Perangkat Lain" variant="secondary" disabled={busy || !canTransfer} onPress={onTransfer} />
      </ScrollView>
    </BottomSheetModal>
  );
}

const makeStyles = (colors: ColorTokens) => {
  const typography = makeTypography(colors);
  return StyleSheet.create({
    scroll: { flexShrink: 1 },
    content: { gap: spacing.md, paddingBottom: spacing.md },
    description: { ...typography.caption, color: colors.textSecondary },
    error: { ...typography.body, color: colors.colorError },
    card: { padding: spacing.lg, gap: spacing.md, backgroundColor: colors.bgSurface, borderColor: colors.borderDefault, borderWidth: 1, borderRadius: radius.lg },
    row: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
    details: { flex: 1, gap: spacing.xs },
    name: { ...typography.body, fontWeight: '600', color: colors.textPrimary },
  });
};
