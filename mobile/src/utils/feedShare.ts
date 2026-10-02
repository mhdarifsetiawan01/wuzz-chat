/**
 * Format pesan chat untuk postingan feed yang dibagikan.
 * Isi pesan tetap teks yang terbaca (kompatibel dengan klien lama), diakhiri satu baris
 * penanda `wuzzchat://post/<id>` yang dikenali klien baru untuk dirender sebagai kartu.
 */

import { FeedPost } from '../api/types';

const MARKER_PREFIX = 'wuzzchat://post/';
const MARKER_REGEX = /(?:^|\n)wuzzchat:\/\/post\/([A-Za-z0-9_-]{1,64})\s*$/;

export interface SharedPostRef {
  postId: string;
  /** Isi pesan tanpa baris penanda */
  text: string;
}

export function buildSharedPostMessage(post: FeedPost): string {
  const authorName = post.author?.display_name || post.author?.username || 'Pengguna';
  const snippet = post.content.length > 250 ? `${post.content.slice(0, 250)}...` : post.content;

  let message = `📢 Postingan Komunitas oleh @${authorName}\n\n"${snippet}"`;
  if (post.media_urls && post.media_urls.length > 0) {
    message += `\n\n📷 ${post.media_urls.length} foto`;
  }
  return `${message}\n${MARKER_PREFIX}${post.id}`;
}

export function parseSharedPost(content?: string | null): SharedPostRef | null {
  if (!content) return null;
  const match = content.match(MARKER_REGEX);
  if (!match) return null;
  return {
    postId: match[1],
    text: content.slice(0, match.index).trimEnd(),
  };
}
