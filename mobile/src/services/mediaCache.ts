/**
 * WuzzChat Persistent Local Media Cache Service (DEC-034)
 *
 * Implements a persistent, resilient local filesystem storage layer for media
 * (images, voice notes) in the mobile client.
 *
 * WhatsApp Store-and-Forward Lifecycle alignment:
 *  - When a sender uploads media, a copy is immediately persisted in local storage.
 *  - When a recipient downloads/views media, it is saved into local storage.
 *  - When server retention eventually deletes the physical file (`media_status === 'expired'`),
 *    the mobile client continues rendering the cached local file without interruption.
 */

import * as FileSystem from 'expo-file-system/legacy';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { MEDIA_DOWNLOAD_LIMITS, isAllowedMediaDownloadUrl, isLocalMediaUri } from './mediaDownloadPolicy';

export type MediaDownloadCode = 'expired' | 'forbidden' | 'incomplete' | 'failed' | 'timeout' |
  'storage' | 'too_large' | 'cancelled' | 'busy' | 'unsafe_url';
export interface MediaDownloadOptions {
  expectedSize?: number;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
  /** Only picker/recorder paths supplied by the current sender, never remote message fields. */
  allowLocalSource?: boolean;
}
interface DownloadJob {
  promise: Promise<string>;
  progress: number;
  listeners: Set<(fraction: number) => void>;
  cancel: () => void;
  consumers: number;
  cancelled: boolean;
}


const CACHE_FOLDER = 'wuzzchat_media/';

/** Galat transfer lampiran; kode aman ditampilkan tanpa membocorkan URL atau token. */
export class MediaDownloadError extends Error {
  constructor(public readonly code: MediaDownloadCode, message: string) {
    super(message);
  }
}

class MediaCacheService {
  private baseDir: string | null = null;
  private isDirInitialized = false;
  private memoryCache = new Map<string, string>();
  private downloads = new Map<string, DownloadJob>();
  private copies = new Map<string, Promise<string>>();
  private localSources = new Map<string, string>();
  private activeCount = 0;
  private waiting: Array<() => void> = [];
  private generation = 0;
  private partSequence = 0;
  private maintenance: Promise<void> | null = null;

  constructor() {
    this.initBaseDir();
  }

  /** Register only freshly captured/picked sources in trusted send handlers, never from received message fields. */
  public registerLocalSource(messageId: string, uri: string): void {
    this.localSources.set(messageId, uri);
    if (this.localSources.size > 500) this.localSources.delete(this.localSources.keys().next().value!);
  }

  private remember(key: string, uri: string): void {
    if (!key) return;
    this.memoryCache.set(key, uri);
    if (this.memoryCache.size > 2000) this.memoryCache.delete(this.memoryCache.keys().next().value!);
  }

  private initBaseDir() {
    const root = FileSystem.documentDirectory;
    if (root) {
      this.baseDir = root.endsWith('/') ? `${root}${CACHE_FOLDER}` : `${root}/${CACHE_FOLDER}`;
    }
  }

  /**
   * Ensures the local media directory exists.
   */
  public async ensureDirectory(): Promise<string | null> {
    if (!this.baseDir) {
      this.initBaseDir();
    }
    if (!this.baseDir) throw new MediaDownloadError('storage', 'Penyimpanan media tidak tersedia');

    if (!this.isDirInitialized) {
      try {
        const dirInfo = await FileSystem.getInfoAsync(this.baseDir);
        if (!dirInfo.exists) {
          await FileSystem.makeDirectoryAsync(this.baseDir, { intermediates: true });
        }
        this.isDirInitialized = true;
      } catch (err) {
        throw new MediaDownloadError('storage', 'Folder media tidak dapat dibuat');
      }
    }
    return this.baseDir;
  }

  /**
   * Menghapus seluruh folder media persisten. Hanya untuk penghapusan akun (salinan lokal bisa jadi satu-satunya).
   */
  public async clearAll(): Promise<void> {
    if (!this.baseDir) {
      this.initBaseDir();
    }
    if (!this.baseDir) return;
    await this.cancelPendingDownloads();
    this.memoryCache.clear();
    try {
      await FileSystem.deleteAsync(this.baseDir, { idempotent: true });
    } catch (err) {
      console.warn('[MediaCache] Failed to clear media directory:', err);
    }
    this.isDirInitialized = false;
  }

  /**
   * Total pemakaian disk cache media persisten (folder wuzzchat_media). Tidak membuat folder bila belum ada.
   * Catatan: salinan lokal ini sering menjadi SATU-SATUNYA salinan (server menghapus berkas fisik setelah ACK).
   */
  public async getUsage(): Promise<{ bytes: number; files: number }> {
    if (!this.baseDir) {
      this.initBaseDir();
    }
    if (!this.baseDir) return { bytes: 0, files: 0 };

    try {
      const info: any = await FileSystem.getInfoAsync(this.baseDir);
      if (!info.exists) return { bytes: 0, files: 0 };
      const names = await FileSystem.readDirectoryAsync(this.baseDir);
      return { bytes: typeof info.size === 'number' ? info.size : 0, files: names.length };
    } catch {
      return { bytes: 0, files: 0 };
    }
  }

  /**
   * Generates a safe, deterministic local file path for a given media URL or message ID.
   */
  public getLocalFilePath(
    mediaUrl?: string | null,
    messageId?: string | null,
    fileName?: string | null
  ): string | null {
    if (!this.baseDir) {
      this.initBaseDir();
    }
    if (!this.baseDir) return null;

    // Determine extension
    let ext = '';
    const nameSource = fileName || mediaUrl || '';
    const extMatch = nameSource.match(/\.([a-zA-Z0-9]{1,12})(?:[?#]|$)/);
    if (extMatch && extMatch[1]) {
      ext = `.${extMatch[1].toLowerCase()}`;
    } else if (nameSource.includes('audio') || nameSource.endsWith('m4a')) {
      ext = '.m4a';
    } else {
      ext = '.jpg';
    }

    // Build safe unique identifier
    let key = '';
    if (messageId && messageId.trim()) {
      if (!/^[a-zA-Z0-9_-]{1,200}$/.test(messageId)) return null;
      key = messageId;
    } else if (mediaUrl) {
      key = `url_${bytesToHex(sha256(new TextEncoder().encode(mediaUrl)))}`;
    } else {
      key = `tmp_${Date.now()}`;
    }

    return `${this.baseDir}media_${key}${ext}`;
  }

  /**
   * Checks if media is already cached locally.
   * Returns the `file:///...` URI if found, or null otherwise.
   */
  public async getCachedMediaUri(
    mediaUrl?: string | null,
    messageId?: string | null,
    fileName?: string | null,
    expectedSize?: number
  ): Promise<string | null> {
    if (!mediaUrl && !messageId) return null;

    // Check the file on disk even after a memory hit: cleanup / OS removal must not leave stale pointers.
    const remembered = (messageId && this.memoryCache.get(messageId)) ||
      (mediaUrl && this.memoryCache.get(mediaUrl));
    const expectedPath = this.getLocalFilePath(mediaUrl, messageId, fileName);
    // Never follow a raw local message URL. Only resolve this message's own deterministic cache path.
    const candidate = remembered || expectedPath;
    // A received file:// URL must never expose arbitrary private app files through the viewer/share sheet.
    let localPath: string | null = null;
    try {
      if (candidate && this.baseDir && new URL(candidate).protocol === 'file:' &&
        !/%2e|%2f|%5c/i.test(candidate) &&
        new URL(candidate).pathname.startsWith(new URL(this.baseDir).pathname)) localPath = candidate;
    } catch { /* Unsupported local handle. */ }
    if (!localPath) return null;
    try {
      const info = await FileSystem.getInfoAsync(localPath);
      if (info.exists && !info.isDirectory && typeof info.size === 'number' && info.size > 0 &&
        (!expectedSize || info.size === expectedSize)) {
        if (messageId) this.remember(messageId, localPath);
        if (mediaUrl) this.remember(mediaUrl, localPath);
        return localPath;
      }
    } catch { /* Local picker handles (ph/content) may not expose metadata until copied. */ }
    if (messageId) this.memoryCache.delete(messageId);
    if (mediaUrl) this.memoryCache.delete(mediaUrl);
    return null;
  }

  /**
   * Saves a local file (e.g. freshly picked image or recorded audio by sender) into the persistent media cache.
   */
  public async saveLocalFileToCache(
    sourceUri: string,
    messageId: string,
    remoteUrl?: string,
    fileName?: string
  ): Promise<string> {
    this.registerLocalSource(messageId, sourceUri);
    const generation = this.generation;
    const destPath = this.getLocalFilePath(remoteUrl || sourceUri, messageId, fileName);
    if (!destPath) throw new MediaDownloadError('storage', 'Lokasi media tidak tersedia');
    const running = this.copies.get(destPath);
    if (running) return running;
    const partPath = `${destPath}.${++this.partSequence}.part`;
    const copy = (async () => {
      try {
        await this.cleanPartialFiles();
        await this.ensureDirectory();
        if (generation !== this.generation) throw new MediaDownloadError('cancelled', 'Sesi berakhir');
        const source = await FileSystem.getInfoAsync(sourceUri);
        if (!source.exists || source.isDirectory || !source.size) {
          throw new MediaDownloadError('storage', 'Berkas sumber tidak tersedia');
        }
        if (sourceUri !== destPath) {
          await FileSystem.copyAsync({ from: sourceUri, to: partPath });
          const target = await FileSystem.getInfoAsync(partPath);
          if (!target.exists || target.isDirectory || target.size !== source.size) {
            throw new MediaDownloadError('incomplete', 'Salinan media tidak lengkap');
          }
          if (generation !== this.generation) throw new MediaDownloadError('cancelled', 'Sesi berakhir');
          await FileSystem.moveAsync({ from: partPath, to: destPath });
        }
        if (generation !== this.generation) throw new MediaDownloadError('cancelled', 'Sesi berakhir');
        this.remember(messageId, destPath);
        if (remoteUrl) this.remember(remoteUrl, destPath);
        return destPath;
      } catch (err) {
        await FileSystem.deleteAsync(partPath, { idempotent: true }).catch(() => {});
        if (err instanceof MediaDownloadError) throw err;
        throw new MediaDownloadError('storage', 'Media pengirim belum berhasil disimpan');
      }
    })();
    this.copies.set(destPath, copy);
    try { return await copy; } finally {
      if (this.copies.get(destPath) === copy) this.copies.delete(destPath);
    }
  }

  /** Cancel transfers at session end/account deletion without deleting completed media. */
  public async cancelPendingDownloads(): Promise<void> {
    this.generation++;
    this.localSources.clear();
    const jobs = [...this.downloads.values()];
    jobs.forEach((job) => job.cancel());
    await Promise.allSettled([...jobs.map((job) => job.promise), ...this.copies.values()]);
    this.memoryCache.clear();
  }

  private async acquire(signal: AbortSignal): Promise<() => void> {
    if (signal.aborted) throw new MediaDownloadError('cancelled', 'Unduhan dibatalkan');
    if (this.activeCount >= MEDIA_DOWNLOAD_LIMITS.concurrent) {
      if (this.waiting.length >= MEDIA_DOWNLOAD_LIMITS.queued) {
        throw new MediaDownloadError('busy', 'Antrean unduhan penuh');
      }
      await new Promise<void>((resolve, reject) => {
        const grant = () => {
          signal.removeEventListener('abort', abort);
          resolve();
        };
        const abort = () => {
          const index = this.waiting.indexOf(grant);
          if (index >= 0) this.waiting.splice(index, 1);
          reject(new MediaDownloadError('cancelled', 'Unduhan dibatalkan'));
        };
        this.waiting.push(grant);
        signal.addEventListener('abort', abort, { once: true });
      });
      // Slot already handed over by the previous owner.
    } else {
      this.activeCount++;
    }
    return () => {
      const next = this.waiting.shift();
      if (next) next();
      else this.activeCount--;
    };
  }

  /** Remove only abandoned partial files, once per process. Never evict complete offline copies. */
  private cleanPartialFiles(): Promise<void> {
    if (!this.maintenance) {
      this.maintenance = (async () => {
        await this.ensureDirectory();
        const names = await FileSystem.readDirectoryAsync(this.baseDir!);
        for (const name of names) {
          if (/^media_[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+(?:\.\d+)?\.part$/.test(name)) {
            await FileSystem.deleteAsync(`${this.baseDir}${name}`, { idempotent: true });
          }
        }
      })().catch(() => { /* A failure here must not prevent an explicit download attempt. */ });
    }
    return this.maintenance;
  }

  /**
   * Shared file-based downloader for every attachment. One writer per path; all viewers get local files only.
   * Bounded native transfers, total/idle timeouts, .part + size validation, manual retry after errors.
   * expectedSize detects truncation, not cryptographic authenticity (the protocol supplies no content digest).
   */
  public async downloadToCache(
    remoteUrl: string,
    messageId: string,
    fileName?: string,
    opts: MediaDownloadOptions = {}
  ): Promise<string> {
    if (opts.signal?.aborted) throw new MediaDownloadError('cancelled', 'Unduhan dibatalkan');
    const generation = this.generation;
    const existing = await this.getCachedMediaUri(remoteUrl, messageId, fileName);
    if (generation !== this.generation || opts.signal?.aborted) {
      throw new MediaDownloadError('cancelled', 'Sesi unduhan berakhir');
    }
    if (existing) {
      const info = await FileSystem.getInfoAsync(existing);
      if (info.exists && (!opts.expectedSize || info.size === opts.expectedSize)) return existing;
      // Never delete a possibly unique local original. A remote URL can repair a truncated legacy cache.
      if (isLocalMediaUri(remoteUrl)) throw new MediaDownloadError('incomplete', 'Salinan lokal tidak lengkap');
      this.memoryCache.delete(messageId);
      this.memoryCache.delete(remoteUrl);
    }
    if (isLocalMediaUri(remoteUrl) && opts.allowLocalSource && messageId &&
      this.localSources.get(messageId) === remoteUrl) {
      // Local sources are an explicit sender-only capability, not a fallback for untrusted URLs.
      const saved = await this.saveLocalFileToCache(remoteUrl, messageId, undefined, fileName);
      if (generation !== this.generation) throw new MediaDownloadError('cancelled', 'Sesi unduhan berakhir');
      if (opts.expectedSize) {
        const info = await FileSystem.getInfoAsync(saved);
        if (!info.exists || info.size !== opts.expectedSize) {
          throw new MediaDownloadError('incomplete', 'Ukuran salinan lokal tidak cocok');
        }
      }
      return saved;
    }
    if (!isAllowedMediaDownloadUrl(remoteUrl)) {
      throw new MediaDownloadError('unsafe_url', 'Sumber media tidak diizinkan');
    }
    if (opts.expectedSize && (!Number.isSafeInteger(opts.expectedSize) || opts.expectedSize < 0 ||
      opts.expectedSize > MEDIA_DOWNLOAD_LIMITS.maxBytes)) {
      throw new MediaDownloadError('too_large', 'Ukuran media melebihi batas');
    }
    const finalPath = this.getLocalFilePath(remoteUrl, messageId, fileName);
    if (!finalPath) throw new MediaDownloadError('storage', 'Lokasi media tidak tersedia');
    let job = this.downloads.get(finalPath);
    if (!job || job.cancelled) {
      const controller = new AbortController();
      const listeners = new Set<(fraction: number) => void>();
      const created: DownloadJob = {
        promise: Promise.resolve(''), progress: 0, listeners, consumers: 0, cancelled: false,
        cancel: () => { created.cancelled = true; controller.abort(); },
      };
      created.promise = this.performDownload(remoteUrl, finalPath, opts.expectedSize, controller.signal, (progress) => {
        created.progress = progress;
        listeners.forEach((listener) => { try { listener(progress); } catch {} });
      }).then((uri) => {
        if (generation !== this.generation) throw new MediaDownloadError('cancelled', 'Sesi unduhan berakhir');
        if (messageId) this.remember(messageId, uri);
        this.remember(remoteUrl, uri);
        return uri;
      }).finally(() => {
        if (this.downloads.get(finalPath) === created) this.downloads.delete(finalPath);
      });
      this.downloads.set(finalPath, created);
      job = created;
    }
    // One viewer detaches independently. Cancel the native/queued job only after its last consumer leaves.
    return new Promise<string>((resolve, reject) => {
      const progress = opts.onProgress;
      job!.consumers++;
      let attached = true;
      const cleanup = () => {
        if (!attached) return false;
        attached = false;
        job!.consumers--;
        if (progress) job!.listeners.delete(progress);
        opts.signal?.removeEventListener('abort', abort);
        return true;
      };
      const abort = () => {
        if (!cleanup()) return;
        if (job!.consumers === 0) job!.cancel();
        reject(new MediaDownloadError('cancelled', 'Tampilan ditutup'));
      };
      if (progress) {
        job!.listeners.add(progress);
        try { progress(job!.progress); } catch {}
      }
      opts.signal?.addEventListener('abort', abort, { once: true });
      if (opts.signal?.aborted) abort();
      job!.promise.then((uri) => {
        cleanup();
        if (opts.signal?.aborted) return;
        // Different consumers of the same job may supply different expected sizes.
        if (opts.expectedSize) {
          FileSystem.getInfoAsync(uri).then((info) => {
            if (info.exists && info.size === opts.expectedSize) resolve(uri);
            else reject(new MediaDownloadError('incomplete', 'Ukuran media tidak cocok'));
          }, () => reject(new MediaDownloadError('storage', 'Berkas tidak dapat dibaca')));
        } else resolve(uri);
      }, (err) => { cleanup(); reject(err); });
    });
  }

  private async performDownload(
    url: string, finalPath: string, expectedSize: number | undefined, signal: AbortSignal,
    progress: (fraction: number) => void
  ): Promise<string> {
    const release = await this.acquire(signal);
    const partPath = `${finalPath}.${++this.partSequence}.part`;
    let task: FileSystem.DownloadResumable | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let idle: ReturnType<typeof setTimeout> | undefined;
    let failure: MediaDownloadError | undefined;
    let rejectStopped: (reason: MediaDownloadError) => void = () => {};
    const stopped = new Promise<never>((_, reject) => { rejectStopped = reject; });
    // Always observed even if a storage operation fails before the native task starts.
    stopped.catch(() => {});
    const stop = (error: MediaDownloadError) => {
      if (failure) return;
      failure = error;
      rejectStopped(error);
      task?.cancelAsync().catch(() => {});
    };
    const abort = () => stop(new MediaDownloadError('cancelled', 'Unduhan dibatalkan'));
    try {
      if (signal.aborted) throw new MediaDownloadError('cancelled', 'Unduhan dibatalkan');
      signal.addEventListener('abort', abort, { once: true });
      await this.cleanPartialFiles();
      await this.ensureDirectory();
      const free = await FileSystem.getFreeDiskStorageAsync();
      const storageBudget = Math.max(0, free - MEDIA_DOWNLOAD_LIMITS.reserveBytes);
      if (storageBudget <= 0 || (expectedSize && storageBudget < expectedSize)) {
        throw new MediaDownloadError('storage', 'Ruang penyimpanan tidak cukup');
      }
      await FileSystem.deleteAsync(partPath, { idempotent: true });
      if (failure) throw failure;
      const resetIdle = () => {
        clearTimeout(idle);
        idle = setTimeout(() => stop(new MediaDownloadError('timeout', 'Unduhan tidak merespons')), MEDIA_DOWNLOAD_LIMITS.idleTimeoutMs);
      };
      let lastBytes = 0;
      let lastPercent = -1;
      task = FileSystem.createDownloadResumable(url, partPath, {
        sessionType: FileSystem.FileSystemSessionType.FOREGROUND,
      }, (p) => {
        if (failure) return;
        if (p.totalBytesWritten > storageBudget || p.totalBytesExpectedToWrite > storageBudget) {
          stop(new MediaDownloadError('storage', 'Ruang penyimpanan tidak cukup'));
          return;
        }
        if (p.totalBytesWritten > MEDIA_DOWNLOAD_LIMITS.maxBytes ||
          p.totalBytesExpectedToWrite > MEDIA_DOWNLOAD_LIMITS.maxBytes ||
          (expectedSize && p.totalBytesWritten > expectedSize)) {
          stop(new MediaDownloadError('too_large', 'Media lebih besar dari ukuran yang diizinkan'));
          return;
        }
        if (p.totalBytesWritten > lastBytes) {
          lastBytes = p.totalBytesWritten;
          resetIdle();
        }
        const total = expectedSize || p.totalBytesExpectedToWrite;
        const percent = total > 0 ? Math.min(99, Math.floor(p.totalBytesWritten * 100 / total)) : 0;
        if (percent !== lastPercent) { lastPercent = percent; progress(percent / 100); }
      });
      timer = setTimeout(() => stop(new MediaDownloadError('timeout', 'Unduhan terlalu lama')), MEDIA_DOWNLOAD_LIMITS.timeoutMs);
      resetIdle();
      const native = task.downloadAsync();
      let res: FileSystem.FileSystemDownloadResult | undefined;
      try {
        res = await Promise.race([native, stopped]);
      } catch (err) {
        // Wait until native cancellation has stopped writes before cleaning/reusing the .part path.
        await task.cancelAsync().catch(() => {});
        void native.catch(() => {});
        throw failure || err;
      }
      if (failure) throw failure;
      if (!res || res.status !== 200) {
        const code = res?.status === 404 || res?.status === 410 ? 'expired' :
          res?.status === 403 ? 'forbidden' : 'failed';
        throw new MediaDownloadError(code, 'Media tidak dapat diunduh');
      }
      const info = await FileSystem.getInfoAsync(partPath);
      const size = info.exists && !info.isDirectory ? info.size : 0;
      const headers = Object.fromEntries(Object.entries(res.headers || {}).map(([key, value]) => [key.toLowerCase(), value]));
      const contentLength = Number(headers['content-length']);
      const encoded = headers['content-encoding'] && headers['content-encoding'] !== 'identity';
      if (!size || (expectedSize && size !== expectedSize) ||
        (!encoded && Number.isSafeInteger(contentLength) && contentLength > 0 && contentLength !== size)) {
        throw new MediaDownloadError('incomplete', 'Unduhan tidak lengkap');
      }
      if (size > MEDIA_DOWNLOAD_LIMITS.maxBytes) throw new MediaDownloadError('too_large', 'Media terlalu besar');
      if (failure || signal.aborted) throw failure || new MediaDownloadError('cancelled', 'Unduhan dibatalkan');
      await FileSystem.moveAsync({ from: partPath, to: finalPath });
      progress(1);
      return finalPath;
    } catch (err) {
      await FileSystem.deleteAsync(partPath, { idempotent: true }).catch(() => {});
      if (err instanceof MediaDownloadError) throw err;
      if (typeof err === 'object' && err && 'code' in err && err.code === 'ENOSPC') {
        throw new MediaDownloadError('storage', 'Ruang penyimpanan habis');
      }
      // Native exceptions can include signed URLs: do not propagate/log their raw message.
      throw new MediaDownloadError('failed', 'Unduhan gagal. Periksa koneksi dan penyimpanan.');
    } finally {
      clearTimeout(timer);
      clearTimeout(idle);
      signal.removeEventListener('abort', abort);
      release();
    }
  }

  /** Compatibility entry point. Failure rejects; callers must never treat a remote URL as a saved copy. */
  public ensureMediaCached(remoteUrl: string, messageId = '', fileName?: string): Promise<string> {
    return this.downloadToCache(remoteUrl, messageId, fileName);
  }
}

export const mediaCache = new MediaCacheService();
