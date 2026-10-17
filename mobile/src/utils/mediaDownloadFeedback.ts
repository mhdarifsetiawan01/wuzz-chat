import { MediaDownloadError } from '../services/mediaCache';

/** No raw native error text: it may contain a private path or a signed storage URL. */
export function mediaDownloadFeedback(error: unknown, kind = 'Media'): { title: string; message: string } | null {
  const code = error instanceof MediaDownloadError ? error.code : 'failed';
  if (code === 'cancelled') return null;
  switch (code) {
    case 'expired': return { title: `${kind} Tidak Tersedia`, message: 'Berkas sudah dihapus atau kedaluwarsa di server.' };
    case 'forbidden': return { title: `Akses ${kind} Ditolak`, message: 'Server menolak akses berkas. Coba lagi nanti.' };
    case 'storage': return { title: 'Penyimpanan Tidak Tersedia', message: 'Periksa ruang kosong dan akses penyimpanan, lalu coba lagi.' };
    case 'too_large': return { title: `${kind} Terlalu Besar`, message: 'Ukuran berkas melebihi batas unduhan aplikasi.' };
    case 'unsafe_url': return { title: `Sumber ${kind} Tidak Diizinkan`, message: 'Alamat berkas tidak berasal dari penyimpanan media yang didukung.' };
    case 'timeout': return { title: 'Unduhan Terhenti', message: 'Koneksi terlalu lambat atau tidak merespons. Ketuk untuk mencoba lagi.' };
    case 'busy': return { title: 'Antrean Unduhan Penuh', message: 'Tunggu unduhan lain selesai, lalu coba lagi.' };
    default: return { title: `Gagal Mengunduh ${kind}`, message: 'Periksa koneksi dan penyimpanan, lalu ketuk untuk mencoba lagi.' };
  }
}
