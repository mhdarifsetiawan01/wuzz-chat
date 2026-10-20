/**
 * Teks dan aturan tampilan batas paket forum / kuota ringkasan AI. Modul murni (tanpa React/native) agar bisa diuji unit.
 * Server adalah satu-satunya penentu; modul ini hanya menjelaskan hasilnya. Salinan identik ada di web
 * (`frontend/lib/entitlement.ts`); ubah keduanya bersamaan.
 *
 * Teks sengaja netral: tidak mengajak membayar atau menyebut metode pembayaran apa pun.
 */

export interface EntitlementStatus {
  plan: 'free' | 'pro';
  source?: string;
  valid_until?: string;
  /** false = batas forum belum ditegakkan server (informasi saja). */
  limits_enforced: boolean;
  forums: { active: number; limit: number };
  allowed_duration_days: number[];
  ai: {
    /** false = kuota ringkasan AI belum ditegakkan server. */
    enforced: boolean;
    used: number;
    limit: number;
    /** Awal bulan kalender berikutnya (UTC), saat kuota dihitung ulang. */
    reset_at: string;
  };
}

const MONTHS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

export function planLabel(plan: string): string {
  return plan === 'pro' ? 'Pro' : 'Gratis';
}

/** Tanggal reset kuota ("1 November"); kosong bila tanggal tidak valid. */
export function formatResetDate(resetAt: string): string {
  const d = new Date(resetAt);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export interface ForumLimitNotice {
  text: string;
  /** true bila jatah forum aktif habis (tombol buat sebaiknya dinonaktifkan). */
  atLimit: boolean;
}

/** Info jatah forum aktif; null bila status tidak ada atau batas belum ditegakkan server. */
export function forumLimitNotice(ent: EntitlementStatus | null | undefined): ForumLimitNotice | null {
  if (!ent || !ent.limits_enforced) return null;
  const { active, limit } = ent.forums;
  const label = planLabel(ent.plan);
  if (active < limit) {
    return { text: `Forum aktif: ${active} dari ${limit} (paket ${label}).`, atLimit: false };
  }
  const next = ent.plan === 'pro'
    ? 'Akhiri salah satu forum yang sedang berjalan.'
    : 'Akhiri forum yang sedang berjalan, atau hubungi admin Wuzz untuk akses Pro.';
  return { text: `Batas forum aktif paket ${label} tercapai (${active} dari ${limit}). ${next}`, atLimit: true };
}

/** Apakah durasi (hari) boleh dipilih. Tanpa status atau batas belum ditegakkan = boleh (server tetap memeriksa). */
export function isDurationAllowed(ent: EntitlementStatus | null | undefined, days: number): boolean {
  if (!ent || !ent.limits_enforced) return true;
  return ent.allowed_duration_days.includes(days);
}

/** Keterangan pada opsi durasi yang tidak tersedia di paket; kosong bila tersedia. */
export function durationLockedNote(ent: EntitlementStatus | null | undefined, days: number): string {
  return isDurationAllowed(ent, days) ? '' : 'Tersedia di paket Pro';
}

export interface AiQuotaNotice {
  text: string;
  exhausted: boolean;
}

/** Info kuota ringkasan AI bulan ini; null bila status tidak ada atau kuota belum ditegakkan server. */
export function aiQuotaNotice(ent: EntitlementStatus | null | undefined): AiQuotaNotice | null {
  if (!ent || !ent.ai || !ent.ai.enforced) return null;
  const { used, limit, reset_at } = ent.ai;
  if (used < limit) {
    return { text: `Ringkasan AI bulan ini: ${used} dari ${limit}.`, exhausted: false };
  }
  const reset = formatResetDate(reset_at);
  return {
    text:
      `Kuota ringkasan AI bulan ini habis (${used} dari ${limit}). Topik tetap berjalan, tetapi ringkasan tidak dibuat saat topik berakhir.` +
      (reset ? ` Kuota dihitung ulang ${reset}.` : ''),
    exhausted: true,
  };
}

/** Pesan setelah topik diakhiri manual. `memory` dari respons server (queued | quota_exceeded | not_queued). */
export function expireOutcomeMessage(memory: string | undefined, memoryEnabled: boolean): string {
  if (memory === 'quota_exceeded') {
    return 'Forum telah diakhiri. Ringkasan AI tidak dibuat karena kuota bulan ini sudah habis. Riwayat diskusi tetap dapat dibaca.';
  }
  if (memory === 'queued' && memoryEnabled) {
    return 'Forum telah diakhiri. Ringkasan sedang diproses untuk ditinjau admin. Riwayat diskusi tetap dapat dibaca.';
  }
  return 'Forum telah diakhiri. Riwayat diskusi tetap dapat dibaca.';
}
