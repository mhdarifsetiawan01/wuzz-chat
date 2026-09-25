/**
 * WuzzChat Persistent Local Media Cache Service (DEC-034)
 *
 * Implements a persistent, resilient local filesystem storage layer for media
 * (images, voice notes) in the mobile client.
 *
 * WhatsApp Store-and-Forward Lifecycle alignment:
 *  - When a sender uploads media, a copy is immediately persisted in local storage.
 *  - When a recipient downloads/views media, it is saved into local storage.
 *  - When server Store-and-Forward deletes the physical file upon ACK (`media_status === 'expired'`),
 *    the mobile client continues rendering the cached local file without interruption.
 */

import * as FileSystem from 'expo-file-system/legacy';

const CACHE_FOLDER = 'wuzzchat_media/';

class MediaCacheService {
  private baseDir: string | null = null;
  private isDirInitialized = false;
  private memoryCache = new Map<string, string>();
  private activeDownloads = new Map<string, Promise<string>>();

  constructor() {
    this.initBaseDir();
  }

  private initBaseDir() {
    const root = FileSystem.documentDirectory || FileSystem.cacheDirectory;
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
    if (!this.baseDir) return null;

    if (!this.isDirInitialized) {
      try {
        const dirInfo = await FileSystem.getInfoAsync(this.baseDir);
        if (!dirInfo.exists) {
          await FileSystem.makeDirectoryAsync(this.baseDir, { intermediates: true });
        }
        this.isDirInitialized = true;
      } catch (err) {
        console.warn('[MediaCache] Failed to initialize media cache directory:', err);
      }
    }
    return this.baseDir;
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
    const extMatch = nameSource.match(/\.([a-zA-Z0-9]+)(?:[?#]|$)/);
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
      key = messageId.replace(/[^a-zA-Z0-9_-]/g, '_');
    } else if (mediaUrl) {
      // Simple hash from URL
      let hash = 0;
      for (let i = 0; i < mediaUrl.length; i++) {
        hash = (hash << 5) - hash + mediaUrl.charCodeAt(i);
        hash |= 0;
      }
      key = `url_${Math.abs(hash)}`;
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
    fileName?: string | null
  ): Promise<string | null> {
    if (!mediaUrl && !messageId) return null;

    // Check fast in-memory cache
    if (messageId && this.memoryCache.has(messageId)) {
      return this.memoryCache.get(messageId)!;
    }
    if (mediaUrl && this.memoryCache.has(mediaUrl)) {
      return this.memoryCache.get(mediaUrl)!;
    }

    // If mediaUrl is already a local file:// URI, return it
    if (mediaUrl && (mediaUrl.startsWith('file://') || mediaUrl.startsWith('ph://') || mediaUrl.startsWith('content://'))) {
      if (messageId) this.memoryCache.set(messageId, mediaUrl);
      return mediaUrl;
    }

    const localPath = this.getLocalFilePath(mediaUrl, messageId, fileName);
    if (!localPath) return null;

    try {
      const info = await FileSystem.getInfoAsync(localPath);
      if (info.exists && (info as any).size > 0) {
        if (messageId) this.memoryCache.set(messageId, localPath);
        if (mediaUrl) this.memoryCache.set(mediaUrl, localPath);
        return localPath;
      }
    } catch {
      // Ignore filesystem read errors
    }

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
    await this.ensureDirectory();
    const destPath = this.getLocalFilePath(remoteUrl || sourceUri, messageId, fileName);
    if (!destPath) return sourceUri;

    try {
      // If source and dest are identical, just register in cache
      if (sourceUri === destPath) {
        this.memoryCache.set(messageId, destPath);
        if (remoteUrl) this.memoryCache.set(remoteUrl, destPath);
        return destPath;
      }

      await FileSystem.copyAsync({
        from: sourceUri,
        to: destPath,
      });

      this.memoryCache.set(messageId, destPath);
      if (remoteUrl) this.memoryCache.set(remoteUrl, destPath);
      console.log(`[MediaCache] Persisted local file for msg ${messageId} -> ${destPath}`);
      return destPath;
    } catch (err) {
      console.warn('[MediaCache] Failed to copy local file to cache:', err);
      this.memoryCache.set(messageId, sourceUri);
      return sourceUri;
    }
  }

  /**
   * Ensures a remote media URL is downloaded and stored in the persistent cache.
   * If already cached, returns local URI immediately.
   * If download in-progress, reuses the existing download promise.
   */
  public async ensureMediaCached(
    remoteUrl: string,
    messageId?: string,
    fileName?: string
  ): Promise<string> {
    if (!remoteUrl) return '';

    // If already local file URI, return directly
    if (remoteUrl.startsWith('file://') || remoteUrl.startsWith('ph://') || remoteUrl.startsWith('content://')) {
      return remoteUrl;
    }

    // Check if already in cache
    const existing = await this.getCachedMediaUri(remoteUrl, messageId, fileName);
    if (existing) {
      return existing;
    }

    const downloadKey = messageId || remoteUrl;
    if (this.activeDownloads.has(downloadKey)) {
      return this.activeDownloads.get(downloadKey)!;
    }

    const downloadPromise = (async () => {
      await this.ensureDirectory();
      const localPath = this.getLocalFilePath(remoteUrl, messageId, fileName);
      if (!localPath) return remoteUrl;

      try {
        console.log(`[MediaCache] Downloading media to cache: ${remoteUrl.slice(0, 60)}...`);
        const result = await FileSystem.downloadAsync(remoteUrl, localPath);
        if (result.status === 200 && result.uri) {
          if (messageId) this.memoryCache.set(messageId, result.uri);
          this.memoryCache.set(remoteUrl, result.uri);
          console.log(`[MediaCache] Successfully cached media to: ${result.uri}`);
          return result.uri;
        }
      } catch (err) {
        console.warn(`[MediaCache] Failed to download media for ${messageId || remoteUrl}:`, err);
      } finally {
        this.activeDownloads.delete(downloadKey);
      }
      return remoteUrl;
    })();

    this.activeDownloads.set(downloadKey, downloadPromise);
    return downloadPromise;
  }
}

export const mediaCache = new MediaCacheService();
