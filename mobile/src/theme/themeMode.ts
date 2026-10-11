/**
 * Logika murni pemilihan tema (tanpa React/native, supaya bisa diuji di Node).
 *
 * Preferensi pengguna (`ThemeMode`) berbeda dari skema yang dipakai menggambar (`ResolvedScheme`):
 *  - 'light' / 'dark' : pilihan eksplisit.
 *  - 'system'         : ikuti pengaturan OS (default).
 */

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedScheme = 'light' | 'dark';

export const THEME_MODES: readonly ThemeMode[] = ['light', 'dark', 'system'];

/** Mode yang ditawarkan di UI pengaturan. */
export const SELECTABLE_THEME_MODES: readonly ThemeMode[] = ['system', 'light', 'dark'];

/** Mode awal pemasangan baru dan fallback bila data tersimpan kosong/rusak: ikuti pengaturan sistem. */
export const DEFAULT_THEME_MODE: ThemeMode = 'system';

export function isThemeMode(value: unknown): value is ThemeMode {
  return typeof value === 'string' && (THEME_MODES as readonly string[]).includes(value);
}

/** Memulihkan mode dari nilai tersimpan; nilai tak dikenal jatuh ke default. */
export function parseThemeMode(raw: string | null | undefined): ThemeMode {
  return isThemeMode(raw) ? raw : DEFAULT_THEME_MODE;
}

/**
 * Menentukan skema gambar. `systemScheme` dari `useColorScheme()` bisa null/undefined (OS tak melaporkan);
 * dalam kasus itu 'system' jatuh ke terang.
 */
export function resolveScheme(mode: ThemeMode, systemScheme: string | null | undefined): ResolvedScheme {
  if (mode === 'system') return systemScheme === 'dark' ? 'dark' : 'light';
  return mode;
}
