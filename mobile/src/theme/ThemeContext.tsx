/**
 * Tema dinamis: ThemeProvider, useTheme, dan useThemedStyles.
 *
 * Migrasi sebuah file dari `colors` statis:
 *   const makeStyles = (c: ColorTokens) => StyleSheet.create({ box: { backgroundColor: c.bgSurface } });
 *   const styles = useThemedStyles(makeStyles);   // di dalam komponen
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance, useColorScheme } from 'react-native';
import { secureStorage } from '../services/secureStorage';
import { ColorTokens, lightColors } from './colors';
import { darkColors } from './darkColors';
import { Typography, makeTypography } from './typography';
import {
  DEFAULT_THEME_MODE,
  ResolvedScheme,
  ThemeMode,
  parseThemeMode,
  resolveScheme,
} from './themeMode';

/** Preferensi tema berlaku per perangkat (bukan per akun), jadi disimpan tanpa awalan user id. */
const THEME_MODE_STORAGE_KEY = 'wuzz_theme_mode';

export interface ThemeContextValue {
  /** Pilihan pengguna ('light' | 'dark' | 'system'). */
  mode: ThemeMode;
  /** Skema yang benar-benar dipakai menggambar. */
  scheme: ResolvedScheme;
  isDark: boolean;
  colors: ColorTokens;
  typography: Typography;
  setMode: (mode: ThemeMode) => void;
}

const LIGHT_TYPOGRAPHY = makeTypography(lightColors);
const DARK_TYPOGRAPHY = makeTypography(darkColors);

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>(DEFAULT_THEME_MODE);

  // Pulihkan pilihan tersimpan. Gagal baca => tetap default (tema tidak boleh menghalangi aplikasi terbuka).
  useEffect(() => {
    let cancelled = false;
    secureStorage
      .getItem(THEME_MODE_STORAGE_KEY)
      .then((raw) => {
        if (!cancelled && raw) setModeState(parseThemeMode(raw));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Selaraskan tema native (keyboard, dialog sistem, picker) dengan pilihan aplikasi. 'unspecified' = ikuti sistem.
  useEffect(() => {
    try {
      Appearance.setColorScheme(mode === 'system' ? 'unspecified' : mode);
    } catch {
      // modul native tak tersedia (mis. preview web): tema JS tetap berjalan
    }
  }, [mode]);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    secureStorage.setItem(THEME_MODE_STORAGE_KEY, next).catch(() => {});
  }, []);

  const scheme = resolveScheme(mode, systemScheme);

  const value = useMemo<ThemeContextValue>(() => {
    const palette = scheme === 'dark' ? darkColors : lightColors;
    return {
      mode,
      scheme,
      isDark: scheme === 'dark',
      colors: palette,
      typography: scheme === 'dark' ? DARK_TYPOGRAPHY : LIGHT_TYPOGRAPHY,
      setMode,
    };
  }, [mode, scheme, setMode]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme harus dipakai di dalam <ThemeProvider>');
  return ctx;
}

/** Membuat style dari token tema aktif; dihitung ulang hanya saat skema berganti. */
export function useThemedStyles<T>(factory: (c: ColorTokens, scheme: ResolvedScheme) => T): T {
  const { colors, scheme } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `factory` didefinisikan di level modul (stabil)
  return useMemo(() => factory(colors, scheme), [colors, scheme]);
}
