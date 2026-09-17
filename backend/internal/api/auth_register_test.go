package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/bms-del112/wuzz-chat/internal/store"
)

func TestAuthHandler_RegisterValidation(t *testing.T) {
	tmpDB := filepath.Join(t.TempDir(), "test_api_auth_register.db")
	sqlStore, err := store.NewSQLMessageStore("sqlite", tmpDB)
	if err != nil {
		t.Fatalf("failed to init SQLite store: %v", err)
	}
	defer sqlStore.Close()

	userStore := store.NewSQLUserStore(sqlStore.DB(), sqlStore.DriverName())
	handler := NewAuthHandler(userStore)

	tests := []struct {
		name           string
		body           map[string]string
		expectedStatus int
		expectedErr    string
	}{
		{
			name: "Success valid user",
			body: map[string]string{
				"username":     "budi_santoso",
				"display_name": "Budi Santoso",
				"password":     "password123",
			},
			expectedStatus: http.StatusCreated,
		},
		{
			name: "Blocked substring (jancok)",
			body: map[string]string{
				"username": "si_jancok",
				"password": "password123",
			},
			expectedStatus: http.StatusBadRequest,
			expectedErr:    "username ini tidak diizinkan atau dicadangkan untuk sistem",
		},
		{
			name: "Blocked substring (semantic)",
			body: map[string]string{
				"username": "semantic_corp",
				"password": "password123",
			},
			expectedStatus: http.StatusBadRequest,
			expectedErr:    "username ini tidak diizinkan atau dicadangkan untuk sistem",
		},
		{
			name: "Blocked suffix official (arif_official)",
			body: map[string]string{
				"username": "arif_official",
				"password": "password123",
			},
			expectedStatus: http.StatusBadRequest,
			expectedErr:    "username ini tidak diizinkan atau dicadangkan untuk sistem",
		},
		{
			name: "Blocked invalid character (space)",
			body: map[string]string{
				"username": "budi santoso",
				"password": "password123",
			},
			expectedStatus: http.StatusBadRequest,
			expectedErr:    "username hanya boleh berisi huruf, angka, titik, strip, dan underscore (tanpa spasi)",
		},
		{
			name: "Blocked short password",
			body: map[string]string{
				"username": "user123",
				"password": "123",
			},
			expectedStatus: http.StatusBadRequest,
			expectedErr:    "password minimal 6 karakter",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			jsonBytes, _ := json.Marshal(tt.body)
			req := httptest.NewRequest(http.MethodPost, "/api/auth/register", bytes.NewReader(jsonBytes))
			req.Header.Set("Content-Type", "application/json")
			rec := httptest.NewRecorder()

			handler.Register(rec, req)

			if rec.Code != tt.expectedStatus {
				t.Fatalf("expected status %d, got %d. Body: %s", tt.expectedStatus, rec.Code, rec.Body.String())
			}

			if tt.expectedErr != "" {
				var resp map[string]string
				_ = json.NewDecoder(rec.Body).Decode(&resp)
				if resp["error"] != tt.expectedErr {
					t.Errorf("expected error %q, got %q", tt.expectedErr, resp["error"])
				}
			}
		})
	}
}
