package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/bms-del112/wuzz-chat/internal/auth"
	"github.com/bms-del112/wuzz-chat/internal/store"
	"github.com/bms-del112/wuzz-chat/internal/ws"
)

type GroupHandler struct {
	groupStore store.GroupStore
	userStore  store.UserStore
	hub        *ws.Hub
}

func NewGroupHandler(gs store.GroupStore, us store.UserStore) *GroupHandler {
	return &GroupHandler{
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

	req.Title = strings.TrimSpace(req.Title)
	if req.Title == "" {
		http.Error(w, `{"error":"Nama grup wajib diisi"}`, http.StatusBadRequest)
		return
	}
	if len(req.Title) > 128 {
		http.Error(w, `{"error":"Nama grup maksimal 128 karakter"}`, http.StatusBadRequest)
		return
	}

	group, err := h.groupStore.CreateGroup(
		req.Title, req.Description, req.AvatarURL,
		claims.UserID, req.GroupUsername, req.IsPublic, req.MemberIDs,
	)
	if err != nil {
		if errors.Is(err, store.ErrGroupUsernameTaken) {
			writeGroupJSONError(w, http.StatusConflict, "Username grup sudah digunakan oleh grup lain")
			return
		}
		writeGroupJSONError(w, http.StatusInternalServerError, "Gagal membuat grup: "+err.Error())
		return
	}

	// Ambil daftar lengkap anggota untuk di-return
	if members, err := h.groupStore.GetGroupMembers(group.ID); err == nil {
		group.Members = members
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"group":   group,
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
	limitStr := r.URL.Query().Get("limit")
	limit := 20
	if limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 && l <= 50 {
			limit = l
		}
	}

	groups, err := h.groupStore.SearchPublicGroups(query, limit)
	if err != nil {
		http.Error(w, `{"error":"Gagal mencari grup publik"}`, http.StatusInternalServerError)
		return
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

	http.NotFound(w, r)
}

func (h *GroupHandler) handleGetGroup(w http.ResponseWriter, currentUserID, groupID string) {
	group, err := h.groupStore.GetGroupDetails(groupID, currentUserID)
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

	// Ambil members jika user adalah anggota atau grup bersifat publik
	if group.MyRole != "" || group.IsPublic {
		if members, err := h.groupStore.GetGroupMembers(groupID); err == nil {
			group.Members = members
		}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(group)
}

func (h *GroupHandler) handleJoinGroup(w http.ResponseWriter, currentUserID, groupID string) {
	// Jika grup ini adalah subgrup, gunakan JoinSubGroup dengan Parent-Membership Gate
	if strings.HasPrefix(groupID, "sub_") {
		err := h.groupStore.JoinSubGroup(groupID, currentUserID)
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

		if h.hub != nil {
			h.hub.BroadcastRoomUsers(groupID)
			actorName := h.resolveDisplayName(currentUserID)
			h.hub.BroadcastGroupSystemEvent(groupID, "group_member_joined",
				fmt.Sprintf("%s telah bergabung ke subgrup", actorName))
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
			"message": "Berhasil bergabung ke subgrup",
		})
		return
	}

	err := h.groupStore.JoinPublicGroup(groupID, currentUserID)
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

	// Broadcast presence update + system event via Hub
	if h.hub != nil {
		h.hub.BroadcastRoomUsers(groupID)
		actorName := h.resolveDisplayName(currentUserID)
		h.hub.BroadcastGroupSystemEvent(groupID, "group_member_joined",
			fmt.Sprintf("%s telah bergabung ke grup", actorName))
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Berhasil bergabung ke grup",
	})
}

func (h *GroupHandler) handleGetMembers(w http.ResponseWriter, currentUserID, groupID string) {
	// Verifikasi akses
	role, err := h.groupStore.GetUserRoleInGroup(groupID, currentUserID)
	if err != nil || role == "" {
		// Cek apakah grup publik
		if g, err := h.groupStore.GetGroupDetails(groupID, currentUserID); err != nil || !g.IsPublic {
			http.Error(w, `{"error":"Anda bukan anggota grup ini"}`, http.StatusForbidden)
			return
		}
	}

	members, err := h.groupStore.GetGroupMembers(groupID)
	if err != nil {
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

	err := h.groupStore.AddGroupMembers(groupID, currentUserID, req.MemberIDs)
	if err != nil {
		if errors.Is(err, store.ErrUnauthorizedGroup) {
			writeGroupJSONError(w, http.StatusForbidden, "Hanya Admin atau Creator yang dapat menambahkan anggota")
			return
		}
		writeGroupJSONError(w, http.StatusInternalServerError, "Gagal menambahkan anggota: "+err.Error())
		return
	}

	if h.hub != nil {
		h.hub.BroadcastRoomUsers(groupID)
		actorName := h.resolveDisplayName(currentUserID)
		for _, memberID := range req.MemberIDs {
			targetName := h.resolveDisplayName(memberID)
			h.hub.BroadcastGroupSystemEvent(groupID, "group_member_joined",
				fmt.Sprintf("%s menambahkan %s ke grup", actorName, targetName))
		}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Anggota berhasil ditambahkan",
	})
}

func (h *GroupHandler) handleRemoveMember(w http.ResponseWriter, currentUserID, groupID, targetUserID string) {
	err := h.groupStore.RemoveGroupMember(groupID, currentUserID, targetUserID)
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

	if h.hub != nil {
		h.hub.BroadcastRoomUsers(groupID)
		var eventText string
		if currentUserID == targetUserID {
			actorName := h.resolveDisplayName(currentUserID)
			eventText = fmt.Sprintf("%s telah keluar dari grup", actorName)
		} else {
			actorName := h.resolveDisplayName(currentUserID)
			targetName := h.resolveDisplayName(targetUserID)
			eventText = fmt.Sprintf("%s mengeluarkan %s dari grup", actorName, targetName)
		}
		h.hub.BroadcastGroupSystemEvent(groupID, "group_member_removed", eventText)
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

	err := h.groupStore.UpdateMemberRole(groupID, currentUserID, targetUserID, req.Role)
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

	if h.hub != nil {
		actorName := h.resolveDisplayName(currentUserID)
		targetName := h.resolveDisplayName(targetUserID)
		var roleLabel string
		switch req.Role {
		case "admin":
			roleLabel = "Admin"
		case "member":
			roleLabel = "Anggota"
		default:
			roleLabel = req.Role
		}
		h.hub.BroadcastGroupSystemEvent(groupID, "group_role_updated",
			fmt.Sprintf("%s mengangkat %s menjadi %s", actorName, targetName, roleLabel))
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

	err := h.groupStore.UpdateGroupInfo(groupID, currentUserID, req.Title, req.Description, req.AvatarURL, req.IsPublic, req.GroupUsername)
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

	if h.hub != nil {
		actorName := h.resolveDisplayName(currentUserID)
		h.hub.BroadcastGroupSystemEvent(groupID, "group_info_updated",
			fmt.Sprintf("%s memperbarui info grup", actorName))
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
	subgroups, err := h.groupStore.GetActiveSubGroups(parentID, currentUserID)
	if err != nil {
		if errors.Is(err, store.ErrUnauthorizedGroup) {
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

	// Validasi bahwa pembuat adalah admin atau pembuat grup induk
	role, err := h.groupStore.GetUserRoleInGroup(parentID, currentUserID)
	if err != nil || (role != "creator" && role != "admin") {
		writeGroupJSONError(w, http.StatusForbidden, "Akses ditolak: Hanya admin atau pembuat grup yang dapat membuat topik forum")
		return
	}

	subgroup, err := h.groupStore.CreateSubGroup(parentID, req.Title, req.Description, currentUserID, req.Duration, isPublic)
	if err != nil {
		if errors.Is(err, store.ErrUnauthorizedGroup) {
			writeGroupJSONError(w, http.StatusForbidden, "Akses ditolak: Hanya admin atau pembuat grup yang dapat membuat topik forum")
			return
		}
		writeGroupJSONError(w, http.StatusBadRequest, "Gagal membuat subgrup: "+err.Error())
		return
	}

	// Broadcast notifikasi pembuatan subgrup baru ke grup induk
	if h.hub != nil {
		actorName := h.resolveDisplayName(currentUserID)
		h.hub.BroadcastGroupSystemEvent(parentID, "subgroup_created",
			fmt.Sprintf("%s telah membuat topik subgrup baru: '%s'", actorName, subgroup.Title))
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

	err := h.groupStore.RequestToJoinSubGroup(groupID, currentUserID)
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
		writeGroupJSONError(w, http.StatusBadRequest, "Permohonan bergabung hanya berlaku untuk subgrup")
		return
	}

	requests, err := h.groupStore.GetPendingJoinRequests(groupID, currentUserID)
	if err != nil {
		if errors.Is(err, store.ErrGroupNotFound) {
			http.Error(w, `{"error":"Subgrup tidak ditemukan"}`, http.StatusNotFound)
			return
		}
		if errors.Is(err, store.ErrUnauthorizedGroup) {
			writeGroupJSONError(w, http.StatusForbidden, "Akses ditolak: Hanya admin/creator yang dapat melihat permohonan")
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

// handleRespondJoinRequest memproses persetujuan (approve) atau penolakan (reject) permohonan bergabung subgrup.
func (h *GroupHandler) handleRespondJoinRequest(w http.ResponseWriter, r *http.Request, currentUserID, groupID, requestID string) {
	if !strings.HasPrefix(groupID, "sub_") {
		writeGroupJSONError(w, http.StatusBadRequest, "Permohonan bergabung hanya berlaku untuk subgrup")
		return
	}

	var req struct {
		Approve bool `json:"approve"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"Payload tidak valid"}`, http.StatusBadRequest)
		return
	}

	err := h.groupStore.RespondJoinRequest(groupID, requestID, currentUserID, req.Approve)
	if err != nil {
		if errors.Is(err, store.ErrGroupNotFound) {
			http.Error(w, `{"error":"Subgrup tidak ditemukan"}`, http.StatusNotFound)
			return
		}
		if errors.Is(err, store.ErrUnauthorizedGroup) {
			writeGroupJSONError(w, http.StatusForbidden, "Akses ditolak: Anda tidak memiliki wewenang untuk meninjau permohonan ini")
			return
		}
		writeGroupJSONError(w, http.StatusBadRequest, err.Error())
		return
	}

	// Jika disetujui, update kehadiran room users
	if req.Approve && h.hub != nil {
		h.hub.BroadcastRoomUsers(groupID)
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": fmt.Sprintf("Permohonan berhasil %s", map[bool]string{true: "disetujui", false: "ditolak"}[req.Approve]),
	})
}


