// Package auth menyediakan middleware untuk autentikasi koneksi WebSocket.
// Fase 1: semua middleware adalah no-op (langsung pass-through).
// Fase 2: inject JWT validation di sini tanpa mengubah kode handler/hub.
package auth

import "net/http"

// Middleware adalah fungsi yang membungkus http.Handler.
// Pola ini (handler wrapping) adalah idiom standar Go untuk middleware chain.
type Middleware func(http.Handler) http.Handler

// NoOp mengembalikan middleware yang tidak melakukan validasi apapun.
// Semua request langsung diteruskan ke handler berikutnya.
//
// Cara pakai:
//
//	handler = auth.NoOp()(myHandler)
func NoOp() Middleware {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Fase 2: di sini akan ada JWT parsing, validasi token,
			// dan inject user claims ke r.Context()
			next.ServeHTTP(w, r)
		})
	}
}

// Chain menggabungkan beberapa middleware menjadi satu.
// Urutan eksekusi: middlewares[0] → middlewares[1] → ... → handler
//
// Pola ini memudahkan penambahan middleware baru di fase 2 (logging, rate-limit, dst)
// cukup dengan append ke slice, bukan ubah structure handler.
func Chain(handler http.Handler, middlewares ...Middleware) http.Handler {
	// Iterasi terbalik supaya urutan eksekusi sesuai urutan argumen
	for i := len(middlewares) - 1; i >= 0; i-- {
		handler = middlewares[i](handler)
	}
	return handler
}
