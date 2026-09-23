package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/bms-del112/wuzz-chat/internal/auth"
	"github.com/bms-del112/wuzz-chat/internal/group"
	groupinfra "github.com/bms-del112/wuzz-chat/internal/group/infra"
	"github.com/bms-del112/wuzz-chat/internal/push"
	"github.com/bms-del112/wuzz-chat/internal/store"
	"github.com/bms-del112/wuzz-chat/internal/ws"
)

// GroupHandler adalah thin HTTP transport layer untuk grup persisten dan subgrup/forum ephemeral.
type GroupHandler struct {
	groupSvc      *group.GroupService
	forumSvc      *group.ForumService
	groupStore    store.GroupStore
	userStore     store.UserStore
	hub           *ws.Hub
	pushService   *push.Service
	memoryHandler *MemoryHandler
}

// NewGroupHandler membuat instance baru GroupHandler dengan adapter service internal (backward-compatible).
func NewGroupHandler(gs store.GroupStore, us store.UserStore) *GroupHandler {
	repo := groupinfra.NewSQLGroupRepository(gs, us)
	groupSvc := group.NewGroupService(repo, repo, nil, nil)
	forumSvc := group.NewForumService(repo, repo, nil, nil, nil)
	return &GroupHandler{
		groupSvc:   groupSvc,
		forumSvc:   forumSvc,
		groupStore: gs,
		userStore:  us,
	}
}

// NewGroupHandlerWithServices membuat instance GroupHandler dengan Application Services yang diinjeksi dari luar.
func NewGroupHandlerWithServices(groupSvc *group.GroupService, forumSvc *group.ForumService, gs store.GroupStore, us store.UserStore) *GroupHandler {
	if groupSvc == nil || forumSvc == nil {
		repo := groupinfra.NewSQLGroupRepository(gs, us)
		if groupSvc == nil {
			groupSvc = group.NewGroupService(repo, repo, nil, nil)
		}
		if forumSvc == nil {
			forumSvc = group.NewForumService(repo, repo, nil, nil, nil)
		}
	}
	return &GroupHandler{
		groupSvc:   groupSvc,
		forumSvc:   forumSvc,
		groupStore: gs,
		userStore:  us,
	}
}

func writeGroupJSONError(w http.ResponseWriter, code int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": message})
}

func (h *GroupHandler) SetHub(hub *ws.Hub) {
	h.hub = hub
	if h.groupSvc != nil {
		h.groupSvc.SetBroadcaster(hub)
	}
	if h.forumSvc != nil {
		h.forumSvc.SetBroadcaster(hub)
	}
}

func (h *GroupHandler) SetPushService(ps *push.Service) {
	h.pushService = ps
	if h.groupSvc != nil {
		h.groupSvc.SetNotifier(ps)
	}
	if h.forumSvc != nil {
		h.forumSvc.SetNotifier(ps)
	}
}

func (h *GroupHandler) SetMemoryHandler(mh *MemoryHandler) {
	h.memoryHandler = mh
	if h.forumSvc != nil && mh != nil {
		h.forumSvc.SetMemoryStore(mh.memoryStore)
	}
}

// CreateGroup menangani POST /api/groups
func (h *GroupHandler) CreateGroup(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.GetUserFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req struct {
		Title         string   `json:"title"`
		Description   string   `json:"description"`
		AvatarURL     string   `json:"avatar_url"`
		IsPublic      bool     `json:"is_public"`
		GroupUsername string   `json:"group_username"`
		MemberIDs     []string `json:"member_ids"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"Payload tidak valid"}`, http.StatusBadRequest)
		return
	}

	grp, err := h.groupSvc.CreateGroup(r.Context(), group.CreateGroupInput{
		Title:         req.Title,
		Description:   req.Description,
		AvatarURL:     req.AvatarURL,
		CreatorID:     claims.UserID,
		GroupUsername: req.GroupUsername,
		IsPublic:      req.IsPublic,
		MemberIDs:     req.MemberIDs,
	})
	if err != nil {
		if errors.Is(err, group.ErrEmptyTitle) {
			http.Error(w, `{"error":"Nama grup wajib diisi"}`, http.StatusBadRequest)
			return
		}
		if errors.Is(err, group.ErrTitleTooLong) {
			http.Error(w, `{"error":"Nama grup maksimal 128 karakter"}`, http.StatusBadRequest)
			return
		}
		if errors.Is(err, store.ErrGroupUsernameTaken) {
			writeGroupJSONError(w, http.StatusConflict, "Username grup sudah digunakan oleh grup lain")
			return
		}
		writeGroupJSONError(w, http.StatusInternalServerError, "Gagal membuat grup: "+err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"group":   grp,
	})
}

// SearchPublicGroups menangani GET /api/groups/search?q=...
func (h *GroupHandler) SearchPublicGroups(w http.ResponseWriter, r *http.Request) {
	_, ok := auth.GetUserFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	query := strings.TrimSpace(r.URL.Query().Get("q"))
	limit := 20
	if l := r.URL.Query().Get("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 && parsed <= 50 {
			limit = parsed
		}
	}

	groups, err := h.groupSvc.SearchPublicGroups(r.Context(), query, limit)
	if err != nil {
		writeGroupJSONError(w, http.StatusInternalServerError, "Gagal mencari grup: "+err.Error())
		return
	}
	if groups == nil {
		groups = []group.GroupDetails{}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(groups)
}


// RouteGroupRequest mendispatch sub-path /api/groups/...
func (h *GroupHandler) RouteGroupRequest(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.GetUserFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	// Path parsing: /api/groups/{id} atau /api/groups/{id}/{action}...
	path := strings.TrimPrefix(r.URL.Path, "/api/groups/")
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) == 0 || parts[0] == "" {
		http.NotFound(w, r)
		return
	}

	groupID := parts[0]

	// 1. /api/groups/{id}
	if len(parts) == 1 {
		switch r.Method {
		case http.MethodGet:
			h.handleGetGroup(w, claims.UserID, groupID)
		case http.MethodPatch:
			h.handleUpdateGroup(w, r, claims.UserID, groupID)
		default:
			http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
		}
		return
	}

	// 2. /api/groups/{id}/subgroups
	if len(parts) == 2 && parts[1] == "subgroups" {
		switch r.Method {
		case http.MethodGet:
			h.handleGetSubGroups(w, claims.UserID, groupID)
		case http.MethodPost:
			h.handleCreateSubGroup(w, r, claims.UserID, groupID)
		default:
			http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
		}
		return
	}

	// 2b. /api/groups/{id}/subgroups/{subId}/expire (Instant Expiry Bypass untuk testing & admin force-close)
	if len(parts) == 4 && parts[1] == "subgroups" && parts[3] == "expire" {
		subID := parts[2]
		if r.Method == http.MethodPost {
			h.handleInstantExpireSubGroup(w, claims.UserID, groupID, subID)
		} else {
			http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
		}
		return
	}

	// 3. /api/groups/{id}/join
	if len(parts) == 2 && parts[1] == "join" {
		if r.Method == http.MethodPost {
			h.handleJoinGroup(w, claims.UserID, groupID)
		} else {
			http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
		}
		return
	}

	// 4. /api/groups/{id}/members
	if len(parts) == 2 && parts[1] == "members" {
		switch r.Method {
		case http.MethodGet:
			h.handleGetMembers(w, claims.UserID, groupID)
		case http.MethodPost:
			h.handleAddMembers(w, r, claims.UserID, groupID)
		default:
			http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
		}
		return
	}

	// 5. /api/groups/{id}/members/{userId}
	if len(parts) == 3 && parts[1] == "members" {
		targetUserID := parts[2]
		if r.Method == http.MethodDelete {
			h.handleRemoveMember(w, claims.UserID, groupID, targetUserID)
		} else {
			http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
		}
		return
	}

	// 6. /api/groups/{id}/members/{userId}/role
	if len(parts) == 4 && parts[1] == "members" && parts[3] == "role" {
		targetUserID := parts[2]
		if r.Method == http.MethodPatch {
			h.handleUpdateRole(w, r, claims.UserID, groupID, targetUserID)
		} else {
			http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
		}
		return
	}

	// 7. /api/groups/{id}/join-request
	if len(parts) == 2 && parts[1] == "join-request" {
		if r.Method == http.MethodPost {
			h.handleRequestToJoinSubGroup(w, claims.UserID, groupID)
		} else {
			http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
		}
		return
	}

	// 8. /api/groups/{id}/join-requests
	if len(parts) == 2 && parts[1] == "join-requests" {
		if r.Method == http.MethodGet {
			h.handleGetJoinRequests(w, claims.UserID, groupID)
		} else {
			http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
		}
		return
	}

	// 9. /api/groups/{id}/join-requests/{requestId}/action
	if len(parts) == 4 && parts[1] == "join-requests" && parts[3] == "action" {
		targetRequestID := parts[2]
		if r.Method == http.MethodPost {
			h.handleRespondJoinRequest(w, r, claims.UserID, groupID, targetRequestID)
		} else {
			http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
		}
		return
	}

	// 10. /api/groups/{id}/memories (Member Knowledge List)
	if len(parts) == 2 && parts[1] == "memories" {
		if r.Method == http.MethodGet {
			if h.memoryHandler != nil {
				h.memoryHandler.HandleGetGroupMemories(w, r, claims.UserID, groupID)
			} else {
				http.Error(w, `{"error":"Memory service not available"}`, http.StatusServiceUnavailable)
			}
		} else {
			http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
		}
		return
	}

	http.NotFound(w, r)
}

func (h *GroupHandler) handleGetGroup(w http.ResponseWriter, currentUserID, groupID string) {
	grp, err := h.groupSvc.GetGroupDetails(context.Background(), groupID, currentUserID)
	if err != nil {
		if errors.Is(err, store.ErrGroupNotFound) {
			http.Error(w, `{"error":"Grup tidak ditemukan"}`, http.StatusNotFound)
			return
		}
		if errors.Is(err, store.ErrUnauthorizedGroup) {
			http.Error(w, `{"error":"Akses ditolak: Anda bukan anggota grup ini"}`, http.StatusForbidden)
			return
		}
		http.Error(w, `{"error":"Gagal memuat grup"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(grp)
}

func (h *GroupHandler) handleJoinGroup(w http.ResponseWriter, currentUserID, groupID string) {
	// Jika grup ini adalah subgrup, gunakan JoinSubGroup
	if strings.HasPrefix(groupID, "sub_") {
		err := h.forumSvc.JoinSubGroup(context.Background(), groupID, currentUserID)
		if err != nil {
			if errors.Is(err, store.ErrGroupNotFound) {
				http.Error(w, `{"error":"Subgrup tidak ditemukan"}`, http.StatusNotFound)
				return
			}
			if errors.Is(err, store.ErrUnauthorizedGroup) {
				writeGroupJSONError(w, http.StatusForbidden, "Akses ditolak: Anda harus menjadi anggota grup utama terlebih dahulu")
				return
			}
			if errors.Is(err, store.ErrAlreadyGroupMember) {
				writeGroupJSONError(w, http.StatusConflict, "Anda sudah menjadi anggota subgrup ini")
				return
			}
			writeGroupJSONError(w, http.StatusBadRequest, err.Error())
			return
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
			"message": "Berhasil bergabung ke subgrup",
		})
		return
	}

	err := h.groupSvc.JoinPublicGroup(context.Background(), groupID, currentUserID)
	if err != nil {
		if errors.Is(err, store.ErrGroupNotFound) {
			http.Error(w, `{"error":"Grup tidak ditemukan"}`, http.StatusNotFound)
			return
		}
		if errors.Is(err, store.ErrNotPublicGroup) {
			http.Error(w, `{"error":"Grup ini adalah grup privat dan tidak dapat dimasuki langsung"}`, http.StatusForbidden)
			return
		}
		if errors.Is(err, store.ErrAlreadyGroupMember) {
			http.Error(w, `{"error":"Anda sudah menjadi anggota grup ini"}`, http.StatusConflict)
			return
		}
		http.Error(w, `{"error":"Gagal bergabung ke grup"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Berhasil bergabung ke grup",
	})
}

func (h *GroupHandler) handleGetMembers(w http.ResponseWriter, currentUserID, groupID string) {
	members, err := h.groupSvc.GetGroupMembers(context.Background(), groupID, currentUserID)
	if err != nil {
		if errors.Is(err, store.ErrUnauthorizedGroup) {
			http.Error(w, `{"error":"Anda bukan anggota grup ini"}`, http.StatusForbidden)
			return
		}
		http.Error(w, `{"error":"Gagal mengambil daftar anggota"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(members)
}

func (h *GroupHandler) handleAddMembers(w http.ResponseWriter, r *http.Request, currentUserID, groupID string) {
	var req struct {
		MemberIDs []string `json:"member_ids"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || len(req.MemberIDs) == 0 {
		http.Error(w, `{"error":"Daftar member_ids tidak valid"}`, http.StatusBadRequest)
		return
	}

	err := h.groupSvc.AddGroupMembers(r.Context(), group.AddMembersInput{
		ConversationID: groupID,
		ActorUserID:    currentUserID,
		UserIDs:        req.MemberIDs,
	})
	if err != nil {
		if errors.Is(err, store.ErrUnauthorizedGroup) {
			writeGroupJSONError(w, http.StatusForbidden, "Hanya Admin atau Creator yang dapat menambahkan anggota")
			return
		}
		writeGroupJSONError(w, http.StatusInternalServerError, "Gagal menambahkan anggota: "+err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Anggota berhasil ditambahkan",
	})
}

func (h *GroupHandler) handleRemoveMember(w http.ResponseWriter, currentUserID, groupID, targetUserID string) {
	err := h.groupSvc.RemoveGroupMember(context.Background(), group.RemoveMemberInput{
		ConversationID: groupID,
		ActorUserID:    currentUserID,
		TargetUserID:   targetUserID,
	})
	if err != nil {
		if errors.Is(err, store.ErrUnauthorizedGroup) {
			writeGroupJSONError(w, http.StatusForbidden, "Hanya Admin atau Creator yang dapat mengeluarkan anggota")
			return
		}
		if errors.Is(err, store.ErrCannotKickCreator) {
			writeGroupJSONError(w, http.StatusForbidden, "Pembuat grup tidak dapat dikeluarkan")
			return
		}
		writeGroupJSONError(w, http.StatusBadRequest, "Gagal mengeluarkan anggota: "+err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Anggota berhasil dikeluarkan",
	})
}

func (h *GroupHandler) handleUpdateRole(w http.ResponseWriter, r *http.Request, currentUserID, groupID, targetUserID string) {
	var req struct {
		Role string `json:"role"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"Payload role tidak valid"}`, http.StatusBadRequest)
		return
	}

	err := h.groupSvc.UpdateMemberRole(r.Context(), group.UpdateMemberRoleInput{
		ConversationID: groupID,
		ActorUserID:    currentUserID,
		TargetUserID:   targetUserID,
		NewRole:        req.Role,
	})
	if err != nil {
		if errors.Is(err, store.ErrUnauthorizedGroup) {
			writeGroupJSONError(w, http.StatusForbidden, "Hanya Admin atau Creator yang dapat mengubah role")
			return
		}
		if errors.Is(err, store.ErrCannotDemoteCreator) {
			writeGroupJSONError(w, http.StatusForbidden, "Role pembuat grup tidak dapat diubah")
			return
		}
		writeGroupJSONError(w, http.StatusBadRequest, err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Role berhasil diperbarui",
	})
}

func (h *GroupHandler) handleUpdateGroup(w http.ResponseWriter, r *http.Request, currentUserID, groupID string) {
	var req struct {
		Title         string  `json:"title"`
		Description   string  `json:"description"`
		AvatarURL     string  `json:"avatar_url"`
		IsPublic      *bool   `json:"is_public"`
		GroupUsername *string `json:"group_username"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"Payload tidak valid"}`, http.StatusBadRequest)
		return
	}

	err := h.groupSvc.UpdateGroupInfo(r.Context(), group.UpdateGroupInput{
		ConversationID: groupID,
		ActorUserID:    currentUserID,
		Title:          req.Title,
		Description:    req.Description,
		AvatarURL:      req.AvatarURL,
		IsPublic:       req.IsPublic,
		GroupUsername:  req.GroupUsername,
	})
	if err != nil {
		if errors.Is(err, store.ErrUnauthorizedGroup) {
			writeGroupJSONError(w, http.StatusForbidden, "Hanya Admin atau Creator yang dapat memperbarui info grup")
			return
		}
		if errors.Is(err, store.ErrGroupUsernameTaken) {
			writeGroupJSONError(w, http.StatusConflict, "Username grup sudah digunakan oleh grup lain")
			return
		}
		writeGroupJSONError(w, http.StatusBadRequest, err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Info grup berhasil diperbarui",
	})
}

// resolveDisplayName mengambil display_name user dari store; fallback ke userID jika gagal.
func (h *GroupHandler) resolveDisplayName(userID string) string {
	if h.userStore == nil || userID == "" {
		return userID
	}
	profile, err := h.userStore.GetUserByID(userID)
	if err != nil || profile == nil {
		return userID
	}
	if profile.DisplayName != "" {
		return profile.DisplayName
	}
	if profile.Username != "" {
		return "@" + profile.Username
	}
	return userID
}

// handleGetSubGroups memuat daftar subgrup aktif di bawah grup induk.
func (h *GroupHandler) handleGetSubGroups(w http.ResponseWriter, currentUserID, parentID string) {
	subgroups, err := h.forumSvc.GetActiveSubGroups(context.Background(), parentID, currentUserID)
	if err != nil {
		if errors.Is(err, store.ErrUnauthorizedGroup) || errors.Is(err, group.ErrParentMemberOnly) {
			writeGroupJSONError(w, http.StatusForbidden, "Akses ditolak: Anda harus menjadi anggota grup utama terlebih dahulu")
			return
		}
		writeGroupJSONError(w, http.StatusInternalServerError, "Gagal memuat subgrup: "+err.Error())
		return
	}

	if subgroups == nil {
		subgroups = []store.SubGroupItem{}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success":   true,
		"subgroups": subgroups,
	})
}

// handleCreateSubGroup membuat subgrup topik baru di bawah grup induk.
func (h *GroupHandler) handleCreateSubGroup(w http.ResponseWriter, r *http.Request, currentUserID, parentID string) {
	var req struct {
		Title       string `json:"title"`
		Description string `json:"description"`
		Duration    string `json:"duration"` // "7_days" atau "30_days"
		IsPublic    *bool  `json:"is_public"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"Payload tidak valid"}`, http.StatusBadRequest)
		return
	}

	req.Title = strings.TrimSpace(req.Title)
	if req.Title == "" {
		writeGroupJSONError(w, http.StatusBadRequest, "Nama subgrup wajib diisi")
		return
	}
	if len([]rune(req.Title)) < 2 {
		writeGroupJSONError(w, http.StatusBadRequest, "Nama subgrup minimal 2 karakter")
		return
	}
	if len([]rune(req.Title)) > 128 {
		writeGroupJSONError(w, http.StatusBadRequest, "Nama subgrup maksimal 128 karakter")
		return
	}

	// Default is_public ke true jika tidak disertakan
	isPublic := true
	if req.IsPublic != nil {
		isPublic = *req.IsPublic
	}

	subgroup, err := h.forumSvc.CreateSubGroup(r.Context(), group.CreateSubGroupInput{
		ParentID:    parentID,
		Title:       req.Title,
		Description: req.Description,
		CreatorID:   currentUserID,
		Duration:    req.Duration,
		IsPublic:    isPublic,
	})
	if err != nil {
		if errors.Is(err, store.ErrUnauthorizedGroup) || errors.Is(err, group.ErrForbidden) || errors.Is(err, group.ErrParentMemberOnly) {
			writeGroupJSONError(w, http.StatusForbidden, "Akses ditolak: Hanya admin atau pembuat grup yang dapat membuat topik forum")
			return
		}
		writeGroupJSONError(w, http.StatusBadRequest, "Gagal membuat subgrup: "+err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success":  true,
		"subgroup": subgroup,
	})
}

// handleRequestToJoinSubGroup memproses permohonan anggota untuk bergabung ke subgrup privat.
func (h *GroupHandler) handleRequestToJoinSubGroup(w http.ResponseWriter, currentUserID, groupID string) {
	if !strings.HasPrefix(groupID, "sub_") {
		writeGroupJSONError(w, http.StatusBadRequest, "Permohonan bergabung hanya berlaku untuk subgrup")
		return
	}

	err := h.forumSvc.RequestToJoinSubGroup(context.Background(), groupID, currentUserID)
	if err != nil {
		if errors.Is(err, store.ErrGroupNotFound) {
			http.Error(w, `{"error":"Subgrup tidak ditemukan"}`, http.StatusNotFound)
			return
		}
		if errors.Is(err, store.ErrUnauthorizedGroup) {
			writeGroupJSONError(w, http.StatusForbidden, "Akses ditolak: Anda harus menjadi anggota grup utama terlebih dahulu")
			return
		}
		if errors.Is(err, store.ErrAlreadyGroupMember) {
			writeGroupJSONError(w, http.StatusConflict, "Anda sudah menjadi anggota subgrup ini")
			return
		}
		writeGroupJSONError(w, http.StatusBadRequest, err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Permohonan bergabung berhasil diajukan, menunggu persetujuan admin",
	})
}

// handleGetJoinRequests mengambil daftar seluruh permohonan bergabung subgrup yang masih pending.
func (h *GroupHandler) handleGetJoinRequests(w http.ResponseWriter, currentUserID, groupID string) {
	if !strings.HasPrefix(groupID, "sub_") {
		writeGroupJSONError(w, http.StatusBadRequest, "Fitur ini hanya untuk subgrup")
		return
	}

	requests, err := h.forumSvc.GetPendingJoinRequests(context.Background(), groupID, currentUserID)
	if err != nil {
		if errors.Is(err, store.ErrUnauthorizedGroup) {
			writeGroupJSONError(w, http.StatusForbidden, "Akses ditolak: Hanya admin subgrup yang dapat melihat permohonan")
			return
		}
		writeGroupJSONError(w, http.StatusInternalServerError, "Gagal memuat permohonan: "+err.Error())
		return
	}

	if requests == nil {
		requests = []store.JoinRequestItem{}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success":  true,
		"requests": requests,
	})
}

// handleRespondJoinRequest memproses persetujuan atau penolakan permohonan bergabung ke subgrup.
func (h *GroupHandler) handleRespondJoinRequest(w http.ResponseWriter, r *http.Request, currentUserID, groupID, requestID string) {
	if !strings.HasPrefix(groupID, "sub_") {
		writeGroupJSONError(w, http.StatusBadRequest, "Fitur ini hanya untuk subgrup")
		return
	}

	var req struct {
		Approve bool `json:"approve"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"Payload tidak valid"}`, http.StatusBadRequest)
		return
	}

	_, approved, err := h.forumSvc.RespondJoinRequest(r.Context(), group.RespondJoinRequestInput{
		SubGroupID:  groupID,
		RequestID:   requestID,
		AdminUserID: currentUserID,
		Approve:     req.Approve,
	})
	if err != nil {
		if errors.Is(err, store.ErrUnauthorizedGroup) {
			writeGroupJSONError(w, http.StatusForbidden, "Akses ditolak: Hanya admin subgrup yang dapat merespon permohonan")
			return
		}
		writeGroupJSONError(w, http.StatusBadRequest, "Gagal memproses permohonan: "+err.Error())
		return
	}

	actionText := "disetujui"
	if !approved {
		actionText = "ditolak"
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": fmt.Sprintf("Permohonan bergabung berhasil %s", actionText),
	})
}

// handleInstantExpireSubGroup memproses penghentian paksa subgrup sebelum TTL berakhir.
func (h *GroupHandler) handleInstantExpireSubGroup(w http.ResponseWriter, userID, groupID, subID string) {
	err := h.forumSvc.InstantExpireSubGroup(context.Background(), userID, groupID, subID)
	if err != nil {
		if errors.Is(err, group.ErrForbidden) || errors.Is(err, store.ErrUnauthorizedGroup) {
			writeGroupJSONError(w, http.StatusForbidden, "Akses ditolak: Hanya admin atau creator grup yang dapat melakukan instant expire")
			return
		}
		writeGroupJSONError(w, http.StatusInternalServerError, "Gagal melakukan instant expire: "+err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Topik forum berhasil di-expire seketika dan antrean memori telah dibuat.",
	})
}
