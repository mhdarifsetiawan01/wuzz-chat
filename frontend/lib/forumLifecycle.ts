import type { MyForum } from './types';

export const needsForumReview = (f: MyForum): boolean =>
  !f.is_active && f.memory_enabled === true && f.memory_state === 'review_required' && !!f.draft_id &&
  (f.parent_role === 'admin' || f.parent_role === 'creator');

export function forumMemoryLabel(f: MyForum): string {
  if (f.is_active || f.memory_enabled !== true) return '';
  switch (f.memory_state) {
    case 'processing': return 'Memori sedang diproses';
    case 'under_review': return 'Sedang ditinjau admin';
    case 'review_required': return needsForumReview(f) ? 'Perlu ditinjau' : 'Sedang ditinjau admin';
    case 'published': return 'Memori tersedia';
    case 'failed': return f.parent_role === 'admin' || f.parent_role === 'creator'
      ? 'Pemrosesan gagal' : 'Ringkasan belum tersedia';
    case 'rejected': return 'Draf ditolak';
    default: return '';
  }
}
