/**
 * Seluruh teks layar onboarding Google di satu tempat: ganti kata-kata tanpa menyentuh tata letak.
 * (Bila nanti aplikasi dilokalkan, berkas ini yang diganti dengan sistem terjemahan.)
 */

export const onboardingCopy = {
  signedInAs: 'Masuk dengan Google sebagai',
  back: 'Kembali',
  cancel: 'Batal',

  choose: {
    title: 'Satu langkah lagi',
    subtitle: 'Akun Google ini belum terhubung ke WuzzChat. Pilih cara melanjutkan.',
    newOption: {
      title: 'Buat akun baru',
      description: 'Pertama kali memakai WuzzChat. Cukup pilih username, tanpa password.',
    },
    linkOption: {
      title: 'Saya sudah punya akun',
      description: 'Hubungkan Google ke akun WuzzChat Anda dengan username dan password.',
    },
  },

  newAccount: {
    title: 'Buat akun baru',
    subtitle: 'Pilih username yang akan dilihat teman Anda. Anda masuk lewat Google, jadi tidak perlu membuat password.',
    usernameLabel: 'Username',
    usernamePlaceholder: 'pilih_username',
    displayNameLabel: 'Nama Tampilan (Opsional)',
    displayNamePlaceholder: 'Contoh: Alice Smith',
    submit: 'Buat Akun',
  },

  link: {
    title: 'Hubungkan ke akun lama',
    subtitle: 'Masukkan username dan password akun WuzzChat Anda. Setelah itu Anda bisa masuk dengan Google.',
    usernameLabel: 'Username',
    usernamePlaceholder: 'Masukkan username',
    passwordLabel: 'Password',
    passwordPlaceholder: 'Masukkan password',
    submit: 'Hubungkan & Masuk',
    forgotTitle: 'Lupa password?',
    forgotBody: 'Anda bisa membuat akun baru, atau hubungi support untuk meminta penghapusan akun lama.',
    contactSupport: 'Hubungi support',
  },
} as const;
