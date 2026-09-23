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
)
