/**
 * WuzzChat Mobile QR Code matrix generator.
 *
 * Membungkus `qrcode-generator` (pustaka JS murni, ISO/IEC 18004, tanpa modul native) dan
 * mengembalikan matriks boolean agar bisa digambar `QRCodeView` lewat react-native-svg.
 *
 * Catatan: generator buatan sendiri sebelumnya menghasilkan QR yang tidak valid (blok Reed-Solomon
 * versi 4-5 tidak di-interleave, payload panjang dipotong diam-diam) sehingga tidak ada pemindai
 * yang bisa membacanya. Jangan diganti dengan implementasi manual tanpa uji dekode.
 */

import qrcode from 'qrcode-generator';

/**
 * Generate a 2D boolean matrix representing the QR Code.
 * @param text The input string to encode
 * @returns 2D array of booleans (true = dark module, false = light module)
 */
export function generateQRMatrix(text: string): boolean[][] {
  // typeNumber 0 = pilih versi terkecil yang muat; koreksi galat level M (sama seperti sebelumnya).
  const qr = qrcode(0, 'M');
  // Pustaka mengubah karakter menjadi byte lewat charCode (8-bit). Ubah dulu ke byte UTF-8 secara
  // eksplisit supaya hasilnya sama di build CJS maupun ESM (Metro memakai ESM, yang tidak punya
  // `stringToBytesFuncs`); jangan bergantung pada properti global pustaka.
  const utf8 = Array.from(new TextEncoder().encode(text), (b) => String.fromCharCode(b)).join('');
  qr.addData(utf8, 'Byte');
  qr.make();

  const size = qr.getModuleCount();
  return Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, col) => qr.isDark(row, col))
  );
}
