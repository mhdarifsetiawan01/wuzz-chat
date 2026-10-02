/**
 * WuzzChat App Update Service
 * Mengambil info versi terbaru dari backend (GET /api/app/version) untuk banner
 * "Pembaruan tersedia" (opsional, bisa ditutup) — terpisah dari Force Update (HTTP 426).
 * Hasil di-cache di memori agar tidak membebani server / jaringan lambat.
 */

import { apiClient } from '../api/client';
import { API_CONFIG } from '../api/config';
import { APP_CHANNEL, getAppVersionInfo } from '../utils/appVersion';

export interface AppUpdateInfo {
  min_build: number;
  latest_build: number;
  latest_version?: string;
  download_url?: string;
  release_notes?: string;
}

const CACHE_TTL_MS = 30 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8000;

let cache: { info: AppUpdateInfo; at: number } | null = null;
let inflight: Promise<AppUpdateInfo | null> | null = null;

/**
 * Ambil info versi. Mengembalikan null jika gagal (jaringan lambat/offline) — tidak pernah melempar.
 * `force` mengabaikan cache (untuk tombol "Cek pembaruan").
 */
export async function fetchAppUpdateInfo(force = false): Promise<AppUpdateInfo | null> {
  if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.info;
  if (inflight) return inflight;

  inflight = apiClient<AppUpdateInfo>(
    `/api/app/version?platform=${API_CONFIG.PLATFORM}&channel=${APP_CHANNEL}`,
    { skipAuth: true, timeoutMs: REQUEST_TIMEOUT_MS },
  )
    .then((info) => {
      cache = { info, at: Date.now() };
      return info;
    })
    .catch(() => cache?.info ?? null)
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

/** True jika ada build lebih baru dari yang terpasang. */
export function isUpdateAvailable(info: AppUpdateInfo | null): boolean {
  if (!info || !info.latest_build) return false;
  return info.latest_build > getAppVersionInfo().buildNumber;
}

const VERSION_PATTERN = /^\d+\.\d+(\.\d+)*$/;

/**
 * Label versi terbaru untuk UI. Nilai `latest_version` dari backend hanya dipakai jika
 * berformat versi valid (mis. "1.11.0"); jika salah konfigurasi (mis. "1") jatuh ke nomor build.
 */
export function getLatestVersionLabel(info: AppUpdateInfo | null): string | null {
  const version = info?.latest_version?.trim().replace(/^v/i, '');
  if (version && VERSION_PATTERN.test(version)) return `Versi ${version}`;
  if (info?.latest_build) return `Build ${info.latest_build}`;
  return null;
}
