/**
 * WuzzChat Mobile - Mention (@username) helpers (DEC-013)
 * Pemicu autocomplete, penyisipan @username, pemetaan username -> UUID, dan pemecahan teks untuk penyorotan.
 */

import type { GroupMember } from '../api/types';

export interface MentionTrigger {
  query: string;
  /** Indeks karakter '@' di dalam teks */
  startIdx: number;
}

const TRIGGER_REGEX = /(?:^|\s)@([a-zA-Z0-9_.-]*)$/;

/** Deteksi "@query" tepat sebelum kursor; null bila bukan konteks mention. */
export function detectMentionTrigger(text: string, cursor: number): MentionTrigger | null {
  const before = text.slice(0, cursor);
  const match = before.match(TRIGGER_REGEX);
  if (!match) return null;
  const query = match[1];
  return { query, startIdx: before.length - query.length - 1 };
}

/** Anggota yang cocok dengan query (username/display_name), tanpa diri sendiri. */
export function filterMentionMembers(
  members: GroupMember[] | undefined,
  query: string,
  selfId: string,
  limit = 6
): GroupMember[] {
  if (!members || members.length === 0) return [];
  const q = query.toLowerCase();
  return members
    .filter(
      (m) =>
        m.user_id !== selfId &&
        (m.username.toLowerCase().includes(q) || (m.display_name || '').toLowerCase().includes(q))
    )
    .slice(0, limit);
}

/** Ganti "@query" pada [startIdx, cursor) dengan "@username " dan hitung posisi kursor baru. */
export function insertMention(
  text: string,
  startIdx: number,
  cursor: number,
  username: string
): { text: string; cursor: number } {
  const insert = `@${username} `;
  return { text: text.slice(0, startIdx) + insert + text.slice(cursor), cursor: startIdx + insert.length };
}

/** UUID anggota yang masih ter-tag di teks akhir (dedupe). `tracked`: username lowercase -> user_id. */
export function collectMentionIds(text: string, tracked: Map<string, string>): string[] {
  const ids = new Set<string>();
  const re = /(?:^|\s)@([a-zA-Z0-9_.-]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const id = tracked.get(m[1].toLowerCase());
    if (id) ids.add(id);
  }
  return Array.from(ids);
}

export interface MentionSegment {
  text: string;
  isMention: boolean;
}

/** Pecah teks menjadi segmen biasa dan segmen @username (tanpa lookbehind demi kompatibilitas Hermes). */
export function splitMentions(text: string): MentionSegment[] {
  if (!text.includes('@')) return [{ text, isMention: false }];
  const out: MentionSegment[] = [];
  const re = /(^|\s)(@[a-zA-Z0-9_.-]+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const tagStart = m.index + m[1].length;
    if (tagStart > last) out.push({ text: text.slice(last, tagStart), isMention: false });
    out.push({ text: m[2], isMention: true });
    last = tagStart + m[2].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), isMention: false });
  return out;
}
