package api

import (
	_ "embed"
	"net/http"
	"os"
)

//go:embed openapi.yaml
var embeddedOpenAPISpec []byte

// OpenAPIHandler mengelola penyajian spesifikasi kontrak OpenAPI 3.1.0 dan
// web UI dokumentasi interaktif mandiri.
type OpenAPIHandler struct {
	spec []byte
}

// NewOpenAPIHandler menginisialisasi handler dengan spesifikasi tertanam
// atau fallback membaca dari disk jika file diubah saat pengembangan.
func NewOpenAPIHandler() *OpenAPIHandler {
	spec := embeddedOpenAPISpec
	if len(spec) == 0 {
		// Fallback untuk local testing jika embed belum terisi
		if data, err := os.ReadFile("docs/openapi.yaml"); err == nil {
			spec = data
		} else if data, err := os.ReadFile("../docs/openapi.yaml"); err == nil {
			spec = data
		}
	}
	return &OpenAPIHandler{
		spec: spec,
	}
}

// GetSpec mengembalikan byte mentah dari spesifikasi OpenAPI.
func (h *OpenAPIHandler) GetSpec() []byte {
	return h.spec
}

// ServeOpenAPISpec menyajikan file OpenAPI YAML dengan header MIME yang tepat.
func (h *OpenAPIHandler) ServeOpenAPISpec(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/yaml; charset=utf-8")
	w.Header().Set("Cache-Control", "public, max-age=3600")
	w.WriteHeader(http.StatusOK)
	if r.Method == http.MethodGet {
		_, _ = w.Write(h.spec)
	}
}

// ServeDocsUI menyajikan halaman web interaktif mandiri untuk eksplorasi API.
func (h *OpenAPIHandler) ServeDocsUI(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "public, max-age=3600")
	w.WriteHeader(http.StatusOK)
	if r.Method == http.MethodGet {
		_, _ = w.Write([]byte(docsUIHTML))
	}
}

const docsUIHTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>WuzzChat Engine — API Reference</title>
    <meta name="description" content="Canonical OpenAPI 3.1.0 Interactive Reference for WuzzChat Engine" />
    <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>💬</text></svg>">
    <style>
      :root {
        --bg-color: #0f172a;
        --card-bg: #1e293b;
        --text-color: #f8fafc;
        --text-muted: #94a3b8;
        --accent: #38bdf8;
        --border: #334155;
      }
      body {
        margin: 0;
        padding: 0;
        background-color: var(--bg-color);
        color: var(--text-color);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        min-height: 100vh;
      }
      #fallback-ui {
        display: none;
        max-width: 1100px;
        margin: 0 auto;
        padding: 40px 24px;
      }
      .header {
        border-bottom: 1px solid var(--border);
        padding-bottom: 24px;
        margin-bottom: 32px;
      }
      .badge {
        display: inline-block;
        padding: 4px 10px;
        border-radius: 9999px;
        font-size: 12px;
        font-weight: 600;
        background: #0284c7;
        color: #fff;
        margin-bottom: 12px;
      }
      h1 { margin: 0 0 8px 0; font-size: 32px; font-weight: 700; color: #fff; }
      p.subtitle { margin: 0 0 16px 0; color: var(--text-muted); font-size: 16px; line-height: 1.5; }
      .btn {
        display: inline-block;
        background: #2563eb;
        color: white;
        padding: 10px 18px;
        border-radius: 8px;
        text-decoration: none;
        font-weight: 600;
        font-size: 14px;
        transition: background 0.2s;
        margin-right: 12px;
      }
      .btn:hover { background: #1d4ed8; }
      .btn-secondary { background: #334155; }
      .btn-secondary:hover { background: #475569; }
      .endpoint-card {
        background: var(--card-bg);
        border: 1px solid var(--border);
        border-radius: 10px;
        padding: 20px;
        margin-bottom: 16px;
      }
      .method {
        display: inline-block;
        padding: 4px 8px;
        border-radius: 6px;
        font-weight: 700;
        font-size: 12px;
        margin-right: 10px;
      }
      .method.post { background: #16a34a; color: white; }
      .method.get { background: #0284c7; color: white; }
      .method.put, .method.patch { background: #d97706; color: white; }
      .method.delete { background: #dc2626; color: white; }
      .path { font-family: monospace; font-size: 15px; font-weight: 600; color: #f1f5f9; }
      .summary { color: var(--text-muted); font-size: 14px; margin-top: 8px; }
    </style>
  </head>
  <body>
    <!-- Primary Scalar API Reference Container -->
    <div id="scalar-container">
      <script
        id="api-reference"
        data-url="/api/openapi.yaml"
        data-configuration='{"theme":"purple","layout":"modern","showSidebar":true}'></script>
      <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference" onerror="showFallback()"></script>
    </div>

    <!-- Fallback UI for Offline or Isolated Deployments -->
    <div id="fallback-ui">
      <div class="header">
        <span class="badge">OpenAPI 3.1.0</span>
        <h1>WuzzChat Engine API Reference</h1>
        <p class="subtitle">
          Enterprise Multi-Tenant Messaging Engine, Headless Realtime Chat, AI Memory, and E2EE Signaling Server.
        </p>
        <div>
          <a href="/api/openapi.yaml" class="btn" download="openapi.yaml">Download OpenAPI Specification (.yaml)</a>
          <a href="/health" class="btn btn-secondary">Server Health Check</a>
        </div>
      </div>

      <h2 style="font-size: 20px; margin-bottom: 20px;">Core API Routes</h2>
      
      <div class="endpoint-card">
        <span class="method post">POST</span>
        <span class="path">/api/v1/auth/provision-token</span>
        <div class="summary">Server-to-Server JIT User Provisioning (Headers: X-App-ID, X-App-Secret)</div>
      </div>

      <div class="endpoint-card">
        <span class="method post">POST</span>
        <span class="path">/api/v1/auth/exchange</span>
        <div class="summary">Client Token Exchange for 7-Day Session JWT</div>
      </div>

      <div class="endpoint-card">
        <span class="method get">GET</span>
        <span class="path">/ws?token={jwt}&amp;device_id={device_id}</span>
        <div class="summary">Full-Duplex Realtime WebSocket RFC 6455 Handshake</div>
      </div>

      <div class="endpoint-card">
        <span class="method get">GET</span>
        <span class="path">/api/conversations</span>
        <div class="summary">List Active Direct and Group Conversations with Unread Counts</div>
      </div>

      <div class="endpoint-card">
        <span class="method get">GET</span>
        <span class="path">/api/messages?room_id={id}</span>
        <div class="summary">Paginated Conversation History with Cursor &amp; E2EE Ciphertext</div>
      </div>

      <div class="endpoint-card">
        <span class="method post">POST</span>
        <span class="path">/api/media/upload</span>
        <div class="summary">Store-and-Forward Encrypted Media File Upload</div>
      </div>

      <div class="endpoint-card">
        <span class="method post">POST</span>
        <span class="path">/api/groups/{id}/subgroups</span>
        <div class="summary">Create Ephemeral Fora with Auto-Expiring TTL &amp; AI Memory Trigger</div>
      </div>

      <div class="endpoint-card">
        <span class="method get">GET</span>
        <span class="path">/api/memory/drafts</span>
        <div class="summary">Human-in-the-Loop AI Memory Draft Queue for Administrators</div>
      </div>
    </div>

    <script>
      function showFallback() {
        var scalar = document.getElementById('scalar-container');
        if (scalar) scalar.style.display = 'none';
        var fallback = document.getElementById('fallback-ui');
        if (fallback) fallback.style.display = 'block';
      }
      // Safety timeout: If Scalar script fails to render within 3.5s (offline), switch to fallback
      setTimeout(function() {
        var scalarEl = document.querySelector('.scalar-api-reference');
        if (!scalarEl && !window.Scalar) {
          showFallback();
        }
      }, 3500);
    </script>
  </body>
</html>
`
