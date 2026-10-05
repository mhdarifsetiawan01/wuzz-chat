// Konfigurasi halaman legal publik (kebijakan privasi, syarat layanan, hapus akun).
// Ubah NEXT_PUBLIC_SUPPORT_EMAIL ke alamat yang benar-benar dipantau sebelum rilis Play Store, lalu rebuild frontend.
export const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'support@wuzzhub.id'

// Tanggal berlaku dokumen; perbarui setiap kali isi kebijakan berubah.
export const LEGAL_EFFECTIVE_DATE = '5 Oktober 2026'
