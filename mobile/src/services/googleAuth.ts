/**
 * WuzzChat Google Sign-In (Android Credential Manager lewat react-native-nitro-google-signin).
 *
 * Hanya mengambil ID token dari Google; verifikasinya dilakukan server (`POST /api/auth/google`). Setiap pemanggilan
 * memakai alur tombol resmi ("Sign in with Google": selalu menampilkan pemilih akun) sehingga token yang dikembalikan
 * baru diterbitkan. Itu penting untuk re-auth aksi sensitif yang hanya menerima token berusia maksimal 5 menit.
 *
 * Modul native dimuat malas (lazy) dan dibungkus try/catch: build lama yang belum memuat modulnya, atau lingkungan
 * uji, tidak crash; `isGoogleSignInAvailable()` saja yang bernilai false.
 */

import { GOOGLE_AUTH_CONFIG } from '../api/config';

export interface GoogleIdentity {
  idToken: string;
  email?: string;
  name?: string;
}

/** Galat yang sudah diterjemahkan ke pesan pengguna. `cancelled` bukan galat: pengguna menutup pemilih akun. */
export class GoogleAuthError extends Error {
  code: 'NOT_CONFIGURED' | 'PLAY_SERVICES' | 'DEVELOPER_ERROR' | 'IN_PROGRESS' | 'FAILED';
  constructor(code: GoogleAuthError['code'], message: string) {
    super(message);
    this.name = 'GoogleAuthError';
    this.code = code;
  }
}

type NativeModule = typeof import('react-native-nitro-google-signin');

let nativeModule: NativeModule | null | undefined; // undefined = belum dicoba, null = tidak tersedia
let configured = false;

function loadNative(): NativeModule | null {
  if (nativeModule !== undefined) return nativeModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    nativeModule = require('react-native-nitro-google-signin') as NativeModule;
  } catch (err) {
    console.warn('[googleAuth] Modul native Google Sign-In tidak tersedia pada build ini.');
    nativeModule = null;
  }
  return nativeModule;
}

/** Tombol Google hanya ditampilkan bila client ID diisi DAN modul native ada pada build ini. */
export function isGoogleSignInAvailable(): boolean {
  return GOOGLE_AUTH_CONFIG.WEB_CLIENT_ID.length > 0 && loadNative() !== null;
}

function ensureConfigured(native: NativeModule): void {
  if (configured) return;
  native.GoogleOneTapSignIn.configure({ webClientId: GOOGLE_AUTH_CONFIG.WEB_CLIENT_ID });
  configured = true;
}

/** Menerjemahkan galat library menjadi GoogleAuthError berpesan Indonesia (kode asli dicatat di log). */
export function mapGoogleError(err: unknown): GoogleAuthError {
  const code = (err as { code?: unknown } | null)?.code;
  console.warn('[googleAuth] Sign-in gagal:', typeof code === 'string' ? code : err);
  switch (code) {
    case 'PLAY_SERVICES_NOT_AVAILABLE':
      return new GoogleAuthError('PLAY_SERVICES', 'Google Play Services tidak tersedia atau perlu diperbarui di perangkat ini.');
    case 'DEVELOPER_ERROR':
      return new GoogleAuthError('DEVELOPER_ERROR', 'Login Google belum dikonfigurasi dengan benar pada versi aplikasi ini.');
    case 'IN_PROGRESS':
      return new GoogleAuthError('IN_PROGRESS', 'Proses login Google sedang berjalan. Tunggu sebentar lalu coba lagi.');
    default:
      return new GoogleAuthError('FAILED', 'Login dengan Google gagal. Periksa koneksi internet lalu coba lagi.');
  }
}

/**
 * Menampilkan pemilih akun Google dan mengembalikan identitas dengan ID token baru.
 * @returns null bila pengguna membatalkan (bukan kesalahan).
 * @throws GoogleAuthError untuk kegagalan nyata.
 */
export async function signInWithGoogle(): Promise<GoogleIdentity | null> {
  const native = loadNative();
  if (!native || GOOGLE_AUTH_CONFIG.WEB_CLIENT_ID.length === 0) {
    throw new GoogleAuthError('NOT_CONFIGURED', 'Login Google belum tersedia pada versi aplikasi ini.');
  }

  try {
    ensureConfigured(native);
    const response = await native.GoogleOneTapSignIn.presentExplicitSignIn();

    if (native.isCancelledResponse(response)) return null;
    if (!native.isSuccessResponse(response) || !response.data.idToken) {
      // "Tidak ada kredensial tersimpan" atau respons tanpa token: perlakukan sebagai kegagalan, bukan pembatalan.
      throw new GoogleAuthError('FAILED', 'Login dengan Google gagal. Coba lagi.');
    }

    const { idToken, user } = response.data;
    return { idToken, email: user?.email ?? undefined, name: user?.name ?? undefined };
  } catch (err) {
    if (err instanceof GoogleAuthError) throw err;
    // Pembatalan yang dilaporkan sebagai pengecualian.
    if ((err as { code?: unknown } | null)?.code === 'SIGN_IN_CANCELLED') return null;
    throw mapGoogleError(err);
  }
}

/** Menghapus sesi Google di SDK native (dipanggil saat logout agar pemilih akun tidak mengingat akun lama). Tak pernah melempar. */
export async function signOutGoogleLocal(): Promise<void> {
  const native = loadNative();
  if (!native || !configured) return;
  try {
    await native.GoogleOneTapSignIn.signOut();
  } catch {
    // Best-effort
  }
}
