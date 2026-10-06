/**
 * Sinyal global "akun dibekukan: wajib menautkan Google" (HTTP 403 GOOGLE_LINK_REQUIRED atau penutupan WebSocket).
 * Modul murni (tanpa React/native) supaya bisa diuji unit. Pola sama dengan onForceUpdateRequired di appVersion.
 */

export const GOOGLE_LINK_REQUIRED = 'GOOGLE_LINK_REQUIRED';

type Listener = () => void;
const listeners = new Set<Listener>();

/** Mendaftarkan pendengar; mengembalikan fungsi untuk berhenti mendengar. Tidak ada status tersimpan: tiap kejadian baru. */
export function onGoogleLinkRequired(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Memberi tahu semua pendengar. Galat di satu pendengar tidak menghentikan yang lain. */
export function notifyGoogleLinkRequired(): void {
  listeners.forEach((l) => {
    try {
      l();
    } catch (err) {
      console.error('[LinkFrozen] Listener execution error:', err);
    }
  });
}

interface ErrorLike {
  status?: number;
  code?: string;
  data?: { code?: string } | null;
}

/** Apakah galat API adalah penolakan karena akun beku. */
export function isGoogleLinkRequiredError(err: ErrorLike | null | undefined): boolean {
  if (!err) return false;
  return err.code === GOOGLE_LINK_REQUIRED || err.data?.code === GOOGLE_LINK_REQUIRED;
}

/** Apakah penutupan WebSocket (kode + alasan) berasal dari pembekuan. Kode 4003 juga dipakai klien lama sebagai penutupan terminal. */
export function isLinkRequiredClose(code: number, reason: string | undefined): boolean {
  return code === 4003 && !!reason && reason.includes(GOOGLE_LINK_REQUIRED);
}
