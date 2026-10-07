// Package errors menyediakan tipe error standar yang digunakan lintas domain
// sebagai unified error contract antar Application Service.
package errors

import "errors"

var (
	// ErrUnauthorized digunakan ketika user tidak terautentikasi atau token tidak valid.
	ErrUnauthorized = errors.New("akses tidak diizinkan: autentikasi diperlukan")

	// ErrForbidden digunakan ketika user terautentikasi namun tidak memiliki izin.
	ErrForbidden = errors.New("akses ditolak: tidak memiliki izin untuk operasi ini")

	// ErrNotFound digunakan ketika resource yang diminta tidak ditemukan.
	ErrNotFound = errors.New("resource tidak ditemukan")

	// ErrConflict digunakan ketika terjadi konflik state (misal: device konflik, duplikasi data).
	ErrConflict = errors.New("konflik: resource sudah ada atau terjadi kondisi race")

	// ErrInvalidInput digunakan ketika input user tidak valid.
	ErrInvalidInput = errors.New("input tidak valid")

	// ErrInternal digunakan untuk error internal server yang tidak terduga.
	ErrInternal = errors.New("terjadi kesalahan internal server")

	// ErrOAuthSubjectTaken: identitas pihak ketiga (mis. akun Google) sudah tertaut ke akun Wuzz lain.
	ErrOAuthSubjectTaken = errors.New("akun Google ini sudah terhubung ke akun Wuzz lain")

	// ErrOAuthAlreadyLinked: akun Wuzz ini sudah punya akun pihak ketiga tertaut.
	ErrOAuthAlreadyLinked = errors.New("akun ini sudah terhubung ke akun Google")

	// ErrOAuthNotLinked: akun Wuzz ini belum punya akun pihak ketiga tertaut.
	ErrOAuthNotLinked = errors.New("akun ini belum terhubung ke akun Google")

	// ErrOAuthReplaceLimit: batas penggantian akun pihak ketiga per jendela waktu sudah tercapai.
	ErrOAuthReplaceLimit = errors.New("batas penggantian akun Google tercapai (maksimal 3 kali per 7 hari), coba lagi nanti")
)
