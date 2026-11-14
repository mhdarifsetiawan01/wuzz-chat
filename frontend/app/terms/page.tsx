import type { Metadata } from 'next'
import LegalPage from '../_legal/LegalPage'
import { SUPPORT_EMAIL } from '@/lib/legal'

export const metadata: Metadata = {
  title: 'Syarat Layanan — Wuzz Chat',
  description: 'Aturan penggunaan Wuzz Chat, termasuk konten yang dilarang dan cara pelaporan.',
}

export default function TermsPage() {
  return (
    <LegalPage title="Syarat Layanan">
      <p>Dengan membuat akun atau memakai Wuzz Chat, Anda menyetujui syarat berikut. Jika tidak setuju, mohon jangan menggunakan layanan.</p>

      <h2>1. Akun</h2>
      <ul>
        <li>Anda berusia minimal 13 tahun dan memberi informasi yang benar.</li>
        <li>Anda menjaga kerahasiaan kata sandi dan bertanggung jawab atas aktivitas akun Anda.</li>
        <li>Satu akun dibatasi maksimal 2 perangkat aktif.</li>
      </ul>

      <h2>2. Konten dan perilaku yang dilarang</h2>
      <p>Anda tidak boleh mengirim atau membagikan konten yang:</p>
      <ul>
        <li>melecehkan, mengancam, merundung, atau mengandung ujaran kebencian;</li>
        <li>mengeksploitasi atau melecehkan anak secara seksual (lihat <a href="/child-safety">Standar Keselamatan Anak</a>);</li>
        <li>bermuatan seksual eksplisit, eksploitasi anak, atau kekerasan ekstrem;</li>
        <li>penipuan, spam, peniruan identitas, atau pelanggaran hak kekayaan intelektual;</li>
        <li>melanggar hukum, atau mengganggu keamanan dan kinerja layanan (peretasan, otomatisasi massal, dsb.);</li>
        <li>memanipulasi game atau papan skor (misalnya memakai skrip atau celah untuk memalsukan waktu), atau memakai username yang melanggar daftar di atas pada papan publik.</li>
      </ul>

      <h2>3. Pelaporan dan pemblokiran</h2>
      <p>
        Setiap pengguna dapat <strong>melaporkan</strong> pesan, postingan, komentar, grup, atau pengguna lewat menu di
        aplikasi, dan <strong>memblokir</strong> pengguna lain. Kami meninjau laporan dan dapat menghapus konten,
        membatasi, atau menangguhkan akun yang melanggar, atau mengeluarkannya dari papan skor publik, tanpa pemberitahuan awal, terutama untuk pelanggaran berat.
        Pesan langsung E2EE tidak dapat kami baca; tinjauan hanya berdasarkan bukti yang dikirim pelapor.
      </p>

      <h2>4. Kunci enkripsi</h2>
      <p>
        Kunci E2EE disimpan di perangkat Anda. Anda bertanggung jawab memindahkannya (fitur transfer QR) sebelum
        mengganti atau menghapus aplikasi. Mereset kunci membuat pesan langsung lama tidak dapat dibuka kembali.
      </p>

      <h2>5. Konten Anda</h2>
      <p>
        Anda tetap memiliki konten Anda. Anda memberi kami izin terbatas untuk menyimpan, memproses, dan menampilkannya
        kepada penerima yang Anda pilih, serta kepada layanan AI Memory pada topik forum di grup yang mengikuti uji terbatas fitur tersebut, sebagaimana dijelaskan di
        <a href="/privacy"> Kebijakan Privasi</a>.
      </p>

      {/* Keputusan K9-K11 (15 Nov 2026). Status izin BI/OJK dan pajak (STARS_STAGE0 C1-C3) masih terbuka; jangan klaim status hukum Star di sini. */}
      <h2>5a. Star dan grup privat berbayar</h2>
      <p>Bagian ini berlaku bila fitur Star tersedia untuk akun Anda.</p>
      <ul>
        <li><strong>Apa itu Star:</strong> Star adalah satuan digital di dalam WuzzChat untuk membayar akses ke grup privat berbayar. Star <strong>hanya bisa dibelanjakan di WuzzChat</strong>: tidak bisa ditransfer ke pengguna lain, ditukar dengan uang, atau ditarik, dan tidak memiliki nilai di luar aplikasi.</li>
        <li><strong>Pembelian:</strong> Star dibeli di aplikasi Android lewat Google Play. Harga ditampilkan Google Play sebelum Anda membayar, dan pembayaran tunduk pada ketentuan Google Play. Star masuk ke saldo setelah pembelian diverifikasi dan pembayarannya selesai; pembayaran yang masih tertunda di Google Play belum menambah saldo.</li>
        <li><strong>Pengembalian dana Google Play:</strong> pengembalian dana atas pembelian Star diajukan lewat Google Play dan mengikuti kebijakan Google. Bila Google membatalkan atau mengembalikan dana sebuah pembelian, Star dari pembelian itu kami tarik kembali. Bila Star tersebut sudah dibelanjakan, kekurangannya dicatat sebagai <strong>utang Star</strong>; selama ada utang, Anda tidak dapat membayar akses grup, dan pembelian Star berikutnya dipakai untuk melunasinya lebih dulu.</li>
        <li><strong>Grup berbayar:</strong> hanya mitra kreator yang kami setujui yang dapat menjadikan grup privatnya berbayar dan menentukan harganya. Pembayaran berlaku <strong>sekali</strong> dan memberi akses selama Anda tetap menjadi anggota. Bila Anda keluar atau dikeluarkan dari grup, masuk kembali berarti membayar lagi. Isi grup berbayar adalah tanggung jawab kreator dan anggotanya, dan tetap tunduk pada aturan konten di bagian 2.</li>
        <li><strong>Pengembalian Star untuk akses grup:</strong> kami mengembalikan Star ke saldo Anda bila, <strong>dalam 7 hari setelah Anda membayar</strong>, (a) grup dihapus, (b) Anda dikeluarkan oleh admin grup bukan karena melanggar aturan, atau (c) akses grup tidak berfungsi. Ajukan lewat email di bawah dengan menyebut nama grup dan waktu pembayaran; kami meninjau setiap pengajuan. Di luar keadaan itu, pembayaran akses grup tidak dikembalikan.</li>
        <li><strong>Mitra kreator:</strong> Star yang dibayarkan untuk grup berbayar tidak menjadi saldo kreator. Bagi hasil untuk mitra kreator diatur dalam perjanjian tertulis terpisah dan dibayar di luar aplikasi; tidak ada fitur penarikan atau pencairan di aplikasi. Kami dapat mencabut status mitra kreator, dan grup berbayarnya berhenti menerima pembayaran.</li>
        <li><strong>Penyalahgunaan:</strong> kami dapat membatalkan Star yang diperoleh lewat kesalahan sistem, penipuan, atau pembelian yang tidak sah, dan menangguhkan akun yang terlibat.</li>
        <li><strong>Akun dihapus atau ditutup:</strong> saldo Star yang tersisa hangus dan tidak dapat dikembalikan atau diuangkan. Catatan transaksi Star disimpan seperti dijelaskan di <a href="/privacy">Kebijakan Privasi</a>.</li>
        <li><strong>Perubahan fitur:</strong> kami dapat mengubah harga paket Star, harga minimum dan maksimum grup, atau menghentikan fitur Star dengan pemberitahuan di aplikasi. Bila fitur Star dihentikan, kami akan memberi tahu cara penanganan saldo yang tersisa.</li>
      </ul>

      <h2>6. Layanan apa adanya</h2>
      <p>
        Layanan disediakan &ldquo;sebagaimana adanya&rdquo; selama masa beta. Kami berupaya menjaganya tetap berjalan, tetapi tidak
        menjamin tanpa gangguan, dan sejauh diizinkan hukum tidak bertanggung jawab atas kerugian tidak langsung atau
        kehilangan data akibat gangguan, reset kunci, atau penghapusan akun.
      </p>

      <h2>7. Penghentian</h2>
      <p>Anda dapat berhenti kapan saja dengan <a href="/delete-account">menghapus akun</a>. Kami dapat menangguhkan atau menghapus akun yang melanggar syarat ini.</p>

      <h2>8. Perubahan</h2>
      <p>Syarat dapat diperbarui; penggunaan berkelanjutan setelah perubahan berarti Anda menerimanya.</p>

      <h2>9. Kontak</h2>
      <p>Pertanyaan atau banding moderasi: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</p>
    </LegalPage>
  )
}
