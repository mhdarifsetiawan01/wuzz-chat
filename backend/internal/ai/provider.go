package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/store"
)

var (
	ErrEmptyAIResponse   = errors.New("respons dari AI kosong")
	ErrInvalidJSONOutput = errors.New("output AI bukan format JSON yang valid")
	ErrSummaryMissing    = errors.New("konten summary tidak ditemukan dalam output AI")
)

var jsonBlockRegex = regexp.MustCompile(`(?s)\{.*\}`)

// ParseStructuredOutput mengekstrak, membersihkan, dan memvalidasi JSON output dari respons AI.
func ParseStructuredOutput(rawText string) (*MemoryGenerationOutput, error) {
	cleaned := strings.TrimSpace(rawText)
	if cleaned == "" {
		return nil, ErrEmptyAIResponse
	}

	// 1. Bersihkan markdown code fence jika ada
	if strings.Contains(cleaned, "```") {
		// Hapus awalan ```json atau ``` dan akhiran ```
		re := regexp.MustCompile("(?s)```(?:json)?\\s*(.*?)\\s*```")
		matches := re.FindStringSubmatch(cleaned)
		if len(matches) > 1 {
			cleaned = strings.TrimSpace(matches[1])
		}
	}

	// 2. Jika masih ada teks pendahuluan/penutup di luar kurung kurawal, ambil blok JSON terluar
	if !strings.HasPrefix(cleaned, "{") || !strings.HasSuffix(cleaned, "}") {
		found := jsonBlockRegex.FindString(cleaned)
		if found != "" {
			cleaned = found
		}
	}

	var output MemoryGenerationOutput
	if err := json.Unmarshal([]byte(cleaned), &output); err != nil {
		return nil, fmt.Errorf("%w: %v (raw: %s)", ErrInvalidJSONOutput, err, cleaned)
	}

	// 3. Validasi Kontrak Wajib (Section 6)
	output.Summary.Content = strings.TrimSpace(output.Summary.Content)
	if output.Summary.Content == "" {
		return nil, ErrSummaryMissing
	}
	output.Summary.Confidence = normalizeConfidence(output.Summary.Confidence)

	// Validasi & Batasi Keputusan (Maksimal 10 keputusan)
	if len(output.Decisions) > 10 {
		output.Decisions = output.Decisions[:10]
	}
	for i := range output.Decisions {
		output.Decisions[i].Position = i + 1
		output.Decisions[i].Text = strings.TrimSpace(output.Decisions[i].Text)
		output.Decisions[i].Confidence = normalizeConfidence(output.Decisions[i].Confidence)
		if output.Decisions[i].EvidenceMessageIDs == nil {
			output.Decisions[i].EvidenceMessageIDs = []string{}
		}
	}

	// Validasi Journey Lite
	output.JourneyLite.Confidence = normalizeConfidence(output.JourneyLite.Confidence)
	if output.JourneyLite.Skipped {
		output.JourneyLite.Content = nil
		if output.JourneyLite.SkipReason == "" {
			output.JourneyLite.SkipReason = "instant_consensus"
		}
	} else if output.JourneyLite.Content != nil {
		output.JourneyLite.Content.Initially = strings.TrimSpace(output.JourneyLite.Content.Initially)
		output.JourneyLite.Content.Then = strings.TrimSpace(output.JourneyLite.Content.Then)
		output.JourneyLite.Content.Finally = strings.TrimSpace(output.JourneyLite.Content.Finally)

		// Jika ada field konten yang kosong, fallback ke skipped
		if output.JourneyLite.Content.Initially == "" || output.JourneyLite.Content.Finally == "" {
			output.JourneyLite.Skipped = true
			output.JourneyLite.SkipReason = "insufficient_signal"
			output.JourneyLite.Content = nil
		}
	} else {
		output.JourneyLite.Skipped = true
		output.JourneyLite.SkipReason = "insufficient_signal"
	}

	return &output, nil
}

func normalizeConfidence(conf string) string {
	switch strings.ToUpper(strings.TrimSpace(conf)) {
	case store.ConfidenceHigh:
		return store.ConfidenceHigh
	case store.ConfidenceLow:
		return store.ConfidenceLow
	default:
		return store.ConfidenceMedium
	}
}

// -----------------------------------------------------------------------------
// Mock AI Service (Untuk Testing & Fallback)
// -----------------------------------------------------------------------------

// MockAIService menyediakan respons deterministik untuk unit test dan environment tanpa API key.
type MockAIService struct {
	CustomOutput *MemoryGenerationOutput
	ShouldFail   bool
	FailureError error
}

func (m *MockAIService) GenerateMemory(ctx context.Context, input MemoryGenerationInput) (*MemoryGenerationOutput, error) {
	if m.ShouldFail {
		if m.FailureError != nil {
			return nil, m.FailureError
		}
		return nil, errors.New("simulasi AI Provider error 500")
	}

	if m.CustomOutput != nil {
		return m.CustomOutput, nil
	}

	// Default realistic mock generator
	evidenceIDs := []string{}
	for _, msg := range input.Messages {
		if !msg.IsDeleted && len(evidenceIDs) < 2 {
			evidenceIDs = append(evidenceIDs, msg.ID)
		}
	}

	return &MemoryGenerationOutput{
		Summary: AISummaryOutput{
			Content:    fmt.Sprintf("Diskusi di forum '%s' membahas topik perancangan dan keputusan grup '%s' secara intensif dan mendalam.", input.ForumTitle, input.GroupTitle),
			Confidence: store.ConfidenceHigh,
		},
		Decisions: []AIDecisionOutput{
			{
				Position:           1,
				Text:               "Menyetujui implementasi arsitektur Group Memory AI secara bertahap.",
				Confidence:         store.ConfidenceHigh,
				EvidenceMessageIDs: evidenceIDs,
			},
		},
		JourneyLite: AIJourneyLiteOutput{
			Skipped: false,
			Content: &AIJourneyLiteContent{
				Initially: "Awalnya terdapat diskusi mengenai pendekatan summary biasa versus memory permanen.",
				Then:      "Kemudian disepakati pentingnya validasi manusia dan bukti kutipan pesan.",
				Finally:   "Akhirnya dibentuk blueprint implementasi 16 bab spesifikasi teknis.",
			},
			Confidence: store.ConfidenceHigh,
		},
	}, nil
}

// -----------------------------------------------------------------------------
// Gemini / HTTP Provider
// -----------------------------------------------------------------------------

// GeminiProvider memanggil Google Gemini REST API (v1beta).
type GeminiProvider struct {
	apiKey     string
	model      string
	httpClient *http.Client
}

// NewGeminiProvider membuat instance GeminiProvider.
func NewGeminiProvider(apiKey string, model string) *GeminiProvider {
	if model == "" {
		model = "gemini-1.5-flash"
	}
	return &GeminiProvider{
		apiKey: apiKey,
		model:  model,
		httpClient: &http.Client{
			Timeout: 45 * time.Second,
		},
	}
}

type geminiPart struct {
	Text string `json:"text"`
}

type geminiContent struct {
	Role  string       `json:"role,omitempty"`
	Parts []geminiPart `json:"parts"`
}

type geminiRequest struct {
	SystemInstruction *geminiContent  `json:"systemInstruction,omitempty"`
	Contents          []geminiContent `json:"contents"`
	GenerationConfig  struct {
		Temperature      float64 `json:"temperature"`
		ResponseMimeType string  `json:"responseMimeType,omitempty"`
	} `json:"generationConfig"`
}

type geminiResponse struct {
	Candidates []struct {
		Content struct {
			Parts []struct {
				Text string `json:"text"`
			} `json:"parts"`
		} `json:"content"`
	} `json:"candidates"`
	Error *struct {
		Message string `json:"message"`
		Code    int    `json:"code"`
	} `json:"error,omitempty"`
}

func (g *GeminiProvider) GenerateMemory(ctx context.Context, input MemoryGenerationInput) (*MemoryGenerationOutput, error) {
	url := fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent?key=%s", g.model, g.apiKey)

	userPrompt := BuildUserPrompt(input)

	reqBody := geminiRequest{
		SystemInstruction: &geminiContent{
			Parts: []geminiPart{{Text: SystemPrompt}},
		},
		Contents: []geminiContent{
			{
				Role:  "user",
				Parts: []geminiPart{{Text: userPrompt}},
			},
		},
	}
	reqBody.GenerationConfig.Temperature = 0.2
	reqBody.GenerationConfig.ResponseMimeType = "application/json"

	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("gagal marshal gemini request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, fmt.Errorf("gagal membuat http request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := g.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("gagal memanggil Gemini API: %w", err)
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("gagal membaca respons Gemini: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("Gemini API error (status %d): %s", resp.StatusCode, string(respBytes))
	}

	var gResp geminiResponse
	if err := json.Unmarshal(respBytes, &gResp); err != nil {
		return nil, fmt.Errorf("gagal decode response Gemini: %w", err)
	}

	if gResp.Error != nil {
		return nil, fmt.Errorf("Gemini error: %s (code %d)", gResp.Error.Message, gResp.Error.Code)
	}

	if len(gResp.Candidates) == 0 || len(gResp.Candidates[0].Content.Parts) == 0 {
		return nil, ErrEmptyAIResponse
	}

	rawText := gResp.Candidates[0].Content.Parts[0].Text
	return ParseStructuredOutput(rawText)
}

// NewAIServiceFromEnv menginisialisasi AIService berdasarkan environment variable.
// Jika GEMINI_API_KEY atau AI_API_KEY ditemukan, gunakan provider Gemini nyata.
// Jika tidak, gunakan MockAIService yang aman dan deterministik untuk development/test.
func NewAIServiceFromEnv() AIService {
	apiKey := strings.TrimSpace(os.Getenv("GEMINI_API_KEY"))
	if apiKey == "" {
		apiKey = strings.TrimSpace(os.Getenv("AI_API_KEY"))
	}

	if apiKey != "" {
		model := strings.TrimSpace(os.Getenv("GEMINI_MODEL"))
		if model == "" {
			model = "gemini-1.5-flash"
		}
		log.Printf("🤖 [AIService] Menggunakan Google Gemini Provider (Model: %s)", model)
		return NewGeminiProvider(apiKey, model)
	}

	log.Printf("🧪 [AIService] API Key tidak ditemukan. Menggunakan MockAIService (Deterministic Test Mode)")
	return &MockAIService{}
}
