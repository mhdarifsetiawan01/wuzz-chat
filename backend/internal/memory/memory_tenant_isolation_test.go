package memory_test

import (
	"context"
	"errors"
	"path/filepath"
	"testing"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/group"
	groupinfra "github.com/bms-del112/wuzz-chat/internal/group/infra"
	"github.com/bms-del112/wuzz-chat/internal/memory"
	memoryinfra "github.com/bms-del112/wuzz-chat/internal/memory/infra"
	tenantshared "github.com/bms-del112/wuzz-chat/internal/shared/tenant"
	"github.com/bms-del112/wuzz-chat/internal/store"
	"github.com/bms-del112/wuzz-chat/internal/worker"
	"github.com/google/uuid"
	_ "modernc.org/sqlite"
)

// setupIsolationTestDB membuat database SQLite terisolasi untuk pengujian multi-tenant.
func setupIsolationTestDB(t *testing.T) (*store.SQLMessageStore, store.MemoryStore, func()) {
	t.Helper()
	tmpDB := filepath.Join(t.TempDir(), "test_mem_isolation.db")
	sqlStore, err := store.NewSQLMessageStore("sqlite", tmpDB)
	if err != nil {
		t.Fatalf("Gagal inisialisasi sqlStore: %v", err)
	}
	memStore := store.NewSQLMemoryStore(sqlStore.DB(), "sqlite")

	return sqlStore, memStore, func() {
		_ = sqlStore.Close()
	}
}

// TestMemoryTenantIsolation_JobQueue memverifikasi bahwa antrean job terisolasi penuh antar tenant.
func TestMemoryTenantIsolation_JobQueue(t *testing.T) {
	msgStore, memStore, cleanup := setupIsolationTestDB(t)
	defer cleanup()

	ctxAlpha := tenantshared.WithTenant(context.Background(), "tenant_alpha")
	ctxBeta := tenantshared.WithTenant(context.Background(), "tenant_beta")

	forumAlpha := "sub_" + uuid.New().String()
	groupAlpha := "grp_" + uuid.New().String()
	forumBeta := "sub_" + uuid.New().String()
	groupBeta := "grp_" + uuid.New().String()

	// 1. Buat job di Tenant Alpha dan Tenant Beta
	jobAlpha, err := memStore.CreateJob(ctxAlpha, forumAlpha, groupAlpha)
	if err != nil {
		t.Fatalf("Gagal membuat job alpha: %v", err)
	}
	if jobAlpha.TenantID != "tenant_alpha" {
		t.Errorf("Ekspektasi TenantID 'tenant_alpha', dapat '%s'", jobAlpha.TenantID)
	}

	jobBeta, err := memStore.CreateJob(ctxBeta, forumBeta, groupBeta)
	if err != nil {
		t.Fatalf("Gagal membuat job beta: %v", err)
	}
	if jobBeta.TenantID != "tenant_beta" {
		t.Errorf("Ekspektasi TenantID 'tenant_beta', dapat '%s'", jobBeta.TenantID)
	}

	// 2. Query GetPendingJobs dari context Tenant Alpha
	pendingAlpha, err := memStore.GetPendingJobs(ctxAlpha, 10)
	if err != nil {
		t.Fatalf("GetPendingJobs Alpha gagal: %v", err)
	}
	if len(pendingAlpha) != 1 {
		t.Fatalf("Ekspektasi 1 job pending di Alpha, dapat %d", len(pendingAlpha))
	}
	if pendingAlpha[0].ID != jobAlpha.ID {
		t.Errorf("Job yang diambil salah: %s vs %s", pendingAlpha[0].ID, jobAlpha.ID)
	}

	// 3. Query GetPendingJobs dari context Tenant Beta
	pendingBeta, err := memStore.GetPendingJobs(ctxBeta, 10)
	if err != nil {
		t.Fatalf("GetPendingJobs Beta gagal: %v", err)
	}
	if len(pendingBeta) != 1 {
		t.Fatalf("Ekspektasi 1 job pending di Beta, dapat %d", len(pendingBeta))
	}
	if pendingBeta[0].ID != jobBeta.ID {
		t.Errorf("Job yang diambil salah: %s vs %s", pendingBeta[0].ID, jobBeta.ID)
	}

	// 4. Cross-tenant ClaimJob prevention: Worker Tenant Alpha mencoba claim job milik Tenant Beta
	_, errClaimCross := memStore.ClaimJob(ctxAlpha, jobBeta.ID)
	if errClaimCross == nil {
		t.Fatalf("Harusnya Worker Alpha GAGAL meng-claim job milik Tenant Beta")
	}

	// 5. Worker scoped to Tenant Alpha
	wAlpha := worker.NewMemoryJobWorker(memStore, msgStore, time.Minute)
	wAlpha.SetTenantID("tenant_alpha")
	processedAlpha := wAlpha.ProcessOnce()
	if processedAlpha != 1 {
		t.Errorf("Ekspektasi worker alpha memproses 1 job, dapat: %d", processedAlpha)
	}

	// Verifikasi job Alpha sekarang COMPLETED, tetapi job Beta masih QUEUED
	jobAlphaAfter, _ := memStore.GetJobByID(ctxAlpha, jobAlpha.ID)
	if jobAlphaAfter.Status != store.JobStatusCompleted {
		t.Errorf("Job alpha harusnya COMPLETED, status: %s", jobAlphaAfter.Status)
	}
	jobBetaAfter, _ := memStore.GetJobByID(ctxBeta, jobBeta.ID)
	if jobBetaAfter.Status != store.JobStatusQueued {
		t.Errorf("Job beta harusnya masih QUEUED, status: %s", jobBetaAfter.Status)
	}
}

// mockAccessCheckerForIsolation mendukung metadata grup multi-tenant.
type mockAccessCheckerForIsolation struct {
	groupDetails map[string]*store.GroupDetails
	roles        map[string]map[string]string // groupID -> userID -> role
	members      map[string][]store.GroupMemberItem
}

func (m *mockAccessCheckerForIsolation) GetUserRoleInGroup(conversationID, userID string) (string, error) {
	if rMap, ok := m.roles[conversationID]; ok {
		if role, okR := rMap[userID]; okR {
			return role, nil
		}
	}
	return "", errors.New("bukan anggota grup")
}

func (m *mockAccessCheckerForIsolation) GetGroupDetails(conversationID, currentUserID string) (*store.GroupDetails, error) {
	if dtl, ok := m.groupDetails[conversationID]; ok {
		return dtl, nil
	}
	return nil, errors.New("grup tidak ditemukan")
}

func (m *mockAccessCheckerForIsolation) GetGroupMembers(conversationID string) ([]store.GroupMemberItem, error) {
	return m.members[conversationID], nil
}

// TestMemoryTenantIsolation_DraftReviewSecurityGate menguji proteksi isolasi pada draft review & approvals.
func TestMemoryTenantIsolation_DraftReviewSecurityGate(t *testing.T) {
	_, memStore, cleanup := setupIsolationTestDB(t)
	defer cleanup()

	repo := memoryinfra.NewSQLMemoryRepository(memStore)

	ctxAlpha := tenantshared.WithTenant(context.Background(), "tenant_alpha")
	ctxBeta := tenantshared.WithTenant(context.Background(), "tenant_beta")

	groupAlphaID := "grp_alpha_01"
	groupBetaID := "grp_beta_01"
	adminAlpha := "usr_admin_alpha"
	adminBeta := "usr_admin_beta"

	accessCheck := &mockAccessCheckerForIsolation{
		groupDetails: map[string]*store.GroupDetails{
			groupAlphaID: {ID: groupAlphaID, Title: "Grup Alpha", TenantID: "tenant_alpha"},
			groupBetaID:  {ID: groupBetaID, Title: "Grup Beta", TenantID: "tenant_beta"},
		},
		roles: map[string]map[string]string{
			groupAlphaID: {adminAlpha: "admin"},
			groupBetaID:  {adminBeta: "admin"},
		},
		members: make(map[string][]store.GroupMemberItem),
	}

	svc := memory.NewMemoryService(repo, nil, nil, accessCheck, nil)

	// 1. Buat Draft di Tenant Alpha
	draftID := "draft_alpha_01"
	draft := &memory.MemoryDraft{
		ID:                    draftID,
		JobID:                 "job_alpha_01",
		ContextID:             "forum_alpha_01",
		ContextType:           memory.ContextTypeForum,
		ParentID:              groupAlphaID,
		TenantID:              "tenant_alpha",
		Status:                memory.DraftStatusDraft,
		MessageCountProcessed: 5,
		CreatedAt:             time.Now().UTC(),
	}
	artifacts := []memory.MemoryArtifact{
		{
			ID:                "art_alpha_sum",
			DraftID:           draftID,
			Type:              memory.ArtifactTypeSummary,
			Content:           "Ringkasan rahasia Tenant Alpha",
			AIOriginalContent: "Ringkasan rahasia Tenant Alpha",
			Confidence:        memory.ConfidenceHigh,
		},
		{
			ID:                "art_alpha_jl",
			DraftID:           draftID,
			Type:              memory.ArtifactTypeJourneyLite,
			Content:           "Perjalanan diskusi Tenant Alpha",
			AIOriginalContent: "Perjalanan diskusi Tenant Alpha",
			Confidence:        memory.ConfidenceMedium,
		},
	}

	if err := repo.CreateDraftWithArtifacts(ctxAlpha, draft, artifacts); err != nil {
		t.Fatalf("Gagal membuat draft alpha: %v", err)
	}

	// 2. Uji Cross-Tenant ListDrafts: Admin Beta mencoba melihat draft Grup Alpha (ditolak di level service access check)
	_, errList := svc.ListDrafts(ctxBeta, groupAlphaID, "", adminBeta)
	if !errors.Is(errList, memory.ErrUnauthorizedAccess) {
		t.Errorf("Ekspektasi ErrUnauthorizedAccess pada cross-tenant ListDrafts, dapat: %v", errList)
	}

	// 3. Uji Cross-Tenant GetDraftDetail: Admin Beta mencoba membuka detail Draft Alpha (ditolak di repo atau service)
	_, _, errDetail := svc.GetDraftDetail(ctxBeta, draftID, adminBeta)
	if !errors.Is(errDetail, memory.ErrUnauthorizedAccess) && !errors.Is(errDetail, memory.ErrDraftNotFound) {
		t.Errorf("Ekspektasi ErrUnauthorizedAccess atau ErrDraftNotFound pada cross-tenant GetDraftDetail, dapat: %v", errDetail)
	}

	// 4. Uji Cross-Tenant UpdateArtifactContent: Admin Beta mencoba menyunting artefak Draft Alpha
	_, errEdit := svc.UpdateArtifactContent(ctxBeta, draftID, "art_alpha_sum", "Konten dibajak", adminBeta)
	if !errors.Is(errEdit, memory.ErrUnauthorizedAccess) && !errors.Is(errEdit, memory.ErrDraftNotFound) {
		t.Errorf("Ekspektasi ErrUnauthorizedAccess atau ErrDraftNotFound pada cross-tenant UpdateArtifactContent, dapat: %v", errEdit)
	}

	// 5. Uji Cross-Tenant RemoveJourneyLite: Admin Beta mencoba menghapus Journey Lite Draft Alpha
	errRemoveJL := svc.RemoveJourneyLite(ctxBeta, draftID, adminBeta)
	if !errors.Is(errRemoveJL, memory.ErrUnauthorizedAccess) && !errors.Is(errRemoveJL, memory.ErrDraftNotFound) {
		t.Errorf("Ekspektasi ErrUnauthorizedAccess atau ErrDraftNotFound pada cross-tenant RemoveJourneyLite, dapat: %v", errRemoveJL)
	}

	// 6. Uji Cross-Tenant RejectDraft: Admin Beta mencoba mereject Draft Alpha
	errReject := svc.RejectDraft(ctxBeta, draftID, adminBeta, "Spam")
	if !errors.Is(errReject, memory.ErrUnauthorizedAccess) && !errors.Is(errReject, memory.ErrDraftNotFound) {
		t.Errorf("Ekspektasi ErrUnauthorizedAccess atau ErrDraftNotFound pada cross-tenant RejectDraft, dapat: %v", errReject)
	}

	// 7. Uji Cross-Tenant ApproveDraft: Admin Beta mencoba mengapprove Draft Alpha
	_, errApprove := svc.ApproveDraft(ctxBeta, draftID, adminBeta, false)
	if !errors.Is(errApprove, memory.ErrUnauthorizedAccess) && !errors.Is(errApprove, memory.ErrDraftNotFound) {
		t.Errorf("Ekspektasi ErrUnauthorizedAccess atau ErrDraftNotFound pada cross-tenant ApproveDraft, dapat: %v", errApprove)
	}

	// 8. Admin Alpha yang sah menyetujui Draft Alpha
	approvedMem, errApproveAlpha := svc.ApproveDraft(ctxAlpha, draftID, adminAlpha, false)
	if errApproveAlpha != nil {
		t.Fatalf("Admin Alpha harusnya berhasil meng-approve draft: %v", errApproveAlpha)
	}
	if approvedMem.TenantID != "tenant_alpha" {
		t.Errorf("Ekspektasi approvedMem.TenantID 'tenant_alpha', dapat '%s'", approvedMem.TenantID)
	}
}

// TestMemoryTenantIsolation_MemoryRetrievalScoping menguji proteksi pembacaan arsip memori terpublikasi.
func TestMemoryTenantIsolation_MemoryRetrievalScoping(t *testing.T) {
	_, memStore, cleanup := setupIsolationTestDB(t)
	defer cleanup()

	repo := memoryinfra.NewSQLMemoryRepository(memStore)

	ctxAlpha := tenantshared.WithTenant(context.Background(), "tenant_alpha")
	ctxBeta := tenantshared.WithTenant(context.Background(), "tenant_beta")

	groupAlphaID := "grp_alpha_02"
	adminAlpha := "usr_admin_alpha"
	userBeta := "usr_member_beta"

	accessCheck := &mockAccessCheckerForIsolation{
		groupDetails: map[string]*store.GroupDetails{
			groupAlphaID: {ID: groupAlphaID, Title: "Grup Alpha 2", TenantID: "tenant_alpha"},
		},
		roles: map[string]map[string]string{
			groupAlphaID: {
				adminAlpha: "admin",
				userBeta:   "member", // Sekalipun userBeta terdaftar dengan role di grup (skenario kebocoran ID grup), tenant context menolak
			},
		},
		members: make(map[string][]store.GroupMemberItem),
	}

	svc := memory.NewMemoryService(repo, nil, nil, accessCheck, nil)

	// Seed draft dan approve secara sah di Tenant Alpha
	draftID := "draft_alpha_pub"
	draft := &memory.MemoryDraft{
		ID:                    draftID,
		JobID:                 "job_alpha_pub",
		ContextID:             "forum_alpha_pub",
		ContextType:           memory.ContextTypeForum,
		ParentID:              groupAlphaID,
		TenantID:              "tenant_alpha",
		Status:                memory.DraftStatusDraft,
		MessageCountProcessed: 10,
		CreatedAt:             time.Now().UTC(),
	}
	artifacts := []memory.MemoryArtifact{
		{
			ID:                "art_alpha_pub_sum",
			DraftID:           draftID,
			Type:              memory.ArtifactTypeSummary,
			Content:           "Arsip Rahasia Alpha",
			AIOriginalContent: "Arsip Rahasia Alpha",
			Confidence:        memory.ConfidenceHigh,
		},
	}
	_ = repo.CreateDraftWithArtifacts(ctxAlpha, draft, artifacts)
	appMem, errApp := svc.ApproveDraft(ctxAlpha, draftID, adminAlpha, false)
	if errApp != nil {
		t.Fatalf("Gagal approve draft: %v", errApp)
	}

	// 1. User Beta mencoba membaca list memori grup Alpha
	_, errList := svc.GetGroupMemories(ctxBeta, groupAlphaID, userBeta, 10, 0)
	if !errors.Is(errList, memory.ErrUnauthorizedAccess) {
		t.Errorf("Ekspektasi ErrUnauthorizedAccess pada cross-tenant GetGroupMemories, dapat: %v", errList)
	}

	// 2. User Beta mencoba membuka detail approved memory milik Tenant Alpha
	_, errDetail := svc.GetApprovedMemoryDetail(ctxBeta, appMem.ID, userBeta)
	if !errors.Is(errDetail, memory.ErrUnauthorizedAccess) && !errors.Is(errDetail, memory.ErrApprovedMemoryNotFound) {
		t.Errorf("Ekspektasi ErrUnauthorizedAccess atau ErrApprovedMemoryNotFound pada cross-tenant GetApprovedMemoryDetail, dapat: %v", errDetail)
	}

	// 3. User Alpha yang sah membuka detail approved memory
	detailAlpha, errDetailAlpha := svc.GetApprovedMemoryDetail(ctxAlpha, appMem.ID, adminAlpha)
	if errDetailAlpha != nil {
		t.Fatalf("Admin Alpha harusnya berhasil membaca approved memory miliknya: %v", errDetailAlpha)
	}
	if detailAlpha.SnapshotSummary != "Arsip Rahasia Alpha" {
		t.Errorf("Konten ringkasan tidak sesuai: %s", detailAlpha.SnapshotSummary)
	}
}

// mockRepoBypassIsolation adalah mock yang sengaja tidak memfilter tenant (simulasi kebocoran data di level storage/cache).
type mockRepoBypassIsolation struct {
	memory.MemoryRepository
	draft *memory.MemoryDraft
	art   *memory.MemoryArtifact
	mem   *memory.ApprovedMemory
}

func (m *mockRepoBypassIsolation) CreateJob(ctx context.Context, contextID, parentID string) (*memory.MemoryJob, error) {
	return nil, nil
}
func (m *mockRepoBypassIsolation) GetJobByID(ctx context.Context, id string) (*memory.MemoryJob, error) {
	return nil, nil
}
func (m *mockRepoBypassIsolation) GetJobByContextID(ctx context.Context, contextID string) (*memory.MemoryJob, error) {
	return nil, nil
}
func (m *mockRepoBypassIsolation) ClaimJob(ctx context.Context, jobID string) (*memory.MemoryJob, error) {
	return nil, nil
}
func (m *mockRepoBypassIsolation) CompleteJob(ctx context.Context, jobID string, messageCount int) error {
	return nil
}
func (m *mockRepoBypassIsolation) FailJob(ctx context.Context, jobID, lastError string, isTerminal bool, nextRetry *time.Time) error {
	return nil
}
func (m *mockRepoBypassIsolation) CreateDraftWithArtifacts(ctx context.Context, draft *memory.MemoryDraft, artifacts []memory.MemoryArtifact) error {
	m.draft = draft
	return nil
}
func (m *mockRepoBypassIsolation) GetDraftByID(ctx context.Context, id string) (*memory.MemoryDraft, error) {
	return m.draft, nil
}
func (m *mockRepoBypassIsolation) GetDraftByContextID(ctx context.Context, contextID string) (*memory.MemoryDraft, error) {
	return m.draft, nil
}
func (m *mockRepoBypassIsolation) GetDraftsByParentID(ctx context.Context, parentID string, status string) ([]memory.MemoryDraft, error) {
	return []memory.MemoryDraft{*m.draft}, nil
}
func (m *mockRepoBypassIsolation) GetArtifactsByDraftID(ctx context.Context, draftID string) ([]memory.MemoryArtifact, error) {
	return []memory.MemoryArtifact{*m.art}, nil
}
func (m *mockRepoBypassIsolation) GetArtifactByID(ctx context.Context, id string) (*memory.MemoryArtifact, error) {
	return m.art, nil
}
func (m *mockRepoBypassIsolation) UpdateArtifact(ctx context.Context, artifactID string, content string, isHumanEdited bool) error {
	return nil
}
func (m *mockRepoBypassIsolation) RemoveJourneyLite(ctx context.Context, draftID string) error {
	return nil
}
func (m *mockRepoBypassIsolation) ApproveDraft(ctx context.Context, draftID, adminID string, approvedMemory *memory.ApprovedMemory, reviewAction *memory.MemoryReviewAction) error {
	m.mem = approvedMemory
	return nil
}
func (m *mockRepoBypassIsolation) RejectDraft(ctx context.Context, draftID, adminID, reason string) error {
	return nil
}
func (m *mockRepoBypassIsolation) RecordReviewAction(ctx context.Context, action *memory.MemoryReviewAction) error {
	return nil
}
func (m *mockRepoBypassIsolation) GetReviewActions(ctx context.Context, draftID string) ([]memory.MemoryReviewAction, error) {
	return nil, nil
}
func (m *mockRepoBypassIsolation) GetApprovedMemoryByID(ctx context.Context, id string) (*memory.ApprovedMemory, error) {
	return m.mem, nil
}
func (m *mockRepoBypassIsolation) GetApprovedMemoryByContextID(ctx context.Context, contextID string) (*memory.ApprovedMemory, error) {
	return m.mem, nil
}
func (m *mockRepoBypassIsolation) GetApprovedMemoriesByParentID(ctx context.Context, parentID string, limit, offset int) ([]memory.ApprovedMemory, error) {
	return []memory.ApprovedMemory{*m.mem}, nil
}
func (m *mockRepoBypassIsolation) RecordViewEvent(ctx context.Context, event *memory.MemoryViewEvent) error {
	return nil
}
func (m *mockRepoBypassIsolation) HasUserViewedMemory(ctx context.Context, memoryID, userID string) (bool, error) {
	return false, nil
}

// TestMemoryTenantIsolation_ServiceDefenseInDepth memverifikasi bahwa sekalipun repository mengembalikan data (bypassed),
// MemoryService tetap menolak aksi lintas tenant dengan ErrUnauthorizedAccess.
func TestMemoryTenantIsolation_ServiceDefenseInDepth(t *testing.T) {
	draft := &memory.MemoryDraft{
		ID:          "draft_alpha",
		ParentID:    "grp_alpha",
		TenantID:    "tenant_alpha",
		Status:      memory.DraftStatusDraft,
		ContextID:   "forum_alpha",
		ContextType: memory.ContextTypeForum,
	}
	art := &memory.MemoryArtifact{
		ID:      "art_1",
		DraftID: "draft_alpha",
		Content: "Summary",
		Type:    memory.ArtifactTypeSummary,
	}
	mem := &memory.ApprovedMemory{
		ID:          "mem_alpha",
		ParentID:    "grp_alpha",
		TenantID:    "tenant_alpha",
		ContextID:   "forum_alpha",
		ContextType: memory.ContextTypeForum,
	}

	bypassRepo := &mockRepoBypassIsolation{
		draft: draft,
		art:   art,
		mem:   mem,
	}

	accessCheck := &mockAccessCheckerForIsolation{
		groupDetails: map[string]*store.GroupDetails{
			"grp_alpha": {ID: "grp_alpha", TenantID: "tenant_alpha"},
		},
		roles: map[string]map[string]string{
			"grp_alpha": {"admin_user": "admin"},
		},
	}

	svc := memory.NewMemoryService(bypassRepo, nil, nil, accessCheck, nil)

	ctxBeta := tenantshared.WithTenant(context.Background(), "tenant_beta")

	// 1. GetDraftDetail
	_, _, errDetail := svc.GetDraftDetail(ctxBeta, "draft_alpha", "admin_user")
	if !errors.Is(errDetail, memory.ErrUnauthorizedAccess) {
		t.Errorf("Ekspektasi ErrUnauthorizedAccess pada GetDraftDetail, dapat: %v", errDetail)
	}

	// 2. UpdateArtifactContent
	_, errEdit := svc.UpdateArtifactContent(ctxBeta, "draft_alpha", "art_1", "New content", "admin_user")
	if !errors.Is(errEdit, memory.ErrUnauthorizedAccess) {
		t.Errorf("Ekspektasi ErrUnauthorizedAccess pada UpdateArtifactContent, dapat: %v", errEdit)
	}

	// 3. RemoveJourneyLite
	errRemove := svc.RemoveJourneyLite(ctxBeta, "draft_alpha", "admin_user")
	if !errors.Is(errRemove, memory.ErrUnauthorizedAccess) {
		t.Errorf("Ekspektasi ErrUnauthorizedAccess pada RemoveJourneyLite, dapat: %v", errRemove)
	}

	// 4. RejectDraft
	errReject := svc.RejectDraft(ctxBeta, "draft_alpha", "admin_user", "Reason")
	if !errors.Is(errReject, memory.ErrUnauthorizedAccess) {
		t.Errorf("Ekspektasi ErrUnauthorizedAccess pada RejectDraft, dapat: %v", errReject)
	}

	// 5. ApproveDraft
	_, errApprove := svc.ApproveDraft(ctxBeta, "draft_alpha", "admin_user", false)
	if !errors.Is(errApprove, memory.ErrUnauthorizedAccess) {
		t.Errorf("Ekspektasi ErrUnauthorizedAccess pada ApproveDraft, dapat: %v", errApprove)
	}

	// 6. GetApprovedMemoryDetail
	_, errMemDetail := svc.GetApprovedMemoryDetail(ctxBeta, "mem_alpha", "admin_user")
	if !errors.Is(errMemDetail, memory.ErrUnauthorizedAccess) {
		t.Errorf("Ekspektasi ErrUnauthorizedAccess pada GetApprovedMemoryDetail, dapat: %v", errMemDetail)
	}
}

// mockGroupRepoForContextSource mendukung pengujian ForumContextSource.
type mockGroupRepoForContextSource struct {
	group.GroupRepository
	details map[string]*store.GroupDetails
	roles   map[string]map[string]string
}

func (m *mockGroupRepoForContextSource) GetGroupDetails(conversationID, currentUserID string) (*store.GroupDetails, error) {
	if d, ok := m.details[conversationID]; ok {
		return d, nil
	}
	return nil, errors.New("grup tidak ditemukan")
}

func (m *mockGroupRepoForContextSource) GetUserRoleInGroup(conversationID, userID string) (string, error) {
	if rMap, ok := m.roles[conversationID]; ok {
		if r, okR := rMap[userID]; okR {
			return r, nil
		}
	}
	return "", errors.New("bukan anggota")
}

func (m *mockGroupRepoForContextSource) IsParentMember(parentID, userID string) (bool, error) {
	if rMap, ok := m.roles[parentID]; ok {
		_, okR := rMap[userID]
		return okR, nil
	}
	return false, nil
}

func (m *mockGroupRepoForContextSource) GetSubGroupAdmins(subGroupID string) ([]string, error) {
	return []string{"usr_sub_admin"}, nil
}

// TestMemoryTenantIsolation_ContextSource menguji isolasi pada ContextSource (GetMessages, GetContextMeta, GetAuthorizedViewers).
func TestMemoryTenantIsolation_ContextSource(t *testing.T) {
	msgStore, _, cleanup := setupIsolationTestDB(t)
	defer cleanup()

	ctxAlpha := tenantshared.WithTenant(context.Background(), "tenant_alpha")
	ctxBeta := tenantshared.WithTenant(context.Background(), "tenant_beta")

	subGroupID := "sub_forum_alpha"
	parentGroupID := "grp_parent_alpha"

	// Simpan pesan forum
	_ = msgStore.Save(store.StoredMessage{
		ID:        "msg_01",
		RoomID:    subGroupID,
		FromID:    "usr_alice",
		Nickname:  "Alice",
		ToID:      subGroupID,
		Content:   "Pesan rahasia internal Alpha",
		Timestamp: time.Now().UTC(),
	})

	groupRepoMock := &mockGroupRepoForContextSource{
		details: map[string]*store.GroupDetails{
			subGroupID: {
				ID:        subGroupID,
				ParentID:  parentGroupID,
				Title:     "Forum Arsitektur Alpha",
				TenantID:  "tenant_alpha",
				CreatedBy: "usr_alice",
			},
			parentGroupID: {
				ID:       parentGroupID,
				Title:    "Divisi Engineering Alpha",
				TenantID: "tenant_alpha",
			},
		},
		roles: map[string]map[string]string{
			subGroupID:    {"usr_alice": "creator"},
			parentGroupID: {"usr_alice": "creator"},
		},
	}

	cSource := groupinfra.NewForumContextSource(groupRepoMock, msgStore)

	// 1. Tenant Beta memanggil GetMessages untuk forum Tenant Alpha
	_, errMsgs := cSource.GetMessages(ctxBeta, subGroupID, 50)
	if !errors.Is(errMsgs, memory.ErrUnauthorizedAccess) {
		t.Errorf("Ekspektasi ErrUnauthorizedAccess pada GetMessages cross-tenant, dapat: %v", errMsgs)
	}

	// 2. Tenant Alpha memanggil GetMessages
	msgsAlpha, errMsgsAlpha := cSource.GetMessages(ctxAlpha, subGroupID, 50)
	if errMsgsAlpha != nil {
		t.Fatalf("Tenant Alpha harusnya sukses GetMessages: %v", errMsgsAlpha)
	}
	if len(msgsAlpha) != 1 {
		t.Errorf("Ekspektasi 1 pesan terambil, dapat: %d", len(msgsAlpha))
	}

	// 3. Tenant Beta memanggil GetContextMeta
	_, errMetaBeta := cSource.GetContextMeta(ctxBeta, subGroupID)
	if !errors.Is(errMetaBeta, memory.ErrUnauthorizedAccess) {
		t.Errorf("Ekspektasi ErrUnauthorizedAccess pada GetContextMeta cross-tenant, dapat: %v", errMetaBeta)
	}

	// 4. Tenant Alpha memanggil GetContextMeta
	metaAlpha, errMetaAlpha := cSource.GetContextMeta(ctxAlpha, subGroupID)
	if errMetaAlpha != nil {
		t.Fatalf("Tenant Alpha harusnya sukses GetContextMeta: %v", errMetaAlpha)
	}
	if metaAlpha.Title != "Forum Arsitektur Alpha" {
		t.Errorf("Title meta tidak sesuai: %s", metaAlpha.Title)
	}

	// 5. Tenant Beta memanggil GetAuthorizedViewers
	isAuthBeta, errAuthBeta := cSource.GetAuthorizedViewers(ctxBeta, subGroupID, "usr_alice")
	if errAuthBeta != nil {
		t.Fatalf("GetAuthorizedViewers error: %v", errAuthBeta)
	}
	if isAuthBeta {
		t.Errorf("User di context Tenant Beta tidak boleh authorized pada forum Tenant Alpha")
	}

	// 6. Tenant Alpha memanggil GetAuthorizedViewers
	isAuthAlpha, errAuthAlpha := cSource.GetAuthorizedViewers(ctxAlpha, subGroupID, "usr_alice")
	if errAuthAlpha != nil {
		t.Fatalf("GetAuthorizedViewers error: %v", errAuthAlpha)
	}
	if !isAuthAlpha {
		t.Errorf("usr_alice harusnya authorized pada forum Alpha")
	}
}
