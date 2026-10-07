package app

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/ai"
	"github.com/bms-del112/wuzz-chat/internal/api"
	"github.com/bms-del112/wuzz-chat/internal/auth"
	"github.com/bms-del112/wuzz-chat/internal/authz"
	authzgoogle "github.com/bms-del112/wuzz-chat/internal/authz/google"
	authzinfra "github.com/bms-del112/wuzz-chat/internal/authz/infra"
	authzworker "github.com/bms-del112/wuzz-chat/internal/authz/worker"
	"github.com/bms-del112/wuzz-chat/internal/broker"
	"github.com/bms-del112/wuzz-chat/internal/connection"
	connectioninfra "github.com/bms-del112/wuzz-chat/internal/connection/infra"
	"github.com/bms-del112/wuzz-chat/internal/feed"
	feedinfra "github.com/bms-del112/wuzz-chat/internal/feed/infra"
	"github.com/bms-del112/wuzz-chat/internal/group"
	groupinfra "github.com/bms-del112/wuzz-chat/internal/group/infra"
	groupworker "github.com/bms-del112/wuzz-chat/internal/group/worker"
	"github.com/bms-del112/wuzz-chat/internal/memory"
	"github.com/bms-del112/wuzz-chat/internal/messaging"
	messaginginfra "github.com/bms-del112/wuzz-chat/internal/messaging/infra"
	"github.com/bms-del112/wuzz-chat/internal/notify"
	"github.com/bms-del112/wuzz-chat/internal/push"
	"github.com/bms-del112/wuzz-chat/internal/shared/config"
	"github.com/bms-del112/wuzz-chat/internal/shared/cors"
	"github.com/bms-del112/wuzz-chat/internal/shared/ratelimit"
	"github.com/bms-del112/wuzz-chat/internal/storage"
	"github.com/bms-del112/wuzz-chat/internal/store"
	"github.com/bms-del112/wuzz-chat/internal/tenant"
	tenantinfra "github.com/bms-del112/wuzz-chat/internal/tenant/infra"
	"github.com/bms-del112/wuzz-chat/internal/worker"
	"github.com/bms-del112/wuzz-chat/internal/ws"
)

// Application bertindak sebagai Container utama sistem Wuzz Chat (Modular Monolith Container).
// Struct ini memegang seluruh referensi komponen (stores, services, handlers, workers, server)
// dan mengelola siklus hidup aplikasi (startup, running, dan graceful shutdown).
type Application struct {
	Config *config.Config
	Server *http.Server

	// LinkFreeze membekukan akun yang belum menautkan Google setelah tenggat; nil bila tidak aktif.
	LinkFreeze *authz.LinkFreezePolicy

	// Infrastructure & Stores
	Broker        broker.MessageBroker
	MessageStore  store.MessageStore
	UserStore     store.UserStore
	GroupStore    store.GroupStore
	MemoryStore   store.MemoryStore
	Storage       storage.MediaStorage
	TenantRepo    tenant.TenantRepository
	TenantService tenant.TenantService

	// Realtime Hub
	Hub *ws.Hub

	// Background Workers
	PurgeWorker       *storage.PurgeWorker
	SubGroupWorker    *groupworker.SubGroupTTLWorker
	MemoryWorker      *worker.MemoryJobWorker
	AuthCleanupWorker *authzworker.AuthCleanupWorker

	// Transport Handlers & Validators
	CorsValidator       *cors.CORSValidator
	AuthLimiter         *ratelimit.DualTierRateLimiter
	AuthHandler         *api.AuthHandler
	DeviceHandler       *api.DeviceHandler
	CredentialHandler   *api.CredentialHandler
	ChatHandler         *api.ChatHandler
	GroupHandler        *api.GroupHandler
	MemoryHandler       *api.MemoryHandler
	NotificationHandler *api.NotificationHandler
	MediaHandler        *api.MediaHandler
	LinkPreviewHandler  *api.LinkPreviewHandler
	TransferHandler     *api.TransferHandler
	ProvisioningHandler *api.ProvisioningHandler
	OpenAPIHandler      *api.OpenAPIHandler
	FeedHandler         *api.FeedHandler
	ReportHandler       *api.ReportHandler
	ModerationHandler   *api.ModerationHandler
	// EvidenceWorker menghapus bukti laporan yang melewati masa simpan; nil bila alat moderasi/retensi tidak aktif.
	EvidenceWorker *worker.EvidenceRetentionWorker
	// Notifier mengirim pemberitahuan laporan baru ke Telegram dll; nil bila tidak ada saluran aktif.
	Notifier *notify.Dispatcher
	// Suspension menolak akun yang ditangguhkan moderator; nil bila alat moderasi tidak aktif.
	Suspension        *authz.SuspensionPolicy
	ConnectionHandler *api.ConnectionHandler
	ConnectionService *connection.ConnectionService
	WsHandler         *ws.Handler
}

// New mengorkestrasi perakitan dependency injection secara berurutan dalam 7 tahap:
// 1. Storage & Database Layer
// 2. Infrastructure Layer (Broker, CORS, Push, Media Storage)
// 3. Domain Repositories & Adapters (DDD Clean Architecture)
// 4. Application Services (Use Cases)
// 5. Background Workers
// 6. Transport Handlers
// 7. WebSocket Hub & Handlers
func New(cfg *config.Config) (*Application, error) {
	app := &Application{
		Config: cfg,
	}

	// -------------------------------------------------------------------------
	// TAHAP 1: Storage Layer (Database & Client Storage)
	// -------------------------------------------------------------------------
	clientStore := store.NewMemoryClientStore()

	messageStore, err := store.NewMessageStoreFromEnv()
	if err != nil {
		return nil, fmt.Errorf("gagal menginisialisasi message store: %w", err)
	}
	app.MessageStore = messageStore

	var userStore store.UserStore
	var groupStore store.GroupStore
	var transferStore store.TransferStore
	var memoryStore store.MemoryStore
	var tokenStore store.TokenStore
	var sessionStore store.SessionStore
	var deviceStore store.DeviceStore
	var credentialStore store.CredentialStore
	var tenantRepo tenant.TenantRepository
	var tenantSvc tenant.TenantService
	var accountEraser store.AccountEraser
	var reportStore store.ReportStore
	var moderationStore store.ModerationStore
	var suspension *authz.SuspensionPolicy
	var rolePolicy *authz.RolePolicy
	var roleResolver auth.RoleResolver // peran istimewa diverifikasi ke database; nil bila alat moderasi tidak aktif
	var feedRepo feed.FeedRepository
	var connRepo connection.ConnectionRepository

	if sqlStore, ok := messageStore.(*store.SQLMessageStore); ok {
		sqlUserStore := store.NewSQLUserStore(sqlStore.DB(), sqlStore.DriverName())
		userStore = sqlUserStore
		groupStore = store.NewSQLGroupStore(sqlStore.DB(), sqlStore.DriverName())
		transferStore = store.NewSQLTransferStore(sqlStore.DB(), sqlStore.DriverName())
		memoryStore = store.NewSQLMemoryStore(sqlStore.DB(), sqlStore.DriverName())
		sqlTokenStore := store.NewSQLTokenStore(sqlStore.DB(), sqlStore.DriverName())
		tokenStore = sqlTokenStore
		auth.SetTokenChecker(sqlTokenStore)
		sessionStore = store.NewSQLSessionStore(sqlStore.DB(), sqlStore.DriverName())
		deviceStore = store.NewSQLDeviceStore(sqlStore.DB(), sqlStore.DriverName())
		credentialStore = store.NewSQLCredentialStore(sqlStore.DB(), sqlStore.DriverName())
		accountEraser = store.NewSQLAccountEraser(sqlStore.DB(), sqlStore.DriverName())
		if rs, err := store.NewSQLReportStore(sqlStore.DB(), sqlStore.DriverName()); err != nil {
			log.Printf("⚠️ Laporan konten dinonaktifkan: %v", err)
		} else {
			reportStore = rs
		}
		if ms, err := store.NewSQLModerationStore(sqlStore.DB(), sqlStore.DriverName()); err != nil {
			log.Printf("⚠️ Alat moderasi dan penangguhan akun dinonaktifkan: %v", err)
		} else {
			moderationStore = ms
			suspension = authz.NewSuspensionPolicy(ms)
			rolePolicy = authz.NewRolePolicy(ms)
			roleResolver = rolePolicy
		}
		sqlUserStore.SetCredentialStore(credentialStore)

		sqlTenantRepo := tenantinfra.NewSQLTenantRepository(sqlStore.DB(), sqlStore.DriverName())
		tenantRepo = sqlTenantRepo
		tenantSvc = tenant.NewTenantService(sqlTenantRepo)
		// Validasi tenant per permintaan (middleware) disimpan 30 detik; jalur kunci API tetap membaca langsung.
		if c, ok := tenantSvc.(interface{ SetActiveCacheTTL(time.Duration) }); ok {
			c.SetActiveCacheTTL(tenant.DefaultActiveTenantCacheTTL)
		}

		feedRepo = feedinfra.NewSQLFeedRepository(sqlStore.DB(), sqlStore.DriverName())
		connRepo = connectioninfra.NewSQLConnectionRepository(sqlStore.DB(), sqlStore.DriverName())
	}

	app.UserStore = userStore
	app.GroupStore = groupStore
	app.MemoryStore = memoryStore
	app.TenantRepo = tenantRepo
	app.TenantService = tenantSvc

	// -------------------------------------------------------------------------
	// TAHAP 2: Infrastructure Layer (Broker, CORS, Push, Storage)
	// -------------------------------------------------------------------------
	messageBroker, err := broker.NewBrokerFromEnv()
	if err != nil {
		log.Printf("⚠️ Gagal inisialisasi broker: %v, fallback ke InMemory", err)
		messageBroker = broker.NewInMemoryBroker()
	}
	app.Broker = messageBroker

	pushService := push.NewService(userStore)
	corsValidator := cors.NewCORSValidatorFromEnv()
	app.CorsValidator = corsValidator

	mediaStorage, err := storage.NewMediaStorageFromEnv()
	if err != nil {
		log.Printf("⚠️ Gagal inisialisasi media storage: %v", err)
	}
	app.Storage = mediaStorage

	// -------------------------------------------------------------------------
	// TAHAP 3 & 4: Domain Repositories & Application Services
	// -------------------------------------------------------------------------
	var messagingRepo *messaginginfra.SQLMessagingRepository
	var forumContextSource *groupinfra.ForumContextSource
	var memoryRegistry *memory.Registry

	if userStore != nil {
		authRepo := authzinfra.NewSQLAuthRepository(userStore, sessionStore, deviceStore, tokenStore, transferStore)
		authSvc := authz.NewAuthService(authRepo, nil)
		authSvc.SetSuspension(suspension)
		if sqlStore, ok := messageStore.(*store.SQLMessageStore); ok && cfg != nil && len(cfg.GoogleOAuthClientIDs) > 0 {
			authSvc.SetGoogleAuth(
				authzgoogle.NewJWKSVerifier(cfg.GoogleOAuthClientIDs),
				store.NewSQLOAuthStore(sqlStore.DB(), sqlStore.DriverName()),
			)
			log.Printf("🔐 Login Google aktif (%d client ID)", len(cfg.GoogleOAuthClientIDs))

			// Pembekuan akun yang belum menautkan Google setelah tenggat (kill switch GOOGLE_LINK_FREEZE, default mati).
			if cfg.GoogleLinkFreeze {
				if cfg.GoogleLinkDeadline.IsZero() {
					log.Printf("⚠️ GOOGLE_LINK_FREEZE=true diabaikan: GOOGLE_LINK_DEADLINE belum diatur")
				} else {
					app.LinkFreeze = authz.NewLinkFreezePolicy(true, cfg.GoogleLinkDeadline, store.NewSQLOAuthStore(sqlStore.DB(), sqlStore.DriverName()))
					log.Printf("🧊 Pembekuan akun belum menautkan Google AKTIF mulai %s", cfg.GoogleLinkDeadline.Format(time.RFC3339))
				}
			}
		}
		app.AuthHandler = api.NewAuthHandlerWithService(authSvc, userStore)
		if tokenStore != nil {
			app.AuthHandler.SetTokenStore(tokenStore)
		}
		if accountEraser != nil {
			app.AuthHandler.SetAccountEraser(accountEraser)
		}
		app.AuthHandler.SetLinkFreeze(app.LinkFreeze)
		// Handler juga butuh kebijakan penangguhan (bukan hanya service) agar GET /api/auth/me memberi tahu klien lewat flag.
		app.AuthHandler.SetSuspension(suspension)
		if cfg != nil && !cfg.GoogleLinkDeadline.IsZero() {
			app.AuthHandler.SetGoogleLinkDeadline(cfg.GoogleLinkDeadline)
			log.Printf("📣 Pengumuman penautan Google aktif (batas waktu: %s)", cfg.GoogleLinkDeadline.Format(time.RFC3339))
		}
		if tenantSvc != nil {
			tenantSvc.SetUserStore(userStore)
			tenantSvc.SetAuthzRepo(authRepo)
			app.ProvisioningHandler = api.NewProvisioningHandler(tenantSvc)
		}
		if sessionStore != nil {
			app.AuthHandler.SetSessionStore(sessionStore)
		}
		if deviceStore != nil {
			app.AuthHandler.SetDeviceStore(deviceStore)
			app.DeviceHandler = api.NewDeviceHandler(deviceStore)
			if sessionStore != nil {
				app.DeviceHandler.SetSessionStore(sessionStore)
			}
			if userStore != nil {
				app.DeviceHandler.SetUserStore(userStore)
			}
		}
		if credentialStore != nil {
			app.CredentialHandler = api.NewCredentialHandler(credentialStore)
		}

		messagingRepo = messaginginfra.NewSQLMessagingRepository(messageStore, userStore)
		messagingSvc := messaging.NewMessageService(messagingRepo, messagingRepo, messagingRepo, nil)
		app.ChatHandler = api.NewChatHandlerWithService(messagingSvc, userStore, messageStore, authSvc)

		groupRepo := groupinfra.NewSQLGroupRepository(groupStore, userStore)
		groupSvc := group.NewGroupService(groupRepo, groupRepo, nil, nil)
		forumSvc := group.NewForumService(groupRepo, groupRepo, memoryStore, nil, nil)
		app.GroupHandler = api.NewGroupHandlerWithServices(groupSvc, forumSvc, groupStore, userStore)

		app.NotificationHandler = api.NewNotificationHandler(pushService, userStore)

		if memoryStore != nil {
			forumContextSource = groupinfra.NewForumContextSource(groupRepo, messageStore)
			memoryRegistry = memory.NewRegistry()
			memoryRegistry.Register(memory.ContextTypeForum, forumContextSource)

			app.MemoryHandler = api.NewMemoryHandler(memoryStore, groupStore, userStore)
		}
	}

	if transferStore != nil {
		app.TransferHandler = api.NewTransferHandler(transferStore)
		if sessionStore != nil {
			app.TransferHandler.SetSessionStore(sessionStore)
		}
	}

	app.MediaHandler = api.NewMediaHandler(mediaStorage, messageStore)
	if userStore != nil {
		app.MediaHandler.SetUserStore(userStore)
	}

	app.LinkPreviewHandler = api.NewLinkPreviewHandler(messageBroker)
	app.OpenAPIHandler = api.NewOpenAPIHandler()
	app.AuthLimiter = ratelimit.NewDualTierRateLimiter(cfg.AuthRateLimitIP, cfg.AuthRateLimitUser, 1*time.Minute)

	if reportStore != nil {
		app.ReportHandler = api.NewReportHandler(reportStore)
	}
	app.Suspension = suspension
	// Selalu dipasang (juga nil) agar resolver instans lain/tes sebelumnya tidak tertinggal.
	auth.SetRoleResolver(roleResolver)
	if moderationStore != nil {
		app.ModerationHandler = api.NewModerationHandler(moderationStore, suspension)
		app.ModerationHandler.SetRolePolicy(rolePolicy)
		app.ModerationHandler.SetEvidenceRetention(cfg.ReportEvidenceRetentionDays)
		if cfg.ReportEvidenceRetentionDays > 0 {
			app.EvidenceWorker = worker.NewEvidenceRetentionWorker(moderationStore, time.Duration(cfg.ReportEvidenceRetentionDays)*24*time.Hour, 0)
		}
	}
	if cfg != nil && len(cfg.ModerationNotify) > 0 {
		app.Notifier = notify.Build(notify.Settings{
			Channels: cfg.ModerationNotify, AdminURL: cfg.ModerationAdminURL,
			TelegramBotToken: cfg.TelegramBotToken, TelegramChatID: cfg.TelegramChatID,
		})
		if app.Notifier != nil {
			log.Printf("🔔 Notifikasi moderasi aktif: %v", app.Notifier.Channels())
			if app.ReportHandler != nil {
				app.ReportHandler.SetNotifier(app.Notifier)
			}
			if app.ModerationHandler != nil {
				app.ModerationHandler.SetNotifier(app.Notifier)
			}
		}
	}

	// Inisialisasi Community Social Feed Engine (Milestone M-Mobile-9.2)
	if feedRepo != nil {
		feedSvc := feed.NewFeedService(feedRepo)
		app.FeedHandler = api.NewFeedHandlerWithService(feedSvc)
	}

	// Inisialisasi User Connections & Friendlist Engine (Milestone M-Mobile-10)
	if connRepo != nil {
		connSvc := connection.NewConnectionService(connRepo, userStore, cfg.Connection)
		app.ConnectionService = connSvc
		app.ConnectionHandler = api.NewConnectionHandlerWithService(connSvc)
	}

	// -------------------------------------------------------------------------
	// TAHAP 5: Background Workers
	// -------------------------------------------------------------------------
	// 5.1 Auth Cleaner Worker (Membersihkan token, session, dan transfer QR expired)
	if tokenStore != nil || sessionStore != nil || transferStore != nil {
		app.AuthCleanupWorker = authzworker.NewAuthCleanupWorker(
			tokenStore,
			sessionStore,
			transferStore,
			authzworker.CleanerConfig{
				TokenInterval:    cfg.TokenCleanupInterval,
				SessionInterval:  cfg.SessionCleanupInterval,
				TransferInterval: cfg.TransferCleanupInterval,
			},
		)
	}

	// 5.2 Purge Worker (Pembersihan file media kedaluwarsa sesuai retensi)
	if mediaStorage != nil && messageStore != nil {
		app.PurgeWorker = storage.NewPurgeWorker(mediaStorage, messageStore, cfg.MediaRetentionDays, cfg.PurgeWorkerInterval)
		if sqlStore, ok := messageStore.(*store.SQLMessageStore); ok {
			app.PurgeWorker.SetQueue(store.NewSQLMediaPurgeQueue(sqlStore.DB(), sqlStore.DriverName()))
		}
	}

	// 5.3 SubGroup TTL Worker (Auto-expire topik subgrup/forum)
	if groupStore != nil {
		groupRepo := groupinfra.NewSQLGroupRepository(groupStore, userStore)
		app.SubGroupWorker = groupworker.NewSubGroupTTLWorker(groupRepo, cfg.SubGroupWorkerInterval)
		if memoryStore != nil {
			app.SubGroupWorker.SetMemoryStore(memoryStore)
		}
	}

	// 5.4 Group Memory AI Job Worker (Analisis LLM latar belakang)
	if memoryStore != nil {
		aiService := ai.NewAIServiceFromEnv()
		memoryProcessor := ai.NewMemoryProcessor(memoryStore, messageStore, groupStore, aiService)
		if memoryRegistry != nil {
			memoryProcessor.SetRegistry(memoryRegistry)
		}
		if forumContextSource != nil {
			memoryProcessor.SetContextSource(forumContextSource)
		}
		if pushService != nil {
			memoryProcessor.SetPushService(pushService)
		}
		app.MemoryWorker = worker.NewMemoryJobWorker(memoryStore, messageStore, cfg.MemoryWorkerInterval)
		if cfg.MemoryJobBatchSize > 0 {
			app.MemoryWorker.SetBatchSize(cfg.MemoryJobBatchSize)
		}
		app.MemoryWorker.SetProcessor(memoryProcessor)
	}

	// -------------------------------------------------------------------------
	// TAHAP 6 & 7: WebSocket Hub & Handlers Interconnection
	// -------------------------------------------------------------------------
	hub := ws.NewHub(clientStore, messageStore)
	if messagingRepo != nil {
		hub.SetRoomAuth(messagingRepo)
		hub.SetMessageManager(messagingRepo)
	} else if userStore != nil {
		hub.SetUserStore(userStore)
	}
	hub.SetPushService(pushService)
	var freezeFilter func([]string) []string
	if app.LinkFreeze != nil {
		freeze := app.LinkFreeze
		// Koneksi yang sudah terbuka sebelum tenggat diputus begitu akun beku mengirim apa pun.
		hub.SetAccessGate(func(userID, tenantID string) bool {
			return !freeze.IsFrozen(context.Background(), userID, tenantID)
		})
		// Akun beku tidak menerima notifikasi push (isinya pesan terenkripsi yang didekripsi di perangkat).
		freezeFilter = func(userIDs []string) []string {
			if !freeze.Active() {
				return userIDs
			}
			allowed := make([]string, 0, len(userIDs))
			for _, id := range userIDs {
				tenantID := ""
				if u, err := userStore.GetUserByID(id); err == nil && u != nil {
					tenantID = u.TenantID
				}
				if !freeze.IsFrozen(context.Background(), id, tenantID) {
					allowed = append(allowed, id)
				}
			}
			return allowed
		}
	}
	// Akun yang ditangguhkan moderator juga tidak menerima notifikasi push.
	if freezeFilter != nil || suspension != nil {
		pushService.SetRecipientFilter(func(userIDs []string) []string {
			if freezeFilter != nil {
				userIDs = freezeFilter(userIDs)
			}
			if suspension == nil {
				return userIDs
			}
			allowed := make([]string, 0, len(userIDs))
			for _, id := range userIDs {
				if !suspension.IsSuspended(context.Background(), id) {
					allowed = append(allowed, id)
				}
			}
			return allowed
		})
	}
	hub.SetBroker(messageBroker)
	app.Hub = hub

	if suspension != nil {
		hub.SetSuspensionGate(func(userID string) bool { return suspension.IsSuspended(context.Background(), userID) })
	}
	if app.ModerationHandler != nil {
		// Pesan grup yang dihapus moderator langsung hilang di ruang yang sedang terbuka (seperti penarikan pesan oleh pengirim).
		app.ModerationHandler.SetMessageDeletedHook(func(dm store.DeletedMessage) {
			hub.BroadcastRoom(dm.RoomID, ws.Message{
				ID: dm.MessageID, Type: ws.TypeMessageDeleted, Room: dm.RoomID, TenantID: dm.TenantID,
				Content: "🚫 Pesan ini telah dihapus", IsDeleted: true, Timestamp: time.Now().UTC(),
			}, "")
		})
		app.ModerationHandler.SetSessionControl(func(userID, reason string) { hub.KickClientByUserID(userID, "", reason) })
	}

	if app.ConnectionService != nil {
		pcc := connection.NewPrivacyCallChecker(userStore, app.ConnectionService)
		hub.SetPrivacyCallChecker(pcc)
	}

	if app.TransferHandler != nil {
		app.TransferHandler.SetHub(hub)
	}
	if app.AuthHandler != nil {
		app.AuthHandler.SetHub(hub)
	}
	if app.DeviceHandler != nil {
		app.DeviceHandler.SetHub(hub)
	}
	if app.ChatHandler != nil {
		app.ChatHandler.SetHub(hub)
		if app.ConnectionService != nil {
			app.ChatHandler.SetConnectionService(app.ConnectionService)
		}
	}
	if app.GroupHandler != nil {
		app.GroupHandler.SetHub(hub)
		app.GroupHandler.SetPushService(pushService)
	}
	if app.MemoryHandler != nil {
		app.MemoryHandler.SetHub(hub)
		app.MemoryHandler.SetPushService(pushService)
		if app.GroupHandler != nil {
			app.GroupHandler.SetMemoryHandler(app.MemoryHandler)
		}
	}

	wsHandler := ws.NewHandler(hub, corsValidator)
	wsHandler.SetUserStore(userStore)
	if deviceStore != nil {
		wsHandler.SetDeviceStore(deviceStore)
	}
	app.WsHandler = wsHandler

	// -------------------------------------------------------------------------
	// Inisialisasi HTTP Server dengan Timeout Aman
	// -------------------------------------------------------------------------
	addr := ":" + cfg.Port
	app.Server = &http.Server{
		Addr:         addr,
		Handler:      app.setupRouter(),
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	return app, nil
}

// Run memulai background workers dan menyalakan HTTP & WebSocket server.
func (a *Application) Run() error {
	// 1. Jalankan seluruh background workers
	if a.PurgeWorker != nil {
		a.PurgeWorker.Start()
	}
	if a.SubGroupWorker != nil {
		a.SubGroupWorker.Start()
	}
	if a.MemoryWorker != nil {
		a.MemoryWorker.Start()
	}
	if a.AuthCleanupWorker != nil {
		a.AuthCleanupWorker.Start()
	}
	a.Notifier.Start()
	a.EvidenceWorker.Start()

	// 2. Banner info server
	log.Printf("🚀 Wuzz Chat backend berjalan di ws://localhost%s/ws", a.Server.Addr)
	log.Printf("   Health check: http://localhost%s/health", a.Server.Addr)

	// 3. ListenAndServe (blocking sampai shutdown dipanggil)
	if err := a.Server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		return err
	}
	return nil
}

// Shutdown mematikan HTTP server secara anggun dan menghentikan seluruh background workers.
func (a *Application) Shutdown(ctx context.Context) error {
	// 1. Matikan background workers terlebih dahulu
	a.Notifier.Stop()
	a.EvidenceWorker.Stop()
	if a.AuthCleanupWorker != nil {
		a.AuthCleanupWorker.Stop()
	}
	if a.SubGroupWorker != nil {
		a.SubGroupWorker.Stop()
	}
	if a.PurgeWorker != nil {
		a.PurgeWorker.Stop()
	}
	if a.MemoryWorker != nil {
		a.MemoryWorker.Stop()
	}

	// 2. Graceful shutdown HTTP server
	if a.Server != nil {
		if err := a.Server.Shutdown(ctx); err != nil {
			return fmt.Errorf("http server shutdown error: %w", err)
		}
	}
	return nil
}

// Close menutup resource sistem yang terbuka (broker, koneksi database, dll).
func (a *Application) Close() error {
	if a.Broker != nil {
		a.Broker.Close()
	}
	return nil
}
