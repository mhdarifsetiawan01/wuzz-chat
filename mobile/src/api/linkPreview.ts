import { apiClient } from './client';
import { LinkPreview } from './types';
import { sanitizeUrl, isSafeHttpUrl } from '../utils/linkUtils';

const MAX_CACHE_ENTRIES = 100;
const CACHE_TTL_MS = 60 * 60 * 1000; // TTL 1 Jam

interface CacheEntry {
  data: LinkPreview;
  timestamp: number;
}

const previewCache = new Map<string, CacheEntry>();

// Negative cache: URL yang gagal di-scrape tidak dicoba lagi selama 5 menit (hemat jaringan & server)
const FAILURE_TTL_MS = 5 * 60 * 1000;
const failureCache = new Map<string, number>();

// Dedupe request yang sedang berjalan + batasi konkurensi agar scroll feed tidak membanjiri server
const inflight = new Map<string, Promise<LinkPreview | null>>();
const MAX_CONCURRENT = 3;
let active = 0;
const waiters: Array<() => void> = [];

function markFailed(url: string): void {
  if (failureCache.size >= MAX_CACHE_ENTRIES * 3) {
    const firstKey = failureCache.keys().next().value;
    if (firstKey) failureCache.delete(firstKey);
  }
  failureCache.set(url, Date.now());
}

async function acquireSlot(): Promise<void> {
  if (active < MAX_CONCURRENT) {
    active++;
    return;
  }
  await new Promise<void>((resolve) => waiters.push(resolve));
}

function releaseSlot(): void {
  const next = waiters.shift();
  if (next) next(); // slot langsung diwariskan ke antrean berikutnya
  else active--;
}

/**
 * Mengambil metadata OpenGraph / oEmbed dari backend WuzzChat (/api/link-preview).
 * Dilengkapi in-memory cache ber-TTL (1 jam) dan proteksi timeout 8 detik agar performa FlatList tetap lancar.
 */
export function fetchLinkPreview(targetUrl: string): Promise<LinkPreview | null> {
  const cleanUrl = sanitizeUrl(targetUrl);
  const pending = inflight.get(cleanUrl);
  if (pending) return pending;

  const promise = fetchLinkPreviewInner(targetUrl).finally(() => inflight.delete(cleanUrl));
  inflight.set(cleanUrl, promise);
  return promise;
}

async function fetchLinkPreviewInner(targetUrl: string): Promise<LinkPreview | null> {
  const cleanUrl = sanitizeUrl(targetUrl);
  if (!cleanUrl || !isSafeHttpUrl(cleanUrl)) {
    return null;
  }

  // 1. Cek In-Memory Cache dengan validasi masa berlaku (TTL)
  if (previewCache.has(cleanUrl)) {
    const entry = previewCache.get(cleanUrl)!;
    if (Date.now() - entry.timestamp < CACHE_TTL_MS) {
      return entry.data; // Cache masih valid (fresh)
    }
    // Jika sudah lewat dari 1 jam (stale), hapus agar mengambil data terbaru
    previewCache.delete(cleanUrl);
  }

  const failedAt = failureCache.get(cleanUrl);
  if (failedAt && Date.now() - failedAt < FAILURE_TTL_MS) {
    return null;
  }

  await acquireSlot();
  try {
    const data = await apiClient<LinkPreview>(
      `/api/link-preview?url=${encodeURIComponent(cleanUrl)}`,
      {
        method: 'GET',
        timeoutMs: 8000, // Timeout ringan agar tidak menggantung jaringan seluler
      }
    );

    if (data && data.title) {
      // Simpan ke cache beserta timestamp jika title valid
      if (previewCache.size >= MAX_CACHE_ENTRIES) {
        // Hapus entri pertama (FIFO/LRU sederhana)
        const firstKey = previewCache.keys().next().value;
        if (firstKey) previewCache.delete(firstKey);
      }
      previewCache.set(cleanUrl, {
        data,
        timestamp: Date.now(),
      });
      return data;
    }

    markFailed(cleanUrl);
    return null;

  } catch (error) {
    // Silent fail: Jika scraping gagal / timeout / offline, tidak perlu melempar error
    markFailed(cleanUrl);
    return null;
  } finally {
    releaseSlot();
  }
}
