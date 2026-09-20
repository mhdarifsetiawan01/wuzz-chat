package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"

	"github.com/gorilla/websocket"
)

const baseURL = "http://localhost:8080"
const wsURL = "ws://localhost:8080/ws"

type AuthResponse struct {
	Token string `json:"token"`
	User  struct {
		ID       string `json:"id"`
		Username string `json:"username"`
	} `json:"user"`
	Error string `json:"error,omitempty"`
}

type GroupResponse struct {
	Group struct {
		ID    string `json:"id"`
		Title string `json:"title"`
	} `json:"group"`
	Error string `json:"error,omitempty"`
}

type SubGroupResponse struct {
	SubGroup struct {
		ID       string `json:"id"`
		Title    string `json:"title"`
		ParentID string `json:"parent_id"`
	} `json:"subgroup"`
	Error string `json:"error,omitempty"`
}

func main() {
	log.Println("🚀 [E2E Live Simulation] Memulai pengujian live tanpa browser...")

	// 1. Healthcheck backend
	resp, err := http.Get(baseURL + "/health")
	if err != nil {
		log.Fatalf("❌ Backend tidak aktif di %s: %v", baseURL, err)
	}
	resp.Body.Close()
	log.Println("✅ [1/9] Backend server aktif di http://localhost:8080")

	timestamp := time.Now().Unix()
	adminUsername := fmt.Sprintf("budi_inovasi%d", timestamp%10000)
	memberUsername := fmt.Sprintf("siti_anggota%d", timestamp%10000)

	// 2. Registrasi Admin
	adminAuth, err := registerOrLogin(adminUsername, "Budi Admin E2E", "SecretPassword123!")
	if err != nil {
		log.Fatalf("❌ Registrasi admin gagal: %v", err)
	}
	log.Printf("✅ [2/9] Admin berhasil login (ID: %s, User: %s)", adminAuth.User.ID, adminAuth.User.Username)

	// 3. Registrasi Member
	memberAuth, err := registerOrLogin(memberUsername, "Siti Member E2E", "SecretPassword123!")
	if err != nil {
		log.Fatalf("❌ Registrasi member gagal: %v", err)
	}
	log.Printf("✅ [3/9] Member berhasil login (ID: %s, User: %s)", memberAuth.User.ID, memberAuth.User.Username)

	// 4. Admin Buat Grup Utama
	groupPayload := map[string]interface{}{
		"title":          fmt.Sprintf("Komite Inovasi AI %d", timestamp%1000),
		"description":    "Grup untuk pengujian live Group Memory AI",
		"is_public":      true,
		"group_username": fmt.Sprintf("komite_ai_%d", timestamp%10000),
	}
	groupResp, err := postJSON(baseURL+"/api/groups", groupPayload, adminAuth.Token)
	if err != nil {
		log.Fatalf("❌ Gagal membuat grup: %v", err)
	}
	var grp GroupResponse
	_ = json.Unmarshal(groupResp, &grp)
	groupID := grp.Group.ID
	if groupID == "" {
		log.Fatalf("❌ Group ID kosong! Response: %s", string(groupResp))
	}
	log.Printf("✅ [4/9] Grup Utama berhasil dibuat (ID: %s, Title: %s)", groupID, grp.Group.Title)

	// Member gabung grup
	_, _ = postJSON(fmt.Sprintf("%s/api/groups/%s/join", baseURL, groupID), nil, memberAuth.Token)

	// 5. Admin Buat Forum / Subgrup
	subPayload := map[string]interface{}{
		"title":       "Rencana Arsitektur Group Memory AI",
		"description": "Diskusi finalisasi format ringkasan, butir keputusan, dan journey lite",
		"duration":    "7_days",
		"is_public":   true,
	}
	subResp, err := postJSON(fmt.Sprintf("%s/api/groups/%s/subgroups", baseURL, groupID), subPayload, adminAuth.Token)
	if err != nil {
		log.Fatalf("❌ Gagal membuat subgrup/forum: %v", err)
	}
	var subRes SubGroupResponse
	_ = json.Unmarshal(subResp, &subRes)
	subGroupID := subRes.SubGroup.ID
	if subGroupID == "" {
		log.Fatalf("❌ SubGroup ID kosong! Response: %s", string(subResp))
	}
	log.Printf("✅ [5/9] Forum/Subgrup berhasil dibuat (ID: %s, Title: %s)", subGroupID, subRes.SubGroup.Title)

	// Member gabung forum
	_, _ = postJSON(fmt.Sprintf("%s/api/groups/%s/join", baseURL, subGroupID), nil, memberAuth.Token)

	// 6. Hubungkan WebSocket & Kirim Diskusi Nyata
	log.Println("💬 [6/9] Menghubungkan WebSocket dan mengirim percakapan diskusi forum...")

	adminWS, err := connectWS(adminAuth.Token)
	if err != nil {
		log.Fatalf("❌ Gagal connect WS admin: %v", err)
	}
	defer adminWS.Close()

	memberWS, err := connectWS(memberAuth.Token)
	if err != nil {
		log.Fatalf("❌ Gagal connect WS member: %v", err)
	}
	defer memberWS.Close()

	// Join room
	_ = adminWS.WriteJSON(map[string]string{"type": "join", "room": subGroupID})
	_ = memberWS.WriteJSON(map[string]string{"type": "join", "room": subGroupID})
	time.Sleep(300 * time.Millisecond)

	// Kirim pesan-pesan diskusi
	messages := []struct {
		ws   *websocket.Conn
		name string
		text string
	}{
		{adminWS, "Budi (Admin)", "Rekan-rekan, mari kita sepakati format structured output untuk Group Memory AI."},
		{memberWS, "Siti (Member)", "Saya usulkan output mencakup ringkasan eksekutif, butir keputusan dengan bukti ID pesan, dan journey lite."},
		{adminWS, "Budi (Admin)", "Sangat setuju. Berapa tingkat confidence minimal yang harus dipertahankan oleh AI?"},
		{memberWS, "Siti (Member)", "Minimal confidence MEDIUM, namun untuk keputusan strategis harus mencapai HIGH."},
		{adminWS, "Budi (Admin)", "Sepakat! Keputusan final: rilis fitur ini pada 25 Oktober setelah review admin selesai."},
	}

	for i, m := range messages {
		chatMsg := map[string]interface{}{
			"type":    "message",
			"room":    subGroupID,
			"content": m.text,
		}
		if err := m.ws.WriteJSON(chatMsg); err != nil {
			log.Printf("⚠️ Gagal kirim pesan %d: %v", i+1, err)
		} else {
			log.Printf("   💬 [%s]: %s", m.name, m.text)
		}
		time.Sleep(350 * time.Millisecond)
	}

	// Tunggu komit database
	time.Sleep(1 * time.Second)

	// 7. Bypass Waktu Kedaluwarsa (Instant Expiry Bypass)
	log.Println("⚡ [7/9] Menjalankan Instant Expiry Bypass (POST /subgroups/{id}/expire)...")
	expireResp, err := postJSON(fmt.Sprintf("%s/api/groups/%s/subgroups/%s/expire", baseURL, groupID, subGroupID), nil, adminAuth.Token)
	if err != nil {
		log.Fatalf("❌ Gagal bypass expiry: %v", err)
	}
	log.Printf("🔒 Forum berhasil dikunci dan antrean AI dipicu! Response: %s", string(expireResp))

	// 8. Polling Draft Memori dari Groq AI
	log.Println("🧠 [8/9] Menunggu Groq AI (LPU Inference) memproses riwayat obrolan...")
	var draftID string
	var draftDetail map[string]interface{}

	for attempt := 1; attempt <= 15; attempt++ {
		time.Sleep(1500 * time.Millisecond)
		draftListBytes, err := getJSON(fmt.Sprintf("%s/api/memory/drafts?group_id=%s", baseURL, groupID), adminAuth.Token)
		if err != nil {
			continue
		}

		var drafts []map[string]interface{}
		_ = json.Unmarshal(draftListBytes, &drafts)
		if len(drafts) > 0 {
			draftID = fmt.Sprintf("%v", drafts[0]["draft_id"])
			log.Printf("🎉 Draft Memori Ditemukan! (Draft ID: %s, Message Count: %v)", draftID, drafts[0]["message_count_processed"])
			break
		}
		fmt.Printf(".")
	}

	if draftID == "" {
		log.Fatalf("❌ Timeout menunggu draft dari Groq AI")
	}

	// Ambil detail draft
	detailBytes, err := getJSON(fmt.Sprintf("%s/api/memory/drafts/%s", baseURL, draftID), adminAuth.Token)
	if err != nil {
		log.Fatalf("❌ Gagal mengambil detail draft: %v", err)
	}
	_ = json.Unmarshal(detailBytes, &draftDetail)

	// Cetak hasil Groq
	fmt.Println("\n================================================================================")
	fmt.Println("🤖 HASIL EKSTRAKSI REAL GROQ AI (LPU CLOUD ENGINE):")
	fmt.Println("================================================================================")

	var draftData map[string]interface{}
	if d, ok := draftDetail["draft"].(map[string]interface{}); ok {
		draftData = d
	} else {
		draftData = draftDetail
	}

	if artifacts, ok := draftData["artifacts"].([]interface{}); ok {
		decisionCount := 0
		for _, a := range artifacts {
			am := a.(map[string]interface{})
			artType := fmt.Sprintf("%v", am["type"])
			content := fmt.Sprintf("%v", am["content"])
			confidence := fmt.Sprintf("%v", am["confidence"])

			switch artType {
			case "SUMMARY":
				fmt.Printf("📌 [Ringkasan Eksekutif] (Confidence: %s):\n%s\n\n", confidence, content)
			case "DECISION":
				decisionCount++
				fmt.Printf("🎯 [Butir Keputusan #%d] (Confidence: %s):\n   - %s\n", decisionCount, confidence, content)
			case "JOURNEY_LITE":
				fmt.Printf("\n🧭 [Rekonstruksi Journey Lite] (Confidence: %s):\n%s\n", confidence, content)
			}
		}
	}
	fmt.Println("================================================================================")

	// 9. Admin Memberikan Validasi & Approval
	log.Println("👨‍💼 [9/9] Admin memvalidasi dan menyetujui draft memori...")
	approveResp, err := postJSON(fmt.Sprintf("%s/api/memory/drafts/%s/approve", baseURL, draftID), nil, adminAuth.Token)
	if err != nil {
		log.Fatalf("❌ Gagal approve draft: %v", err)
	}
	log.Printf("🎉 Draft berhasil disahkan dan memori resmi diterbitkan ke grup! Response: %s", string(approveResp))

	// Verifikasi Anggota membaca Memori Grup
	log.Println("👥 Anggota grup (Siti) mengambil Arsip Memori Grup (GET /api/groups/{id}/memories)...")
	memListBytes, err := getJSON(fmt.Sprintf("%s/api/groups/%s/memories", baseURL, groupID), memberAuth.Token)
	if err != nil {
		log.Fatalf("❌ Member gagal mengambil memori grup: %v", err)
	}

	var memories []map[string]interface{}
	_ = json.Unmarshal(memListBytes, &memories)

	if len(memories) == 0 {
		log.Fatalf("❌ Memori tidak muncul di arsip anggota grup! Response: %s", string(memListBytes))
	}

	activeMem := memories[0]
	fmt.Println("\n================================================================================")
	fmt.Println("🏆 MEMORI GRUP YANG DIAKSES OLEH ANGGOTA GRUP (READ-MODEL SUKSES):")
	fmt.Println("================================================================================")
	fmt.Printf("ID Memori    : %v\n", activeMem["id"])
	fmt.Printf("Disetujui Oleh: %v (%v)\n", activeMem["approved_by_name"], activeMem["approved_by"])
	fmt.Printf("Forum Terkait : %v (ID: %v)\n", activeMem["forum_title"], activeMem["forum_id"])
	fmt.Printf("Jumlah Keputusan: %v butir | Journey Lite: %v\n", activeMem["decision_count"], activeMem["has_journey_lite"])
	fmt.Printf("Ringkasan    :\n%v\n", activeMem["snapshot_summary"])
	fmt.Println("================================================================================")
	log.Println("✨ PENGUJIAN LENGKAP END-TO-END BERHASIL 100% TANPA BROWSER! ✨")
}

func registerOrLogin(username, displayName, password string) (*AuthResponse, error) {
	regPayload := map[string]string{
		"username":     username,
		"display_name": displayName,
		"password":     password,
	}
	respBytes, err := postJSON(baseURL+"/api/auth/register", regPayload, "")
	if err != nil {
		// Coba login
		loginPayload := map[string]string{
			"username": username,
			"password": password,
		}
		respBytes, err = postJSON(baseURL+"/api/auth/login", loginPayload, "")
		if err != nil {
			return nil, err
		}
	}

	var authRes AuthResponse
	if err := json.Unmarshal(respBytes, &authRes); err != nil {
		return nil, fmt.Errorf("decode error: %w (body: %s)", err, string(respBytes))
	}
	if authRes.Token == "" {
		return nil, fmt.Errorf("token kosong: %s", string(respBytes))
	}
	return &authRes, nil
}

func postJSON(url string, body interface{}, token string) ([]byte, error) {
	var bodyReader io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		bodyReader = bytes.NewReader(b)
	}

	req, err := http.NewRequest(http.MethodPost, url, bodyReader)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode >= 400 {
		return respBytes, fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(respBytes))
	}
	return respBytes, nil
}

func getJSON(url string, token string) ([]byte, error) {
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode >= 400 {
		return respBytes, fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(respBytes))
	}
	return respBytes, nil
}

func connectWS(token string) (*websocket.Conn, error) {
	url := fmt.Sprintf("%s?token=%s&device_id=tester_device", wsURL, token)
	header := http.Header{}
	header.Set("Origin", "http://localhost:3000")

	dialer := websocket.Dialer{
		HandshakeTimeout: 5 * time.Second,
	}
	conn, _, err := dialer.Dial(url, header)
	if err != nil {
		// Fallback query tanpa origin strict
		conn, _, err = dialer.Dial(url, nil)
	}
	return conn, err
}
