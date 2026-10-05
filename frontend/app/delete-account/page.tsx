import type { Metadata } from 'next'
import LegalPage from '../_legal/LegalPage'
import { SUPPORT_EMAIL } from '@/lib/legal'

export const metadata: Metadata = {
  title: 'Hapus Akun — Wuzz Chat',
  description: 'Cara menghapus akun Wuzz Chat beserta data pribadi Anda.',
}

export default function DeleteAccountPage() {
  return (
    <LegalPage title="Hapus Akun Wuzz Chat">
      <p>Anda dapat menghapus akun dan data pribadi Anda kapan saja. Penghapusan bersifat <strong>permanen dan tidak dapat dibatalkan</strong>.</p>

      <h2>Cara 1: lewat aplikasi (tercepat)</h2>
      <ol>
        <li>Buka aplikasi Wuzz Chat dan login.</li>
        <li>Masuk ke <strong>Pengaturan → Hapus Akun</strong>.</li>
        <li>Baca peringatan, masukkan kata sandi Anda, lalu konfirmasi.</li>
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
        <li>Daftar teman, permintaan pertemanan, dan keanggotaan grup. Jika Anda pembuat grup, kepemilikan dialihkan ke anggota lain (atau grup dihapus jika Anda satu-satunya anggota).</li>
      </ul>

      <h2>Data yang dapat bertahan sementara</h2>
      <ul>
        <li>Pesan sandi (E2EE) yang sudah tersimpan di perangkat lawan bicara, karena berada di luar kendali kami.</li>
        <li>Berkas media yang menunggu masa hapus otomatis (maksimal 24 jam untuk pesan langsung, 7 hari untuk grup).</li>
        <li>Salinan cadangan sistem, sampai siklus rotasi berikutnya, dan catatan laporan moderasi seperlunya untuk keamanan.</li>
      </ul>
      <p>Lihat juga <a href="/privacy">Kebijakan Privasi</a>.</p>
    </LegalPage>
  )
}
