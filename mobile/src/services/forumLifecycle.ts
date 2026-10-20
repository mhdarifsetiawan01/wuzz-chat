import type { MyForum } from '../api/types';

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
    case 'quota_exceeded': return 'Ringkasan tidak dibuat (kuota habis)';
    default: return '';
  }
}

// One owner per mounted account/session. Late responses cannot restore invalidated badges.
export class ForumListState {
  private generation = 0;
  private controller: AbortController | null = null;
  constructor(private publish: (items: MyForum[], failed: boolean) => void) {}
  cancel() { this.generation++; this.controller?.abort(); }
  async refresh(fetcher: (signal: AbortSignal) => Promise<MyForum[]>) {
    this.cancel();
    const generation = this.generation;
    const controller = new AbortController();
    this.controller = controller;
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const items = await fetcher(controller.signal);
      if (generation === this.generation) {
        this.publish(controller.signal.aborted ? [] : items, controller.signal.aborted);
      }
    } catch {
      if (generation === this.generation) this.publish([], true);
    } finally { clearTimeout(timer); }
  }
}
