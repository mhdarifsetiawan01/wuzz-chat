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

/**
 * Mengambil metadata OpenGraph / oEmbed dari backend WuzzChat (/api/link-preview).
 * Dilengkapi in-memory cache ber-TTL (1 jam) dan proteksi timeout 8 detik agar performa FlatList tetap lancar.
 */
export async function fetchLinkPreview(targetUrl: string): Promise<LinkPreview | null> {
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

    return null;

  } catch (error) {
    // Silent fail: Jika scraping gagal / timeout / offline, tidak perlu melempar error
    return null;
  }
}
