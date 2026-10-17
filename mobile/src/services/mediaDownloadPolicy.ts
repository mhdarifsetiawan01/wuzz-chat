/** Limits for attachment transfers, independent of React/native UI. No auth headers go to storage. */
export const MEDIA_DOWNLOAD_LIMITS = {
  concurrent: 3,
  queued: 48,
  maxBytes: 100 * 1024 * 1024,
  reserveBytes: 8 * 1024 * 1024,
  timeoutMs: 600_000,
  idleTimeoutMs: 45_000,
} as const;

export function isLocalMediaUri(uri?: string | null): boolean {
  return Boolean(uri && /^(file|content|ph):\/\//i.test(uri));
}

export function isAllowedMediaDownloadUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.username || url.password) return false;
    const host = url.hostname.toLowerCase();
    if (url.protocol === 'https:' && (!url.port || url.port === '443')) {
      return host === 'media.wuzzhub.id' || host === 'chat-api.wuzzhub.id' ||
        host === 'wuzz-chat-backend.fly.dev' ||
        (host.endsWith('.supabase.co') && url.pathname.startsWith('/storage/v1/object/'));
    }
    return typeof __DEV__ !== 'undefined' && __DEV__ && url.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '10.0.2.2'].includes(host);
  } catch {
    return false;
  }
}
