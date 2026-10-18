import type { MemoryDraftDetail } from '../../api/memory';

export function validateMemoryDraftTarget(draft: MemoryDraftDetail, groupId: string, forumId?: string): string | null {
  if (draft.group_id !== groupId || (forumId && draft.forum_id !== forumId)) {
    return 'Draf tidak sesuai dengan grup atau forum tujuan.';
  }
  if (draft.status !== 'DRAFT') return 'Draf ini sudah disetujui atau ditolak sebelumnya. Buka Arsip untuk melihat memori yang telah diterbitkan.';
  return null;
}

export function memoryDraftTargetError(err: { status?: number; detail?: string }): string {
  if (err?.status === 403) return 'Anda tidak memiliki akses untuk meninjau draf ini atau AI Memory tidak aktif untuk grup ini.';
  if (err?.status === 404) return 'Grup atau draf ini sudah tidak tersedia.';
  if (err?.status === 409) return 'Draf ini sudah disetujui atau ditolak sebelumnya.';
  return err?.detail || 'Gagal membuka draf. Silakan coba lagi.';
}
