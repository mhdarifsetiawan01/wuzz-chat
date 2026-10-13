/**
 * Sinyal sekali pakai antar layar: setelah "Buat grup baru" dari Bubble Forum selesai,
 * beranda membuka form forum untuk grup yang baru dibuat. Hanya di memori; hilang bila aplikasi ditutup.
 */

import type { Conversation } from '../api/types';

let pendingGroup: Conversation | null = null;

export function setPendingForumGroup(group: Conversation): void {
  pendingGroup = group;
}

/** Mengambil lalu mengosongkan sinyal. */
export function consumePendingForumGroup(): Conversation | null {
  const group = pendingGroup;
  pendingGroup = null;
  return group;
}
