/**
 * Aksi "Ganti akun Google" untuk akun yang sudah tertaut (Pengaturan). Pemilih akun Google muncul dua kali:
 * pertama akun lama sebagai bukti kepemilikan, lalu akun baru. Hasilnya ditampilkan lewat dialog.
 */

import { useCallback, useRef, useState } from 'react';
import { useAuth } from '../context';
import { showAlert } from '../services/dialog';
import { googleErrorMessage } from '../utils/googleErrors';

export function useReplaceGoogle(): { replace: () => Promise<boolean>; isReplacing: boolean } {
  const { replaceGoogleOnCurrentAccount } = useAuth();
  const [isReplacing, setIsReplacing] = useState(false);
  const inFlight = useRef(false);

  const replace = useCallback(async (): Promise<boolean> => {
    if (inFlight.current) return false;
    inFlight.current = true;
    setIsReplacing(true);
    try {
      const replaced = await replaceGoogleOnCurrentAccount();
      if (replaced) {
        showAlert('Berhasil', 'Akun Google berhasil diganti. Gunakan akun Google yang baru untuk masuk.');
      }
      return replaced;
    } catch (err: any) {
      showAlert('Gagal Mengganti', googleErrorMessage(err, 'Tidak dapat mengganti akun Google. Silakan coba lagi.'));
      return false;
    } finally {
      inFlight.current = false;
      setIsReplacing(false);
    }
  }, [replaceGoogleOnCurrentAccount]);

  return { replace, isReplacing };
}
