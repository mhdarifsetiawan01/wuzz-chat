import type { Metadata } from 'next'
import LegalPage from '../_legal/LegalPage'
import { SUPPORT_EMAIL } from '@/lib/legal'

export const metadata: Metadata = {
  title: 'Standar Keselamatan Anak — Wuzz Chat',
  description: 'Larangan eksploitasi dan pelecehan seksual terhadap anak (CSAE), cara melapor, dan kontak keselamatan anak Wuzz Chat.',
}

export default function ChildSafetyPage() {
  return (
    <LegalPage title="Standar Keselamatan Anak">
      <p>
        Wuzz Chat tidak menoleransi eksploitasi dan pelecehan seksual terhadap anak (<em>child sexual abuse and exploitation</em>, CSAE),
        termasuk materi pelecehan seksual anak (CSAM). Halaman ini menjelaskan standar kami, cara melaporkan pelanggaran, dan tindakan yang kami ambil.
      </p>

      <h2>1. Yang dilarang</h2>
      <ul>
        <li>Membuat, membagikan, meminta, atau menyimpan materi pelecehan atau eksploitasi seksual anak dalam bentuk apa pun (gambar, video, suara, teks, tautan).</li>
        <li>Merayu atau memanipulasi anak untuk tujuan seksual (<em>grooming</em>), memeras secara seksual (<em>sextortion</em>), atau memperdagangkan anak.</li>
        <li>Menyajikan anak secara seksual, termasuk dalam bentuk ilustrasi atau konten buatan.</li>
        <li>Mengarahkan pengguna ke konten atau layanan yang melakukan hal-hal di atas.</li>
      </ul>
      <p>Pelanggaran berat ini berujung pada penghapusan konten dan penutupan akun secara permanen tanpa peringatan terlebih dahulu.</p>

      <h2>2. Batas usia</h2>
      <p>
        Wuzz Chat ditujukan untuk pengguna berusia <strong>13 tahun ke atas</strong> (lihat <a href="/terms">Syarat Layanan</a>).
        Akun yang diketahui dimiliki anak di bawah usia tersebut akan kami hapus.
      </p>

      <h2>3. Cara melaporkan</h2>
      <ul>
        <li>
          <strong>Di dalam aplikasi:</strong> ketuk <em>Laporkan</em> pada pesan, postingan, komentar, atau profil pengguna, lalu pilih alasan
          (mis. <em>Konten seksual</em> atau <em>Pelecehan atau perundungan</em>). Anda juga dapat <em>Blokir</em> pengguna dari profilnya.
        </li>
        <li>
          <strong>Lewat email:</strong> <a href={`mailto:${SUPPORT_EMAIL}?subject=Laporan%20Keselamatan%20Anak`}>{SUPPORT_EMAIL}</a> dengan subjek
          &ldquo;Laporan Keselamatan Anak&rdquo;. Sertakan username pengguna yang dilaporkan dan, bila ada, tangkapan layar atau tautan.
        </li>
      </ul>
      <p>
        Pesan langsung dienkripsi ujung-ke-ujung sehingga kami tidak dapat membacanya. Untuk pesan langsung, tinjauan kami bergantung pada
        bukti yang Anda kirim saat melapor. Jangan menyebarkan kembali materi yang melanggar; cukup laporkan.
      </p>

      <h2>4. Yang kami lakukan atas laporan</h2>
      <ul>
        <li>Laporan keselamatan anak ditinjau dengan prioritas tertinggi.</li>
        <li>Konten yang melanggar dihapus dan akun terkait ditutup permanen.</li>
        <li>Bukti yang relevan disimpan seperlunya dan, bila terkait CSAM atau bahaya terhadap anak, dilaporkan kepada pihak berwenang yang berwenang sesuai hukum yang berlaku di Indonesia
        (mis. kepolisian) dan lembaga pelaporan terkait.</li>
        <li>Kami bekerja sama dengan penegak hukum sesuai prosedur yang sah.</li>
      </ul>

      <h2>5. Kontak keselamatan anak</h2>
      <p>
        Untuk pertanyaan, permintaan penegak hukum, atau laporan mendesak terkait keselamatan anak:{' '}
        <a href={`mailto:${SUPPORT_EMAIL}?subject=Keselamatan%20Anak`}>{SUPPORT_EMAIL}</a>.
      </p>
      <p>Jika seorang anak berada dalam bahaya langsung, hubungi layanan darurat setempat. Di Indonesia, layanan pengaduan anak SAPA 129 (telepon 129 / WhatsApp 08111-129-129) dapat dihubungi.</p>
    </LegalPage>
  )
}
