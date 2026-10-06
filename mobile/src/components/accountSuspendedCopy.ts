/** Teks layar "akun ditangguhkan". Dipisah dari tampilan agar mudah diganti tanpa menyentuh tata letak. */
export const accountSuspendedCopy = {
  title: 'Akun Anda ditangguhkan',
  body: (username?: string) =>
    `Akun${username ? ` @${username}` : ''} ditangguhkan karena melanggar ketentuan layanan Wuzz Chat, sehingga untuk sementara tidak bisa dipakai.`,
  safeData: 'Pesan, teman, dan data Anda tidak dihapus. Jika Anda merasa ini keliru, ajukan banding ke tim support.',
  appeal: 'Ajukan Banding',
  contactLine: (email: string) => `Banding dikirim lewat email ke ${email}. Sertakan username Anda.`,
  checkStatus: 'Periksa Status Akun',
  stillSuspended: 'Akun Anda masih ditangguhkan.',
  checkFailed: 'Tidak dapat memeriksa status akun. Periksa koneksi internet Anda lalu coba lagi.',
  logout: 'Keluar',
  deleteAccount: 'Hapus akun saya',
  /** Subjek email banding. */
  appealSubject: (username?: string) => `Banding penangguhan akun${username ? ` @${username}` : ''}`,
} as const;
