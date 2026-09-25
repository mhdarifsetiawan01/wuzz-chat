package app

import (
	"fmt"
	"net/http"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/api"
	"github.com/bms-del112/wuzz-chat/internal/auth"
	"github.com/bms-del112/wuzz-chat/internal/shared/ratelimit"
	"github.com/bms-del112/wuzz-chat/internal/storage"
)

// setupRouter mendaftarkan seluruh rute HTTP & WebSocket mux yang dikelompokkan
// rapi berdasarkan domain fungsional.
func (a *Application) setupRouter() http.Handler {
	mux := http.NewServeMux()

	// Helper CORS Middleware untuk REST API
	withCORS := func(h http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			a.CorsValidator.Middleware(h).ServeHTTP(w, r)
		}
	}

	// =========================================================================
	// 1. HEALTH CHECK & PUBLIC CONFIGURATION
	// =========================================================================
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"status":"ok","time":"%s"}`, time.Now().UTC().Format(time.RFC3339))
	})

	if a.MediaHandler != nil {
		mux.HandleFunc("/api/config", withCORS(a.MediaHandler.Config))
	}

	// =========================================================================
	// 1B. OPENAPI SPECIFICATION & API DOCUMENTATION (Milestone 6)
	// =========================================================================
	if a.OpenAPIHandler != nil {
		mux.HandleFunc("/api/openapi.yaml", withCORS(a.OpenAPIHandler.ServeOpenAPISpec))
		mux.HandleFunc("/api/docs", withCORS(a.OpenAPIHandler.ServeDocsUI))
	}

	// =========================================================================
	// 2. STATIC UPLOADS & MEDIA ATTACHMENTS
	// =========================================================================
	uploadDir := a.Config.UploadDir
	if uploadDir == "" {
		uploadDir = "./uploads"
	}
	_ = storage.EnsureDir(uploadDir)
	fileServer := http.FileServer(http.Dir(uploadDir))
	fileHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "public, max-age=86400")
		fileServer.ServeHTTP(w, r)
	})
	mux.Handle("/uploads/", http.StripPrefix("/uploads/", a.CorsValidator.Middleware(fileHandler)))

	if a.MediaHandler != nil {
		mux.HandleFunc("/api/media/upload", withCORS(func(w http.ResponseWriter, r *http.Request) {
			auth.RequireJWT()(http.HandlerFunc(a.MediaHandler.Upload)).ServeHTTP(w, r)
		}))
		mux.HandleFunc("/api/media/ack", withCORS(func(w http.ResponseWriter, r *http.Request) {
			auth.RequireJWT()(http.HandlerFunc(a.MediaHandler.AcknowledgeDownload)).ServeHTTP(w, r)
		}))
	}

	// =========================================================================
	// 3. LINK PREVIEW SCRAPER
	// =========================================================================
	if a.LinkPreviewHandler != nil {
		mux.HandleFunc("/api/link-preview", withCORS(func(w http.ResponseWriter, r *http.Request) {
			auth.RequireJWT()(http.HandlerFunc(a.LinkPreviewHandler.ServeHTTP)).ServeHTTP(w, r)
		}))
	}

	// =========================================================================
	// 4. AUTHENTICATION & IDENTITY (Dual-Tier Rate Limited)
	// =========================================================================
	if a.AuthHandler != nil {
		mux.HandleFunc("/api/auth/register", withCORS(func(w http.ResponseWriter, r *http.Request) {
			ratelimit.DualRateLimitMiddleware(a.AuthLimiter)(http.HandlerFunc(a.AuthHandler.Register)).ServeHTTP(w, r)
		}))
		mux.HandleFunc("/api/auth/login", withCORS(func(w http.ResponseWriter, r *http.Request) {
			ratelimit.DualRateLimitMiddleware(a.AuthLimiter)(http.HandlerFunc(a.AuthHandler.Login)).ServeHTTP(w, r)
		}))
		mux.HandleFunc("/api/auth/me", withCORS(func(w http.ResponseWriter, r *http.Request) {
			auth.RequireJWT()(http.HandlerFunc(a.AuthHandler.Me)).ServeHTTP(w, r)
		}))
		mux.HandleFunc("/api/auth/logout", withCORS(func(w http.ResponseWriter, r *http.Request) {
			auth.RequireJWT()(http.HandlerFunc(a.AuthHandler.Logout)).ServeHTTP(w, r)
		}))
		mux.HandleFunc("/api/auth/sessions/revoke-others", withCORS(func(w http.ResponseWriter, r *http.Request) {
			auth.RequireJWT()(http.HandlerFunc(a.AuthHandler.RevokeAllOtherSessions)).ServeHTTP(w, r)
		}))
		mux.HandleFunc("/api/auth/sessions", withCORS(func(w http.ResponseWriter, r *http.Request) {
			auth.RequireJWT()(http.HandlerFunc(a.AuthHandler.GetActiveSessions)).ServeHTTP(w, r)
		}))
		mux.HandleFunc("/api/auth/sessions/", withCORS(func(w http.ResponseWriter, r *http.Request) {
			auth.RequireJWT()(http.HandlerFunc(a.AuthHandler.RevokeSession)).ServeHTTP(w, r)
		}))
		if a.DeviceHandler != nil {
			mux.HandleFunc("/api/auth/devices", withCORS(func(w http.ResponseWriter, r *http.Request) {
				auth.RequireJWT()(http.HandlerFunc(a.DeviceHandler.ListDevices)).ServeHTTP(w, r)
			}))
			mux.HandleFunc("/api/auth/devices/", withCORS(func(w http.ResponseWriter, r *http.Request) {
				auth.RequireJWT()(http.HandlerFunc(a.DeviceHandler.RemoveDevice)).ServeHTTP(w, r)
			}))
		}
		if a.CredentialHandler != nil {
			mux.HandleFunc("/api/auth/credentials", withCORS(func(w http.ResponseWriter, r *http.Request) {
				auth.RequireJWT()(http.HandlerFunc(a.CredentialHandler.ListCredentials)).ServeHTTP(w, r)
			}))
		}
		mux.HandleFunc("/api/auth/profile", withCORS(func(w http.ResponseWriter, r *http.Request) {
			auth.RequireJWT()(http.HandlerFunc(a.AuthHandler.UpdateProfile)).ServeHTTP(w, r)
		}))
		mux.HandleFunc("/api/auth/verify-password", withCORS(func(w http.ResponseWriter, r *http.Request) {
			auth.RequireJWT()(http.HandlerFunc(a.AuthHandler.VerifyPassword)).ServeHTTP(w, r)
		}))
		mux.HandleFunc("/api/auth/change-password", withCORS(func(w http.ResponseWriter, r *http.Request) {
			auth.RequireJWT()(http.HandlerFunc(a.AuthHandler.ChangePassword)).ServeHTTP(w, r)
		}))
		mux.HandleFunc("/api/auth/public-key", withCORS(func(w http.ResponseWriter, r *http.Request) {
			if r.Method == http.MethodGet || r.Method == http.MethodHead {
				if a.ChatHandler != nil {
					a.ChatHandler.GetUserPublicKey(w, r)
					return
				}
			}
			auth.RequireJWT()(http.HandlerFunc(a.AuthHandler.UpdatePublicKey)).ServeHTTP(w, r)
		}))
		mux.HandleFunc("/api/user/public-key/reset", withCORS(func(w http.ResponseWriter, r *http.Request) {
			auth.RequireJWT()(http.HandlerFunc(a.AuthHandler.ResetPublicKey)).ServeHTTP(w, r)
		}))
		mux.HandleFunc("/api/users/public-key", withCORS(func(w http.ResponseWriter, r *http.Request) {
			if r.Method == http.MethodGet || r.Method == http.MethodHead {
				if a.ChatHandler != nil {
					a.ChatHandler.GetUserPublicKey(w, r)
					return
				}
			}
			auth.RequireJWT()(http.HandlerFunc(a.AuthHandler.UpdatePublicKey)).ServeHTTP(w, r)
		}))
		mux.HandleFunc("/api/users/public-key/reset", withCORS(func(w http.ResponseWriter, r *http.Request) {
			auth.RequireJWT()(http.HandlerFunc(a.AuthHandler.ResetPublicKey)).ServeHTTP(w, r)
		}))
	}

	// =========================================================================
	// 4B. EXTERNAL B2B & JIT PROVISIONING GATEWAY (Milestone 3)
	// =========================================================================
	if a.ProvisioningHandler != nil {
		mux.HandleFunc("/api/v1/auth/provision-token", withCORS(func(w http.ResponseWriter, r *http.Request) {
			api.B2BAuthGuard(a.TenantService)(http.HandlerFunc(a.ProvisioningHandler.ProvisionToken)).ServeHTTP(w, r)
		}))
		mux.HandleFunc("/api/v1/auth/exchange", withCORS(func(w http.ResponseWriter, r *http.Request) {
			a.ProvisioningHandler.ExchangeToken(w, r)
		}))
	}

	// =========================================================================
	// 5. E2EE DEVICE KEY TRANSFER (QR CODE)
	// =========================================================================
	if a.TransferHandler != nil {
		mux.HandleFunc("/api/users/transfer/create", withCORS(func(w http.ResponseWriter, r *http.Request) {
			auth.RequireJWT()(http.HandlerFunc(a.TransferHandler.CreateSession)).ServeHTTP(w, r)
		}))
		mux.HandleFunc("/api/users/transfer/consume", withCORS(func(w http.ResponseWriter, r *http.Request) {
			auth.RequireJWT()(http.HandlerFunc(a.TransferHandler.ConsumeSession)).ServeHTTP(w, r)
		}))
	}

	// =========================================================================
	// 6. CHAT & MESSAGING (Direct, Pin, Forward, Receipt)
	// =========================================================================
	if a.ChatHandler != nil {
		mux.HandleFunc("/api/users/search", withCORS(func(w http.ResponseWriter, r *http.Request) {
			auth.RequireJWT()(http.HandlerFunc(a.ChatHandler.SearchUsers)).ServeHTTP(w, r)
		}))
		mux.HandleFunc("/api/users/profile", withCORS(func(w http.ResponseWriter, r *http.Request) {
			auth.RequireJWT()(http.HandlerFunc(a.ChatHandler.GetUserProfile)).ServeHTTP(w, r)
		}))
		mux.HandleFunc("/api/conversations", withCORS(func(w http.ResponseWriter, r *http.Request) {
			if r.Method == http.MethodPost {
				auth.RequireJWT()(http.HandlerFunc(a.ChatHandler.StartDirectChat)).ServeHTTP(w, r)
			} else if r.Method == http.MethodDelete {
				auth.RequireJWT()(http.HandlerFunc(a.ChatHandler.ClearConversation)).ServeHTTP(w, r)
			} else {
				auth.RequireJWT()(http.HandlerFunc(a.ChatHandler.GetConversations)).ServeHTTP(w, r)
			}
		}))
		mux.HandleFunc("/api/conversations/clear", withCORS(func(w http.ResponseWriter, r *http.Request) {
			auth.RequireJWT()(http.HandlerFunc(a.ChatHandler.ClearConversation)).ServeHTTP(w, r)
		}))
		mux.HandleFunc("/api/conversations/pin", withCORS(func(w http.ResponseWriter, r *http.Request) {
			if r.Method == http.MethodPost {
				auth.RequireJWT()(http.HandlerFunc(a.ChatHandler.PinConversation)).ServeHTTP(w, r)
			} else {
				http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
			}
		}))
		mux.HandleFunc("/api/conversations/unpin", withCORS(func(w http.ResponseWriter, r *http.Request) {
			if r.Method == http.MethodPost {
				auth.RequireJWT()(http.HandlerFunc(a.ChatHandler.UnpinConversation)).ServeHTTP(w, r)
			} else {
				http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
			}
		}))
		mux.HandleFunc("/api/messages", withCORS(func(w http.ResponseWriter, r *http.Request) {
			if r.Method == http.MethodPut {
				auth.RequireJWT()(http.HandlerFunc(a.ChatHandler.EditMessage)).ServeHTTP(w, r)
			} else if r.Method == http.MethodDelete || r.Method == http.MethodPost {
				auth.RequireJWT()(http.HandlerFunc(a.ChatHandler.DeleteMessage)).ServeHTTP(w, r)
			} else {
				http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
			}
		}))
		mux.HandleFunc("/api/messages/edit", withCORS(func(w http.ResponseWriter, r *http.Request) {
			if r.Method == http.MethodPut || r.Method == http.MethodPost {
				auth.RequireJWT()(http.HandlerFunc(a.ChatHandler.EditMessage)).ServeHTTP(w, r)
			} else {
				http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
			}
		}))
		mux.HandleFunc("/api/messages/delete", withCORS(func(w http.ResponseWriter, r *http.Request) {
			auth.RequireJWT()(http.HandlerFunc(a.ChatHandler.DeleteMessage)).ServeHTTP(w, r)
		}))
		mux.HandleFunc("/api/messages/forward", withCORS(func(w http.ResponseWriter, r *http.Request) {
			if r.Method == http.MethodPost {
				auth.RequireJWT()(http.HandlerFunc(a.ChatHandler.ForwardMessage)).ServeHTTP(w, r)
			} else {
				http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
			}
		}))
		mux.HandleFunc("/api/messages/receipt", withCORS(func(w http.ResponseWriter, r *http.Request) {
			if r.Method == http.MethodPost {
				auth.RequireJWT()(http.HandlerFunc(a.ChatHandler.UpdateReceipt)).ServeHTTP(w, r)
			} else {
				http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
			}
		}))
		mux.HandleFunc("/api/messages/pin", withCORS(func(w http.ResponseWriter, r *http.Request) {
			if r.Method == http.MethodPost {
				auth.RequireJWT()(http.HandlerFunc(a.ChatHandler.PinMessage)).ServeHTTP(w, r)
			} else {
				http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
			}
		}))
		mux.HandleFunc("/api/messages/unpin", withCORS(func(w http.ResponseWriter, r *http.Request) {
			if r.Method == http.MethodPost {
				auth.RequireJWT()(http.HandlerFunc(a.ChatHandler.UnpinMessage)).ServeHTTP(w, r)
			} else {
				http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
			}
		}))
		mux.HandleFunc("/api/messages/pinned", withCORS(func(w http.ResponseWriter, r *http.Request) {
			if r.Method == http.MethodGet {
				auth.RequireJWT()(http.HandlerFunc(a.ChatHandler.GetPinnedMessages)).ServeHTTP(w, r)
			} else {
				http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
			}
		}))
		mux.HandleFunc("/api/messages/search", withCORS(func(w http.ResponseWriter, r *http.Request) {
			if r.Method == http.MethodGet {
				auth.RequireJWT()(http.HandlerFunc(a.ChatHandler.SearchMessages)).ServeHTTP(w, r)
			} else {
				http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
			}
		}))
	}

	// =========================================================================
	// 7. GROUP CHAT & FORUM ENGINE
	// =========================================================================
	if a.GroupHandler != nil {
		mux.HandleFunc("/api/groups", withCORS(func(w http.ResponseWriter, r *http.Request) {
			if r.Method == http.MethodPost {
				auth.RequireJWT()(http.HandlerFunc(a.GroupHandler.CreateGroup)).ServeHTTP(w, r)
			} else {
				http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
			}
		}))
		mux.HandleFunc("/api/groups/search", withCORS(func(w http.ResponseWriter, r *http.Request) {
			auth.RequireJWT()(http.HandlerFunc(a.GroupHandler.SearchPublicGroups)).ServeHTTP(w, r)
		}))
		mux.HandleFunc("/api/groups/", withCORS(func(w http.ResponseWriter, r *http.Request) {
			auth.RequireJWT()(http.HandlerFunc(a.GroupHandler.RouteGroupRequest)).ServeHTTP(w, r)
		}))
	}

	// =========================================================================
	// 8. GROUP MEMORY AI (DRAFT REVIEW & MEMBER KNOWLEDGE)
	// =========================================================================
	if a.MemoryHandler != nil {
		mux.HandleFunc("/api/memory/", withCORS(func(w http.ResponseWriter, r *http.Request) {
			auth.RequireJWT()(http.HandlerFunc(a.MemoryHandler.RouteMemoryRequest)).ServeHTTP(w, r)
		}))
		mux.HandleFunc("/api/memories/", withCORS(func(w http.ResponseWriter, r *http.Request) {
			auth.RequireJWT()(http.HandlerFunc(a.MemoryHandler.RouteApprovedMemoryRequest)).ServeHTTP(w, r)
		}))
	}

	// =========================================================================
	// 9. PUSH NOTIFICATIONS (WEB PUSH VAPID)
	// =========================================================================
	if a.NotificationHandler != nil {
		mux.HandleFunc("/api/notifications/vapid-public-key", withCORS(a.NotificationHandler.GetVAPIDPublicKey))
		mux.HandleFunc("/api/notifications/subscribe", withCORS(func(w http.ResponseWriter, r *http.Request) {
			auth.RequireJWT()(http.HandlerFunc(a.NotificationHandler.Subscribe)).ServeHTTP(w, r)
		}))
		mux.HandleFunc("/api/notifications/unsubscribe", withCORS(func(w http.ResponseWriter, r *http.Request) {
			auth.RequireJWT()(http.HandlerFunc(a.NotificationHandler.Unsubscribe)).ServeHTTP(w, r)
		}))
	}

	// =========================================================================
	// 10. WEBSOCKET REALTIME CONNECTION
	// =========================================================================
	if a.WsHandler != nil {
		mux.Handle("/ws", a.WsHandler)
	}

	var handler http.Handler = mux
	if a.TenantService != nil {
		tenantMw := api.NewTenantMiddleware(a.TenantService)
		handler = tenantMw.Handler(handler)
	}

	return handler
}
