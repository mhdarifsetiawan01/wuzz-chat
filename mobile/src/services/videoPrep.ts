/**
 * Persiapan video sebelum dikirim: validasi durasi, kompresi di HP, pemeriksaan ukuran, dan pembuatan thumbnail.
 * Batas harus sama dengan backend (MAX_VIDEO_UPLOAD_MB=25, MAX_VIDEO_DURATION_SEC=60, thumbnail <= 512 KB);
 * backend tetap memvalidasi ulang ukuran/tipe saat menerbitkan tiket unggah.
 */

import * as FileSystem from 'expo-file-system/legacy';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { Video as VideoCompressor } from 'react-native-compressor';

export const VIDEO_MAX_DURATION_SEC = 60;
export const VIDEO_MAX_BYTES = 25 * 1024 * 1024;
export const VIDEO_THUMB_MAX_BYTES = 512 * 1024;

export interface PreparedVideo {
  uri: string;
  fileName: string;
  fileSize: number;
  mimeType: 'video/mp4';
  thumbUri: string;
  thumbSize: number;
  width?: number;
  height?: number;
  durationMs?: number;
}

/** Galat yang pesannya aman ditampilkan langsung ke pengguna. */
export class VideoPrepError extends Error {}

async function fileSizeOf(uri: string): Promise<number> {
  const info = await FileSystem.getInfoAsync(uri);
  return info.exists && typeof info.size === 'number' ? info.size : 0;
}

async function makeThumbnail(videoUri: string): Promise<{ uri: string; size: number; width: number; height: number }> {
  // Kualitas diturunkan bertahap sampai muat di batas thumbnail.
  for (const quality of [0.6, 0.4, 0.25]) {
    const thumb = await VideoThumbnails.getThumbnailAsync(videoUri, { time: 0, quality });
    const size = await fileSizeOf(thumb.uri);
    if (size > 0 && size <= VIDEO_THUMB_MAX_BYTES) {
      return { uri: thumb.uri, size, width: thumb.width, height: thumb.height };
    }
  }
  throw new VideoPrepError('Gagal membuat pratinjau video. Coba video lain.');
}

function baseName(fileName?: string | null): string {
  const raw = (fileName || '').replace(/\.[^./]+$/, '').replace(/[^\w.-]+/g, '_');
  return raw || `video_${Date.now()}`;
}

/**
 * Memvalidasi dan menyiapkan video. onProgress (0..1) mencakup tahap kompresi.
 * Melempar VideoPrepError bila video ditolak (terlalu panjang / tetap terlalu besar / gagal diproses).
 */
export async function prepareVideo(
  sourceUri: string,
  opts: { fileName?: string | null; durationMs?: number | null; onProgress?: (p: number) => void } = {}
): Promise<PreparedVideo> {
  const { durationMs, onProgress } = opts;

  if (durationMs && durationMs > VIDEO_MAX_DURATION_SEC * 1000) {
    throw new VideoPrepError(`Video terlalu panjang. Durasi maksimal ${VIDEO_MAX_DURATION_SEC} detik.`);
  }

  let outUri = sourceUri;
  try {
    outUri = await VideoCompressor.compress(
      sourceUri,
      { compressionMethod: 'auto', maxSize: 1280, minimumFileSizeForCompress: 0 },
      (p) => onProgress?.(Math.min(1, Math.max(0, p)))
    );
  } catch (err) {
    console.warn('[videoPrep] Kompresi otomatis gagal, memakai berkas asli:', err);
    outUri = sourceUri;
  }

  let size = await fileSizeOf(outUri);

  // Masih terlalu besar: coba sekali lagi dengan bitrate rendah dan resolusi lebih kecil.
  if (size > VIDEO_MAX_BYTES) {
    try {
      outUri = await VideoCompressor.compress(
        sourceUri,
        { compressionMethod: 'manual', bitrate: 1_200_000, maxSize: 854 },
        (p) => onProgress?.(Math.min(1, Math.max(0, p)))
      );
      size = await fileSizeOf(outUri);
    } catch (err) {
      console.warn('[videoPrep] Kompresi ulang gagal:', err);
    }
  }

  if (size <= 0) {
    throw new VideoPrepError('Video tidak dapat dibaca. Coba pilih video lain.');
  }
  if (size > VIDEO_MAX_BYTES) {
    throw new VideoPrepError(
      `Video terlalu besar (${(size / 1024 / 1024).toFixed(1)} MB). Maksimal ${VIDEO_MAX_BYTES / 1024 / 1024} MB, coba video yang lebih pendek.`
    );
  }

  const thumb = await makeThumbnail(outUri);

  return {
    uri: outUri,
    fileName: `${baseName(opts.fileName)}.mp4`,
    fileSize: size,
    mimeType: 'video/mp4',
    thumbUri: thumb.uri,
    thumbSize: thumb.size,
    width: thumb.width,
    height: thumb.height,
    durationMs: durationMs ?? undefined,
  };
}
