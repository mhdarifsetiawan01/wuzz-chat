import type { Metadata } from 'next'
import LegalPage from '../_legal/LegalPage'
import { SUPPORT_EMAIL } from '@/lib/legal'

export const metadata: Metadata = {
  title: 'Kebijakan Privasi — Wuzz Chat',
  description: 'Data apa yang dikumpulkan Wuzz Chat, bagaimana digunakan, dan cara menghapusnya.',
}

export default function PrivacyPage() {
  return (
    <LegalPage title="Kebijakan Privasi">
      <p>
        Kebijakan ini menjelaskan data yang diproses aplikasi dan layanan Wuzz Chat (&ldquo;kami&rdquo;), untuk apa data
        itu dipakai, dan pilihan yang Anda miliki. Dengan membuat akun, Anda menyetujui kebijakan ini.
      </p>

      <h2>1. Data yang kami kumpulkan</h2>
      <ul>
        <li><strong>Akun:</strong> username, nama tampilan, kata sandi (disimpan sebagai hash bcrypt, tidak pernah sebagai teks asli), foto profil, bio, dan pesan status yang Anda isi.</li>
        <li><strong>Pesan langsung (1-on-1):</strong> dienkripsi ujung-ke-ujung (E2EE). Server hanya menyimpan teks sandi; kunci privat berada di perangkat Anda dan tidak dapat kami baca.</li>
        <li><strong>Pesan grup, topik forum, dan Linimasa komunitas:</strong> disimpan di server dalam bentuk yang dapat dibaca agar dapat dikirim ke anggota, dicari, dan dimoderasi. Jangan membagikan rahasia di ruang ini.</li>
        <li><strong>Berkas media dalam pesan</strong> (foto, pesan suara, dokumen): disimpan sementara di penyimpanan server dan otomatis dihapus paling lama 1 hari setelah dikirim. <strong>Foto profil dan media postingan Linimasa</strong> disimpan selama akun Anda aktif.</li>
        <li><strong>Perangkat dan sesi:</strong> ID perangkat, nama dan platform perangkat, user agent, alamat IP, waktu aktif terakhir, serta token notifikasi push (Firebase Cloud Messaging).</li>
        <li><strong>Relasi sosial:</strong> daftar teman, permintaan pertemanan, dan pemblokiran.</li>
        <li><strong>Laporan kerusakan:</strong> bila aplikasi mengalami crash, data teknis dikirim otomatis ke Google Firebase Crashlytics: jenis dan model perangkat, versi Android dan aplikasi, jejak kesalahan, dan ID akun acak. Tidak ada isi pesan, nama pengguna, atau kata sandi yang disertakan.</li>
        <li><strong>Masuk dengan Google:</strong> bila Anda masuk atau menautkan akun Google, kami menyimpan pengenal akun Google Anda (ID unik) dan alamat email Google, semata-mata untuk mengenali akun Anda saat masuk dan menampilkan akun Google mana yang tertaut. Kami tidak membaca kontak, Drive, atau data Google lainnya, dan tidak menyimpan nama atau foto Google Anda.</li>
        <li><strong>Laporan dan moderasi:</strong> jika Anda melaporkan konten atau pengguna, kami menyimpan laporan itu beserta keterangan dan bukti yang Anda tulis. Tim moderasi mencatat tindakan yang diambil (misalnya konten dihapus atau akun ditangguhkan) beserta waktu dan alasannya.</li>
      </ul>
      <p>Saat ini kami tidak menampilkan iklan dan tidak menjual data. Kami tidak memakai SDK analitik perilaku atau pelacak iklan. Kami memakai Google Firebase Crashlytics untuk laporan kerusakan teknis dan Google ML Kit untuk memindai kode QR (lihat bagian 4). Bila nanti kami menambahkan iklan atau layanan analitik, kebijakan ini akan diperbarui sebelum fitur itu dirilis.</p>

      <h2>2. Izin perangkat</h2>
      <ul>
        <li><strong>Kamera:</strong> hanya untuk memindai kode QR (pemindahan kunci E2EE dan tautan undangan). Pemindaian memakai Google ML Kit yang berjalan di perangkat.</li>
        <li><strong>Mikrofon:</strong> hanya untuk pesan suara dan panggilan suara.</li>
        <li><strong>Notifikasi:</strong> untuk memberi tahu pesan dan panggilan masuk.</li>
        <li><strong>Foto/berkas:</strong> hanya berkas yang Anda pilih sendiri untuk dikirim atau dijadikan foto profil.</li>
      </ul>

      <h2>3. Cara kami menggunakan data</h2>
      <ul>
        <li>Menjalankan layanan: autentikasi, mengirim pesan, panggilan, dan notifikasi.</li>
        <li>Stabilitas: memperbaiki crash dan kesalahan aplikasi berdasarkan laporan kerusakan teknis.</li>
        <li>Keamanan: membatasi jumlah perangkat, mencabut sesi, mencegah penyalahgunaan, dan menindaklanjuti laporan. Akun yang melanggar ketentuan dapat ditangguhkan; kami menyimpan tanggal dan alasan penangguhan, dan akun dapat dipulihkan bila penangguhan dibatalkan.</li>
        <li>Fitur AI Memory <strong>(saat ini dinonaktifkan, tidak ada teks pesan yang dikirim)</strong>: bila nanti diaktifkan, pada <strong>ruang diskusi terbuka dan topik forum</strong> teks pesan dapat dikirim ke layanan model bahasa (LLM) pihak ketiga (saat ini Groq) untuk menyusun ringkasan. Kami akan memperbarui kebijakan ini sebelum fitur diaktifkan. Hasilnya hanya terbit setelah disetujui admin. Pesan langsung E2EE tidak pernah dibaca AI.</li>
      </ul>

      <h2>4. Pihak ketiga yang memproses data</h2>
      <ul>
        <li>Google (Masuk dengan Google): memverifikasi identitas Anda saat Anda memilih masuk dengan akun Google.</li>
        <li>Google Firebase Cloud Messaging: mengantar notifikasi push (menerima token perangkat dan isi notifikasi).</li>
        <li>Google Firebase Crashlytics: menerima laporan kerusakan teknis seperti dijelaskan di atas, semata-mata untuk memperbaiki aplikasi.</li>
        <li>Google ML Kit (pemindai kode QR): SDK Google yang berjalan di perangkat Anda dan dapat mengirim data teknis penggunaan SDK ke Google.</li>
        <li>Penyedia model bahasa (LLM) untuk fitur AI Memory (saat ini Groq): hanya menerima teks pesan dari forum terbuka bila fitur diaktifkan, seperti dijelaskan di atas. Saat ini fitur tersebut dinonaktifkan.</li>
        <li>Telegram: dipakai untuk pemberitahuan internal kepada tim moderasi bahwa ada laporan baru. Pesan hanya memuat jenis dan alasan laporan serta tautan ke halaman moderator; tidak memuat isi pesan, bukti, nama pengguna, atau data pribadi Anda.</li>
        <li>Penyedia basis data dan penyimpanan berkas media kami (saat ini Supabase).</li>
        <li>Penyedia layanan Redis yang meneruskan pesan sementara antar-server dan tidak dipakai sebagai penyimpanan permanen (saat ini Upstash).</li>
        <li>Penyedia server (VPS) tempat aplikasi backend kami berjalan.</li>
      </ul>
      <p>Penyedia di atas hanya memproses data atas perintah kami. Kami dapat berganti penyedia, termasuk penyedia model bahasa dan pemindahan data ke server kami sendiri; daftar ini mencerminkan penyedia saat ini dan akan diperbarui, bersama tanggal berlaku, bila berubah. Kami dapat mengungkapkan data bila diwajibkan hukum yang berlaku.</p>

      <h2>5. Penyimpanan dan penghapusan</h2>
      <ul>
        <li>Data disimpan selama akun Anda aktif.</li>
        <li>Anda dapat menghapus akun kapan saja di aplikasi: <strong>Pengaturan → Hapus Akun</strong>, atau lewat halaman <a href="/delete-account">Hapus Akun</a>.</li>
        <li>Saat akun dihapus, kami menghapus: profil, kata sandi, sesi dan perangkat, token push, kunci publik, relasi pertemanan, keanggotaan grup, pesan yang Anda kirim, serta postingan, komentar, dan suka Anda di Linimasa. Nama pengguna Anda dilepas dan dapat dipakai orang lain.</li>
        <li>Pesan sandi yang sudah tersimpan di perangkat orang lain tidak dapat kami hapus. Berkas media Anda yang sedang menunggu penghapusan otomatis biasanya terhapus dalam waktu kurang dari satu hari. Salinan cadangan teknis untuk pemulihan bencana, baik yang kami kelola maupun yang dikelola penyedia infrastruktur, mengikuti siklus rotasinya dan tidak kami pakai untuk tujuan lain.</li>
        <li><strong>Laporan moderasi:</strong> teks bukti dan keterangan pelapor dihapus otomatis <strong>90 hari setelah laporan ditutup</strong>, kecuali ditahan karena dapat diteruskan ke pihak berwenang. Catatan tindakan moderator dan data dasar laporan (jenis, alasan, status, waktu) dapat disimpan seperlunya untuk keamanan dan penegakan aturan, termasuk setelah akun yang dilaporkan dihapus.</li>
      </ul>

      <h2>6. Keamanan</h2>
      <p>
        Koneksi memakai HTTPS/WSS, kata sandi di-hash, dan pesan langsung dienkripsi E2EE. Karena kunci enkripsi
        hanya ada di perangkat Anda, <strong>jika kunci hilang dan tidak ada perangkat lain, pesan langsung lama tidak dapat dipulihkan</strong>
        (termasuk oleh kami). Tidak ada sistem yang sepenuhnya aman; laporkan celah keamanan ke alamat kontak di bawah.
      </p>

      <h2>7. Hak Anda</h2>
      <p>
        Anda dapat melihat dan mengubah profil di aplikasi, memblokir pengguna, menghapus akun, dan meminta salinan atau
        penghapusan data lewat email di bawah. Kami menanggapi dalam waktu wajar.
      </p>

      <h2>8. Anak-anak</h2>
      <p>Wuzz Chat ditujukan untuk pengguna berusia 13 tahun ke atas. Kami tidak dengan sengaja mengumpulkan data anak di bawah usia tersebut; hubungi kami agar akunnya dihapus.</p>

      <h2>9. Perubahan kebijakan</h2>
      <p>Perubahan material akan diumumkan di aplikasi atau halaman ini, dengan tanggal berlaku yang diperbarui.</p>

      <h2>10. Kontak</h2>
      <p>Pertanyaan privasi atau permintaan data: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</p>
    </LegalPage>
  )
}
