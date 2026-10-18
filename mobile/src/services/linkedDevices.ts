import type { LinkedDevice } from '../api/devices';

export interface LinkedDevicesState {
  devices: LinkedDevice[];
  loading: boolean;
  removing: string | null;
  error: string;
  notice: string;
}

/** devices.id is the stable device ID, not a session ID. No session endpoint is used. */
export function normalizeDevices(devices: LinkedDevice[], userId: string, currentId: string) {
  const unique = new Map<string, LinkedDevice>();
  for (const device of devices) {
    if (!device.id || device.user_id !== userId || !device.is_active) continue;
    const previous = unique.get(device.id);
    if (!previous || Date.parse(device.last_seen_at || device.created_at) > Date.parse(previous.last_seen_at || previous.created_at)) {
      unique.set(device.id, device);
    }
  }
  return [...unique.values()].sort((a, b) => Number(b.id === currentId) - Number(a.id === currentId));
}

/** One operation at a time. Disposing invalidates even responses that ignore abort. */
export function createLinkedDevicesController(options: {
  userId: string;
  deviceId: string;
  api: { list: (signal: AbortSignal) => Promise<LinkedDevice[]>; remove: (id: string, signal: AbortSignal) => Promise<unknown> };
  onChange: (state: LinkedDevicesState) => void;
}) {
  let disposed = false;
  let busy = false;
  let request: AbortController | null = null;
  let state: LinkedDevicesState = { devices: [], loading: true, removing: null, error: '', notice: '' };
  const update = (patch: Partial<LinkedDevicesState>) => {
    if (!disposed) { state = { ...state, ...patch }; options.onChange(state); }
  };
  const message = (error: unknown) => (error as { detail?: string })?.detail || 'Tidak dapat menghubungi server. Coba lagi.';
  return {
    dispose() { disposed = true; request?.abort(); },
    async refresh() {
      if (disposed || busy) return;
      busy = true;
      request = new AbortController();
      update({ loading: true, error: '', notice: '' });
      try {
        const devices = await options.api.list(request.signal);
        update({ devices: normalizeDevices(devices, options.userId, options.deviceId) });
      } catch (error) { update({ error: message(error) }); }
      finally { busy = false; update({ loading: false }); }
    },
    async remove(id: string) {
      if (disposed || busy || !options.deviceId || id === options.deviceId || !state.devices.some(d => d.id === id)) return;
      busy = true;
      request = new AbortController();
      update({ removing: id, error: '', notice: '' });
      try {
        await options.api.remove(id, request.signal);
        update({ devices: state.devices.filter(d => d.id !== id), notice: 'Perangkat berhasil dikeluarkan.' });
      } catch (error) {
        // A lost response may mean the server already acted. Keep the row and offer refresh/retry.
        update({ error: `${message(error)} Muat ulang untuk memeriksa status perangkat.` });
      } finally { busy = false; update({ removing: null }); }
    },
  };
}
