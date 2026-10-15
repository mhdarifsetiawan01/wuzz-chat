/**
 * Util video chat. Thumbnail video TIDAK disimpan di database: kunci/URL-nya diturunkan dari URL video
 * (`<uuid>.mp4` -> `<uuid>.thumb.jpg`) dengan aturan yang sama seperti backend (storage.VideoThumbnailURL).
 */

import type { Message } from '../api/types';

const VIDEO_EXT_RE = /\.(mp4|mov|m4v|webm)$/i;

function stripQuery(url: string): string {
  const i = url.search(/[?#]/);
  return i >= 0 ? url.slice(0, i) : url;
}

/** Pesan video: ditandai media_type 'video'. Ekstensi dipakai hanya bila media_type kosong (data lama). */
export function isVideoMessage(message: Pick<Message, 'media_type' | 'media_url' | 'type'>): boolean {
  if (!message.media_url) return false;
  if (message.media_type === 'video' || message.type === 'video') return true;
  if (message.media_type) return false; // 'audio' (.webm), 'image', dst. tidak boleh dianggap video
  return VIDEO_EXT_RE.test(stripQuery(message.media_url));
}

/** URL thumbnail turunan untuk URL video jarak jauh; null untuk berkas lokal atau URL yang bukan video. */
export function getVideoThumbnailUrl(videoUrl?: string | null): string | null {
  if (!videoUrl || !/^https?:\/\//i.test(videoUrl)) return null;
  const clean = stripQuery(videoUrl);
  const m = clean.match(VIDEO_EXT_RE);
  if (!m) return null;
  return clean.slice(0, clean.length - m[0].length) + '.thumb.jpg';
}

export function formatVideoSize(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
