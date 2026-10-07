/**
 * Perbaikan teks terpotong di Android 16 (XOS/Infinix).
 *
 * Gejala: <Text> satu baris yang lebarnya mengikuti isi tergambar kurang beberapa karakter
 * ("16:35" jadi "16:3", "Grup Publik" jadi "Grup"). Lebar kotak dihitung React Native dari
 * advance huruf, sedangkan TextView Android 16 membutuhkan sedikit lebih lebar (batas glyph)
 * sehingga karakter terakhir terbungkus ke baris kedua yang tak terlihat.
 *
 * Solusi: tambahkan satu thin space (U+2009) di ujung string anak. Spasi di ujung baris tidak
 * ikut dihitung saat pemutusan baris berbasis batas glyph, tetapi lebarnya ikut terukur oleh
 * React Native, sehingga kotak punya ruang cadangan beberapa piksel.
 *
 * Teks bertumpuk (<Text> di dalam <Text>) tidak diberi spasi, agar potongan kalimat berwarna
 * ("Wuzz" + "Chat") tidak terpisah celah. Hanya aktif di Android 16+ (API 36); perangkat lain tidak tersentuh sama sekali. Modul ini
 * harus diimpor paling awal (sebelum App) agar komponen yang menangkap `Text` saat dimuat
 * ikut memakai versi tambalan.
 */
import React from 'react';
import { Platform } from 'react-native';

const THIN_SPACE = '\u2009';

// true di dalam subtree <Text> lain: potongan teks bertumpuk jangan ditambah spasi.
const InsideTextContext = React.createContext(false);

function withTrailingSpace(children: unknown): unknown {
  if (typeof children === 'string') {
    return children.length > 0 ? children + THIN_SPACE : children;
  }
  if (typeof children === 'number') {
    return String(children) + THIN_SPACE;
  }
  if (Array.isArray(children) && children.length > 0) {
    const last = children[children.length - 1];
    if (typeof last === 'string' || typeof last === 'number') {
      const copy = children.slice();
      copy[copy.length - 1] = String(last) + THIN_SPACE;
      return copy;
    }
  }
  return children;
}

export function applyAndroidTextFix(): void {
  if (Platform.OS !== 'android') return;
  if (typeof Platform.Version === 'number' && Platform.Version < 36) return;

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const rn = require('react-native');
    const descriptor = Object.getOwnPropertyDescriptor(rn, 'Text');
    // Hanya ganti bila properti memang bisa didefinisikan ulang; jika tidak, biarkan apa adanya.
    if (!descriptor || descriptor.configurable === false) return;

    const OriginalText = rn.Text;
    if (!OriginalText) return;

    const PatchedText = (props: any) => {
      const nested = React.useContext(InsideTextContext);
      const children = props?.children;
      const next = nested ? children : withTrailingSpace(children);
      const element = React.createElement(
        OriginalText,
        next === children ? props : { ...props, children: next }
      );
      // Provider hanya perlu bila anak berisi elemen (kemungkinan <Text> bertumpuk).
      const mayHaveNestedText = typeof children !== 'string' && typeof children !== 'number';
      return !nested && mayHaveNestedText
        ? React.createElement(InsideTextContext.Provider, { value: true }, element)
        : element;
    };
    (PatchedText as any).displayName = 'Text';

    Object.defineProperty(rn, 'Text', {
      configurable: true,
      enumerable: true,
      get: () => PatchedText,
    });
  } catch {
    // Perbaikan kosmetik; jangan pernah menjatuhkan aplikasi.
  }
}

applyAndroidTextFix();
