/**
 * Aksi "Hubungkan akun Google" untuk akun yang sedang login, dipakai bersama oleh Pengaturan dan banner pengumuman.
 * Memunculkan pemilih akun Google, menautkan di server, lalu menampilkan hasilnya lewat dialog.
 */

import { useCallback, useRef, useState } from 'react';
import { useAuth } from '../context';
import { showAlert } from '../services/dialog';
import { googleErrorMessage } from '../utils/googleErrors';

export function useLinkGoogle(): { link: () => Promise<boolean>; isLinking: boolean } {
  const { linkGoogleToCurrentAccount } = useAuth();
  const [isLinking, setIsLinking] = useState(false);
  const inFlight = useRef(false);

  const link = useCallback(async (): Promise<boolean> => {
    if (inFlight.current) return false;
    inFlight.current = true;
    setIsLinking(true);
    try {
      const linked = await linkGoogleToCurrentAccount();
      if (linked) {
        showAlert('Berhasil', 'Akun Google berhasil dihubungkan. Sekarang Anda dapat masuk dengan Google.');
      }
      return linked;
    } catch (err: any) {
      showAlert('Gagal Menghubungkan', googleErrorMessage(err, 'Tidak dapat menghubungkan akun Google. Silakan coba lagi.'));
      return false;
    } finally {
      inFlight.current = false;
      setIsLinking(false);
    }
  }, [linkGoogleToCurrentAccount]);

  return { link, isLinking };
}
