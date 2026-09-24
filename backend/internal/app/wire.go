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
	authzinfra "github.com/bms-del112/wuzz-chat/internal/authz/infra"
	authzworker "github.com/bms-del112/wuzz-chat/internal/authz/worker"
	"github.com/bms-del112/wuzz-chat/internal/broker"
	"github.com/bms-del112/wuzz-chat/internal/group"
	groupinfra "github.com/bms-del112/wuzz-chat/internal/group/infra"
	groupworker "github.com/bms-del112/wuzz-chat/internal/group/worker"
	"github.com/bms-del112/wuzz-chat/internal/memory"
	"github.com/bms-del112/wuzz-chat/internal/messaging"
	messaginginfra "github.com/bms-del112/wuzz-chat/internal/messaging/infra"
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
	CorsValidator      *cors.CORSValidator
	AuthLimiter        *ratelimit.DualTierRateLimiter
	AuthHandler        *api.AuthHandler
	DeviceHandler      *api.DeviceHandler
	CredentialHandler  *api.CredentialHandler
	ChatHandler        *api.ChatHandler
	GroupHandler       *api.GroupHandler
	MemoryHandler      *api.MemoryHandler
	NotificationHandler *api.NotificationHandler
	MediaHandler       *api.MediaHandler
	LinkPreviewHandler *api.LinkPreviewHandler
	TransferHandler    *api.TransferHandler
	WsHandler          *ws.Handler
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
		sqlUserStore.SetCredentialStore(credentialStore)

		sqlTenantRepo := tenantinfra.NewSQLTenantRepository(sqlStore.DB(), sqlStore.DriverName())
		tenantRepo = sqlTenantRepo
		tenantSvc = tenant.NewTenantService(sqlTenantRepo)
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
		app.AuthHandler = api.NewAuthHandlerWithService(authSvc, userStore)
		if tokenStore != nil {
			app.AuthHandler.SetTokenStore(tokenStore)
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
	app.AuthLimiter = ratelimit.NewDualTierRateLimiter(cfg.AuthRateLimitIP, cfg.AuthRateLimitUser, 1*time.Minute)

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
	hub.SetBroker(messageBroker)
	app.Hub = hub

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
