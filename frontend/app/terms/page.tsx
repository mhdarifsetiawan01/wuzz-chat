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
        <li>melanggar hukum, atau mengganggu keamanan dan kinerja layanan (peretasan, otomatisasi massal, dsb.).</li>
      </ul>

      <h2>3. Pelaporan dan pemblokiran</h2>
      <p>
        Setiap pengguna dapat <strong>melaporkan</strong> pesan, postingan, komentar, grup, atau pengguna lewat menu di
        aplikasi, dan <strong>memblokir</strong> pengguna lain. Kami meninjau laporan dan dapat menghapus konten,
        membatasi, atau menangguhkan akun yang melanggar tanpa pemberitahuan awal, terutama untuk pelanggaran berat.
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
        kepada penerima yang Anda pilih, serta kepada layanan AI Memory pada ruang diskusi terbuka sebagaimana dijelaskan di
        <a href="/privacy"> Kebijakan Privasi</a>.
      </p>

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
