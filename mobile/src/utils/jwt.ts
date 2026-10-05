import { toByteArray } from 'base64-js';

interface JwtTimes {
  iat: number;
  exp: number;
}

/** Membaca iat/exp (detik) dari payload JWT tanpa verifikasi tanda tangan (hanya untuk menjadwalkan refresh). */
export function decodeJwtTimes(token: string): JwtTimes | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    let b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4 !== 0) b64 += '=';
    const bytes = toByteArray(b64);
    let json = '';
    for (let i = 0; i < bytes.length; i++) json += String.fromCharCode(bytes[i]);
    const payload = JSON.parse(decodeURIComponent(escape(json)));
    if (typeof payload.iat !== 'number' || typeof payload.exp !== 'number') return null;
    return { iat: payload.iat, exp: payload.exp };
  } catch {
    return null;
  }
}

/** True bila sisa masa berlaku token < 50% dari umur totalnya (selaras dengan auth.RefreshWindow di backend). */
export function shouldRefreshToken(token: string, nowMs: number = Date.now()): boolean {
  const times = decodeJwtTimes(token);
  if (!times) return false;
  const remainingMs = times.exp * 1000 - nowMs;
  const lifetimeMs = (times.exp - times.iat) * 1000;
  if (lifetimeMs <= 0 || remainingMs <= 0) return false;
  return remainingMs < lifetimeMs / 2;
}
