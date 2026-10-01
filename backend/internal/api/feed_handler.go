package api

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/bms-del112/wuzz-chat/internal/auth"
	"github.com/bms-del112/wuzz-chat/internal/feed"
	feedinfra "github.com/bms-del112/wuzz-chat/internal/feed/infra"
)

// FeedHandler menangani request HTTP untuk linimasa sosial komunitas.
type FeedHandler struct {
	feedService *feed.FeedService
}

// NewFeedHandler membuat instance baru FeedHandler menggunakan SQL database dan driver.
func NewFeedHandler(db *sql.DB, driverName string) *FeedHandler {
	repo := feedinfra.NewSQLFeedRepository(db, driverName)
	service := feed.NewFeedService(repo)
	return &FeedHandler{
		feedService: service,
	}
}

// NewFeedHandlerWithService membuat instance FeedHandler dengan FeedService yang telah diinjeksi.
func NewFeedHandlerWithService(service *feed.FeedService) *FeedHandler {
	return &FeedHandler{
		feedService: service,
	}
}

func writeFeedJSON(w http.ResponseWriter, code int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(data)
}

func writeFeedError(w http.ResponseWriter, code int, message string) {
	writeFeedJSON(w, code, map[string]string{"error": message})
}

// HandleFeedRoot menangani endpoint /api/feed (GET: timeline linimasa, POST: buat postingan baru).
func (h *FeedHandler) HandleFeedRoot(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.GetUserFromContext(r.Context())
	if !ok {
		writeFeedError(w, http.StatusUnauthorized, "Sesi tidak valid atau telah berakhir")
		return
	}

	switch r.Method {
	case http.MethodGet:
		h.listTimeline(w, r, claims)
	case http.MethodPost:
		h.createPost(w, r, claims)
	default:
		writeFeedError(w, http.StatusMethodNotAllowed, "Method tidak diizinkan")
	}
}

// RouteFeedRequest mengarahkan sub-path /api/feed/{id}... ke handler aksi yang sesuai.
func (h *FeedHandler) RouteFeedRequest(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.GetUserFromContext(r.Context())
	if !ok {
		writeFeedError(w, http.StatusUnauthorized, "Sesi tidak valid atau telah berakhir")
		return
	}

	rawPath := strings.TrimPrefix(r.URL.Path, "/api/feed/")
	rawPath = strings.Trim(rawPath, "/")
	if rawPath == "" {
		h.HandleFeedRoot(w, r)
		return
	}

	parts := strings.Split(rawPath, "/")
	postID := parts[0]

	// 1. /api/feed/{id}
	if len(parts) == 1 {
		switch r.Method {
		case http.MethodGet:
			h.getPost(w, r, claims, postID)
		case http.MethodDelete:
			h.deletePost(w, r, claims, postID)
		default:
			writeFeedError(w, http.StatusMethodNotAllowed, "Method tidak diizinkan")
		}
		return
	}

	// 2. /api/feed/{id}/{action}
	action := parts[1]
	switch action {
	case "like":
		if r.Method == http.MethodPost {
			h.toggleLike(w, r, claims, postID)
		} else {
			writeFeedError(w, http.StatusMethodNotAllowed, "Method tidak diizinkan")
		}
	case "comments":
		switch r.Method {
		case http.MethodGet:
			h.listComments(w, r, claims, postID)
		case http.MethodPost:
			h.createComment(w, r, claims, postID)
		default:
			writeFeedError(w, http.StatusMethodNotAllowed, "Method tidak diizinkan")
		}
	default:
		writeFeedError(w, http.StatusNotFound, "Endpoint tidak ditemukan")
	}
}

// listTimeline mengambil linimasa postingan ber-cursor.
func (h *FeedHandler) listTimeline(w http.ResponseWriter, r *http.Request, claims *auth.UserClaims) {
	tab := r.URL.Query().Get("tab")
	seed := r.URL.Query().Get("seed")
	before := r.URL.Query().Get("before")
	limitStr := r.URL.Query().Get("limit")
	offsetStr := r.URL.Query().Get("offset")

	limit := 20
	if limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
			limit = l
		}
	}

	offset := 0
	if offsetStr != "" {
		if off, err := strconv.Atoi(offsetStr); err == nil && off >= 0 {
			offset = off
		}
	}

	resp, err := h.feedService.ListTimeline(r.Context(), claims.TenantID, claims.UserID, tab, seed, before, offset, limit)
	if err != nil {
		writeFeedError(w, http.StatusInternalServerError, "Gagal mengambil linimasa: "+err.Error())
		return
	}

	writeFeedJSON(w, http.StatusOK, resp)
}

// createPost membuat postingan baru.
func (h *FeedHandler) createPost(w http.ResponseWriter, r *http.Request, claims *auth.UserClaims) {
	var input feed.CreatePostInput
	r.Body = http.MaxBytesReader(w, r.Body, 64*1024)
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeFeedError(w, http.StatusBadRequest, "Payload request tidak valid")
		return
	}

	systemRole := claims.SystemRole
	if systemRole == "" {
		systemRole = "user"
	}

	post, err := h.feedService.CreatePost(r.Context(), claims.TenantID, claims.UserID, systemRole, input)
	if err != nil {
		switch {
		case errors.Is(err, feed.ErrContentEmpty), errors.Is(err, feed.ErrContentTooLong), errors.Is(err, feed.ErrTooManyMedia), errors.Is(err, feed.ErrInvalidMediaURL):
			writeFeedError(w, http.StatusBadRequest, err.Error())
		default:
			writeFeedError(w, http.StatusInternalServerError, "Gagal membuat postingan: "+err.Error())
		}
		return
	}

	writeFeedJSON(w, http.StatusCreated, post)
}

// getPost mengambil postingan tunggal beserta author.
func (h *FeedHandler) getPost(w http.ResponseWriter, r *http.Request, claims *auth.UserClaims, postID string) {
	post, err := h.feedService.GetPostByID(r.Context(), claims.TenantID, postID, claims.UserID)
	if err != nil {
		if errors.Is(err, feed.ErrPostNotFound) {
			writeFeedError(w, http.StatusNotFound, "Postingan tidak ditemukan")
			return
		}
		writeFeedError(w, http.StatusInternalServerError, "Gagal mengambil postingan: "+err.Error())
		return
	}
	writeFeedJSON(w, http.StatusOK, post)
}

// deletePost menghapus postingan (otorisasi author atau moderator).
func (h *FeedHandler) deletePost(w http.ResponseWriter, r *http.Request, claims *auth.UserClaims, postID string) {
	systemRole := claims.SystemRole
	if systemRole == "" {
		systemRole = "user"
	}

	err := h.feedService.DeletePost(r.Context(), claims.TenantID, postID, claims.UserID, systemRole)
	if err != nil {
		switch {
		case errors.Is(err, feed.ErrPostNotFound):
			writeFeedError(w, http.StatusNotFound, "Postingan tidak ditemukan")
		case errors.Is(err, feed.ErrUnauthorizedAction):
			writeFeedError(w, http.StatusForbidden, "Anda tidak memiliki hak akses untuk menghapus postingan ini")
		default:
			writeFeedError(w, http.StatusInternalServerError, "Gagal menghapus postingan: "+err.Error())
		}
		return
	}

	writeFeedJSON(w, http.StatusOK, map[string]string{
		"status":  "ok",
		"message": "Postingan berhasil dihapus",
	})
}

// toggleLike melakukan switch suka / batal suka secara atomic.
func (h *FeedHandler) toggleLike(w http.ResponseWriter, r *http.Request, claims *auth.UserClaims, postID string) {
	res, err := h.feedService.ToggleLike(r.Context(), claims.TenantID, postID, claims.UserID)
	if err != nil {
		if errors.Is(err, feed.ErrPostNotFound) {
			writeFeedError(w, http.StatusNotFound, "Postingan tidak ditemukan")
			return
		}
		writeFeedError(w, http.StatusInternalServerError, "Gagal mengubah status like: "+err.Error())
		return
	}

	writeFeedJSON(w, http.StatusOK, res)
}

// createComment menambahkan komentar baru pada postingan.
func (h *FeedHandler) createComment(w http.ResponseWriter, r *http.Request, claims *auth.UserClaims, postID string) {
	var input feed.CreateCommentInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeFeedError(w, http.StatusBadRequest, "Payload request tidak valid")
		return
	}

	comment, err := h.feedService.CreateComment(r.Context(), claims.TenantID, postID, claims.UserID, input)
	if err != nil {
		switch {
		case errors.Is(err, feed.ErrPostNotFound):
			writeFeedError(w, http.StatusNotFound, "Postingan tidak ditemukan")
		case errors.Is(err, feed.ErrCommentEmpty), errors.Is(err, feed.ErrCommentTooLong):
			writeFeedError(w, http.StatusBadRequest, err.Error())
		default:
			writeFeedError(w, http.StatusInternalServerError, "Gagal menambahkan komentar: "+err.Error())
		}
		return
	}

	writeFeedJSON(w, http.StatusCreated, comment)
}

// listComments mengambil daftar komentar pada postingan ber-cursor.
func (h *FeedHandler) listComments(w http.ResponseWriter, r *http.Request, claims *auth.UserClaims, postID string) {
	before := r.URL.Query().Get("before")
	limitStr := r.URL.Query().Get("limit")

	limit := 20
	if limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
			limit = l
		}
	}

	resp, err := h.feedService.ListComments(r.Context(), claims.TenantID, postID, before, limit)
	if err != nil {
		if errors.Is(err, feed.ErrPostNotFound) {
			writeFeedError(w, http.StatusNotFound, "Postingan tidak ditemukan")
			return
		}
		writeFeedError(w, http.StatusInternalServerError, "Gagal mengambil komentar: "+err.Error())
		return
	}

	writeFeedJSON(w, http.StatusOK, resp)
}
