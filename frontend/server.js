// server.js — Custom Next.js server dengan WebSocket proxy
//
// Kenapa butuh file ini:
// Next.js `rewrites()` di next.config tidak bisa handle WebSocket upgrade
// secara reliable di semua environment. Custom server memberi kontrol penuh:
// kita tangkap event `upgrade` dari HTTP server Node.js sendiri, lalu
// forward ke backend Go — sehingga browser hanya tahu satu origin (Next.js).
//
// Referensi: PRD bagian 4.1

const { createServer } = require('http')
const next = require('next')
const httpProxy = require('http-proxy')

const dev = process.env.NODE_ENV !== 'production'
const port = parseInt(process.env.PORT || '3047', 10)

// URL backend Go — tidak pernah terekspos ke browser
const BACKEND_WS_URL = process.env.BACKEND_URL || 'http://localhost:8080'

const app = next({ dev })
const handle = app.getRequestHandler()

// Buat proxy instance sekali saja (reuse untuk semua upgrade request)
const proxy = httpProxy.createProxy()

proxy.on('error', (err, req, res) => {
  console.error('[Proxy] error:', err.message)
  // Kalau res masih writable (HTTP biasa), kirim 502
  if (res && typeof res.writeHead === 'function') {
    res.writeHead(502, { 'Content-Type': 'text/plain' })
    res.end('Bad Gateway: backend tidak bisa dijangkau')
  }
})

app.prepare().then(() => {
  const server = createServer((req, res) => {
    // Forward /api/* requests langsung ke Go backend
    if (req.url && req.url.startsWith('/api/')) {
      proxy.web(req, res, { target: BACKEND_WS_URL })
      return
    }

    // Teruskan request halaman web ke Next.js
    handle(req, res)
  })

  // Tangkap event `upgrade` — ini yang membuat WebSocket bisa diproxy.
  // Event ini tidak bisa ditangani oleh next.config.js rewrites.
  const upgradeHandler = typeof app.getUpgradeHandler === 'function' ? app.getUpgradeHandler() : null

  server.on('upgrade', (req, socket, head) => {
    try {
      const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`)

      if (parsedUrl.pathname === '/ws') {
        console.log(`[Proxy] WS upgrade: ${req.url} → ${BACKEND_WS_URL}/ws`)
        proxy.ws(req, socket, head, {
          target: BACKEND_WS_URL,
          ws: true,
        })
      } else if (upgradeHandler) {
        upgradeHandler(req, socket, head)
      } else {
        socket.destroy()
      }
    } catch (err) {
      console.error('[Proxy] Upgrade error:', err)
      socket.destroy()
    }
  })

  server.listen(port, () => {
    console.log(`🌐 Wuzz Chat frontend berjalan di http://localhost:${port}`)
    console.log(`   WS proxy: ws://localhost:${port}/ws → ${BACKEND_WS_URL}/ws`)
    console.log(`   Mode: ${dev ? 'development' : 'production'}`)
  })
})
