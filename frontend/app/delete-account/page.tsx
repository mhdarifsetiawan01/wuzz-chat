import type { Metadata } from 'next'
import LegalPage from '../_legal/LegalPage'
import { SUPPORT_EMAIL } from '@/lib/legal'

export const metadata: Metadata = {
  title: 'Hapus Akun — WuzzChat',
  description: 'Cara menghapus akun WuzzChat beserta data pribadi Anda.',
}

export default function DeleteAccountPage() {
  return (
    <LegalPage title="Hapus Akun WuzzChat">
      <p>Anda dapat menghapus akun dan data pribadi Anda kapan saja. Penghapusan bersifat <strong>permanen dan tidak dapat dibatalkan</strong>.</p>

      <h2>Cara 1: lewat aplikasi (tercepat)</h2>
      <ol>
        <li>Buka aplikasi WuzzChat dan login.</li>
        <li>Masuk ke <strong>Pengaturan → Hapus Akun</strong>.</li>
        <li>Baca peringatan, lalu konfirmasi kepemilikan akun: pilih akun Google yang sama bila Anda masuk dengan Google, atau masukkan kata sandi bila akun Anda masih memakai kata sandi.</li>
      </ol>

      <h2>Cara 2: tidak bisa membuka aplikasi</h2>
      <p>
        Kirim email ke <a href={`mailto:${SUPPORT_EMAIL}?subject=Permintaan%20Hapus%20Akun`}>{SUPPORT_EMAIL}</a> dengan
        subjek &ldquo;Permintaan Hapus Akun&rdquo; dan sertakan username Anda. Untuk membuktikan kepemilikan, kami dapat meminta
        Anda memverifikasi lewat akun itu sendiri. Permintaan diproses dalam waktu wajar.
      </p>

      <h2>Data yang dihapus</h2>
      <ul>
        <li>Profil (nama, foto, bio, status), kata sandi, dan kunci publik.</li>
        <li>Sesi, perangkat terdaftar, dan token notifikasi push.</li>
        <li>Pesan yang Anda kirim (pesan langsung dan grup) dan pin yang Anda buat.</li>
        <li>Postingan, komentar, dan suka Anda di Linimasa komunitas.</li>
        <li>Data game Wuzz Grid: percobaan puzzle, streak, pengaturan, dan catatan moderasi papan publik. Anda otomatis hilang dari semua papan skor.</li>
        <li>Daftar teman, permintaan pertemanan, dan keanggotaan grup. Jika Anda pembuat grup, kepemilikan dialihkan ke anggota lain (atau grup dihapus jika Anda satu-satunya anggota).</li>
      </ul>

      <h2>Data yang dapat bertahan sementara</h2>
      <ul>
        <li>Pesan sandi (E2EE) yang sudah tersimpan di perangkat lawan bicara, karena berada di luar kendali kami.</li>
        <li>Berkas media yang sedang menunggu penghapusan otomatis (biasanya terhapus dalam waktu kurang dari satu hari).</li>
        <li>Salinan cadangan teknis untuk pemulihan bencana (mengikuti siklus rotasinya), dan catatan laporan moderasi seperlunya untuk keamanan.</li>
      </ul>

      {/* Keputusan K1, K9, K10 (15 Nov 2026). */}
      <h2>Star dan transaksi</h2>
      <ul>
        <li><strong>Saldo Star yang tersisa hangus</strong> bila Anda memilih menghapus akun, karena Star terikat pada akun dan tidak dapat dipindahkan atau diuangkan. Aplikasi menampilkan saldo Anda dan meminta konfirmasi sebelum akun dihapus. Pakai saldo Anda lebih dulu bila masih ingin memanfaatkannya.</li>
        <li>Catatan transaksi Star (riwayat Star, data pembelian Google Play, akses grup berbayar yang dibayar, utang Star, dan Star yang diterima mitra kreator) <strong>tetap disimpan sampai 10 tahun</strong> setelah akun dihapus, sesuai kewajiban penyimpanan dokumen pajak, hanya dengan ID akun internal tanpa nama atau profil, lalu dihapus.</li>
        <li>Pengembalian dana pembelian Star diajukan lewat Google Play, bukan lewat penghapusan akun.</li>
      </ul>
      <p>Lihat juga <a href="/privacy">Kebijakan Privasi</a>.</p>
    </LegalPage>
  )
}
