/**
 * Sinyal global "akun ditangguhkan moderator" (HTTP 403 ACCOUNT_SUSPENDED atau penutupan WebSocket 4004).
 * Modul murni (tanpa React/native) supaya bisa diuji unit. Pola sama dengan linkFrozen.ts.
 */

export const ACCOUNT_SUSPENDED = 'ACCOUNT_SUSPENDED';

/** Kode penutupan WebSocket dari server untuk akun yang ditangguhkan (kode 4003 dipakai pembekuan Google). */
export const SUSPENDED_CLOSE_CODE = 4004;

type Listener = () => void;
const listeners = new Set<Listener>();

/** Mendaftarkan pendengar; mengembalikan fungsi untuk berhenti mendengar. Tidak ada status tersimpan: tiap kejadian baru. */
export function onAccountSuspended(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Memberi tahu semua pendengar. Galat di satu pendengar tidak menghentikan yang lain. */
export function notifyAccountSuspended(): void {
  listeners.forEach((l) => {
    try {
      l();
    } catch (err) {
      console.error('[AccountSuspended] Listener execution error:', err);
    }
  });
}

interface ErrorLike {
  status?: number;
  code?: string;
  data?: { code?: string } | null;
}

/** Apakah galat API adalah penolakan karena akun ditangguhkan. */
export function isAccountSuspendedError(err: ErrorLike | null | undefined): boolean {
  if (!err) return false;
  return err.code === ACCOUNT_SUSPENDED || err.data?.code === ACCOUNT_SUSPENDED;
}

/**
 * Apakah penutupan WebSocket (kode + alasan) berasal dari penangguhan. Alasan WAJIB memuat ACCOUNT_SUSPENDED dan kodenya
 * 4004 (server saat ini) atau 4001 (tendangan paksa versi server lama). Kode 4001 dengan alasan ini HARUS dikenali
 * sebagai penangguhan, bukan "sesi digantikan": cabang itu menghapus kunci E2EE dan data lokal, padahal akun yang
 * ditangguhkan bisa dipulihkan dan pemiliknya tidak boleh kehilangan pesan lamanya.
 */
export function isSuspendedClose(code: number, reason: string | undefined): boolean {
  if (!reason || !reason.includes(ACCOUNT_SUSPENDED)) return false;
  return code === SUSPENDED_CLOSE_CODE || code === 4001;
}
