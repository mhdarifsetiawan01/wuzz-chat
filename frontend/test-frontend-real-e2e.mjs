/**
 * test-frontend-real-e2e.mjs
 * Pengujian komprehensif integrasi Frontend asli (Next.js server.js di port 3047)
 * terhadap backend Go yang telah di-refactor pada Milestone 1.
 */

const FRONTEND_ORIGIN = 'http://localhost:3047'
const WS_ORIGIN = 'ws://localhost:3047/ws'

const log = {
  section: (title) => console.log(`\n\x1b[1m\x1b[35m=== ${title} ===\x1b[0m`),
  step: (name) => process.stdout.write(`  ▶ ${name}... `),
  pass: (extra = '') => console.log(`\x1b[32m[PASS]\x1b[0m ${extra}`),
  fail: (err) => {
    console.log(`\x1b[31m[FAIL]\x1b[0m ${err}`)
    throw new Error(err)
  }
}

async function run() {
  log.section('1. Verifikasi Halaman HTML Frontend (Next.js SSR)')
  
  // 1.1 Halaman Register
  log.step('GET /register')
  let res = await fetch(`${FRONTEND_ORIGIN}/register`)
  if (res.status === 200 && (await res.text()).includes('Wuzz')) {
    log.pass('(200 OK HTML)')
  } else {
    log.fail(`Status: ${res.status}`)
  }

  // 1.2 Halaman Login
  log.step('GET /login')
  res = await fetch(`${FRONTEND_ORIGIN}/login`)
  if (res.status === 200) {
    log.pass('(200 OK HTML)')
  } else {
    log.fail(`Status: ${res.status}`)
  }

  // 1.3 Halaman Chat
  log.step('GET /chat')
  res = await fetch(`${FRONTEND_ORIGIN}/chat`)
  if (res.status === 200) {
    log.pass('(200 OK HTML)')
  } else {
    log.fail(`Status: ${res.status}`)
  }

  log.section('2. Siklus Autentikasi Frontend (/api/auth/...)')

  const username = `fe_user_${Date.now()}`
  const password = 'Password123!'
  const deviceId = `dev_fe_browser_${Date.now()}`

  // 2.1 Register
  log.step('POST /api/auth/register')
  res = await fetch(`${FRONTEND_ORIGIN}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username,
      password,
      display_name: 'Frontend User',
      device_id: deviceId,
      device_name: 'Chrome on Linux (PWA)',
    })
  })
  let data = await res.json()
  if (res.status === 201 && data.token) {
    log.pass(`(User ID: ${data.user.id})`)
  } else {
    log.fail(JSON.stringify(data))
  }
  const token = data.token
  const userId = data.user.id

  // 2.2 Get Me
  log.step('GET /api/auth/me')
  res = await fetch(`${FRONTEND_ORIGIN}/api/auth/me`, {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  data = await res.json()
  if (res.status === 200 && data.username === username) {
    log.pass(`(Username: ${data.username})`)
  } else {
    log.fail(JSON.stringify(data))
  }

  // 2.3 Get Active Sessions
  log.step('GET /api/auth/sessions')
  res = await fetch(`${FRONTEND_ORIGIN}/api/auth/sessions`, {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  data = await res.json()
  if (res.status === 200 && Array.isArray(data.sessions) && data.sessions.length > 0) {
    log.pass(`(Total active sessions: ${data.sessions.length})`)
  } else {
    log.fail(JSON.stringify(data))
  }

  // 2.4 Get Devices
  log.step('GET /api/auth/devices')
  res = await fetch(`${FRONTEND_ORIGIN}/api/auth/devices`, {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  data = await res.json()
  if (res.status === 200 && Array.isArray(data)) {
    log.pass(`(Registered devices: ${data.length})`)
  } else {
    log.fail(JSON.stringify(data))
  }

  log.section('3. Siklus Obrolan & Perpesanan (/api/conversations & /api/messages)')

  // 3.1 Get Conversations (harus kosong di awal)
  log.step('GET /api/conversations')
  res = await fetch(`${FRONTEND_ORIGIN}/api/conversations`, {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  data = await res.json()
  if (res.status === 200 && Array.isArray(data)) {
    log.pass(`(Conversations: ${data.length})`)
  } else {
    log.fail(JSON.stringify(data))
  }

  // 3.2 Cari User (Alice)
  log.step('GET /api/users/search?q=alice')
  res = await fetch(`${FRONTEND_ORIGIN}/api/users/search?q=alice`, {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  let users = await res.json()
  let alice = users.find(u => u.username === 'alice')
  if (!alice) {
    // Daftarkan alice jika belum ada
    const rAlice = await fetch(`${FRONTEND_ORIGIN}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'alice',
        password: 'Password123!',
        display_name: 'Alice Wonder',
        device_id: 'alice_laptop',
      })
    })
    const dAlice = await rAlice.json()
    alice = dAlice.user
  }
  log.pass(`(Alice ID: ${alice.id})`)

  // 3.3 Start Direct Chat dengan Alice
  log.step('POST /api/conversations (Direct Chat)')
  res = await fetch(`${FRONTEND_ORIGIN}/api/conversations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ target_user_id: alice.id })
  })
  data = await res.json()
  if (res.status === 200 && data.room_id) {
    log.pass(`(Room ID: ${data.room_id})`)
  } else {
    log.fail(JSON.stringify(data))
  }
  const roomId = data.room_id

  // 3.4 Hubungkan WebSocket melalui Next.js server.js proxy
  log.step('WebSocket Connect & Upgrade via Next.js Proxy')
  const ws = new WebSocket(`${WS_ORIGIN}?token=${encodeURIComponent(token)}`)
  await new Promise((resolve, reject) => {
    ws.onopen = () => {
      log.pass('(WebSocket Handshake 101 OK)')
      resolve()
    }
    ws.onerror = (e) => reject(new Error('WebSocket connection failed'))
    setTimeout(() => reject(new Error('WebSocket connection timeout')), 4000)
  })

  // Bergabung ke room
  ws.send(JSON.stringify({
    type: 'join',
    room: roomId,
  }))

  // Kirim pesan teks pertama
  log.step('WebSocket Send Message')
  const testMsgId = `msg_${Date.now()}`
  const testMsgContent = 'Pesan uji coba dari frontend Next.js asli!'
  const receiptPromise = new Promise((resolve) => {
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === 'receipt' && msg.id === testMsgId) {
          resolve(msg)
        }
      } catch (e) {}
    }
  })

  ws.send(JSON.stringify({
    id: testMsgId,
    type: 'message',
    room: roomId,
    content: testMsgContent,
  }))

  const receipt = await receiptPromise
  log.pass(`(Sent & Receipt Received: ID ${receipt.id}, Status: ${receipt.status})`)
  const msgId = testMsgId

  // 3.5 Edit Pesan via REST API (Endpoint yang di-refactor di Milestone 1)
  log.step('PUT /api/messages (Edit Message)')
  res = await fetch(`${FRONTEND_ORIGIN}/api/messages`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      message_id: msgId,
      new_content: 'Pesan uji coba dari frontend Next.js asli! (DIEDIT)',
    })
  })
  data = await res.json()
  if (res.status === 200 && data.success && data.is_edited) {
    log.pass(`(Edited content: "${data.new_content}")`)
  } else {
    log.fail(JSON.stringify(data))
  }

  // 3.6 Pin Message via REST API (Endpoint yang di-refactor di Milestone 1)
  log.step('POST /api/messages/pin (Pin Message)')
  res = await fetch(`${FRONTEND_ORIGIN}/api/messages/pin`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      room_id: roomId,
      message_id: msgId,
      duration_hours: 24,
    })
  })
  data = await res.json()
  if (res.status === 200 && data.success) {
    log.pass('(Pesan berhasil disematkan)')
  } else {
    log.fail(JSON.stringify(data))
  }

  // 3.7 Get Pinned Messages (Endpoint yang di-refactor di Milestone 1)
  log.step('GET /api/messages/pinned?room_id=...')
  res = await fetch(`${FRONTEND_ORIGIN}/api/messages/pinned?room_id=${encodeURIComponent(roomId)}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  data = await res.json()
  if (res.status === 200 && data.success && Array.isArray(data.pinned) && data.pinned.length > 0) {
    log.pass(`(Total pinned messages: ${data.pinned.length})`)
  } else {
    log.fail(JSON.stringify(data))
  }

  // 3.8 Pin Conversation (Endpoint yang di-refactor di Milestone 1)
  log.step('POST /api/conversations/pin')
  res = await fetch(`${FRONTEND_ORIGIN}/api/conversations/pin`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ conversation_id: roomId })
  })
  data = await res.json()
  if (res.status === 200 && data.success && data.is_pinned) {
    log.pass('(Percakapan berhasil disematkan)')
  } else {
    log.fail(JSON.stringify(data))
  }

  // 3.9 Update Receipt (delivered / read) (Endpoint yang di-refactor di Milestone 1)
  log.step('POST /api/messages/receipt (Status: read)')
  res = await fetch(`${FRONTEND_ORIGIN}/api/messages/receipt`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      room_id: roomId,
      message_id: msgId,
      status: 'read',
    })
  })
  data = await res.json()
  if (res.status === 200 && data.success && data.status === 'read') {
    log.pass('(Tanda terima read terproses)')
  } else {
    log.fail(JSON.stringify(data))
  }

  // 3.10 Search Messages (Endpoint yang di-refactor di Milestone 1)
  log.step('GET /api/messages/search?room_id=...&q=DIEDIT')
  res = await fetch(`${FRONTEND_ORIGIN}/api/messages/search?room_id=${encodeURIComponent(roomId)}&q=DIEDIT`, {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  data = await res.json()
  if (res.status === 200 && data.success && data.count > 0) {
    log.pass(`(Ditemukan ${data.count} pesan yang cocok)`)
  } else {
    log.fail(JSON.stringify(data))
  }

  // 3.11 Unpin Message
  log.step('POST /api/messages/unpin')
  res = await fetch(`${FRONTEND_ORIGIN}/api/messages/unpin`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      room_id: roomId,
      message_id: msgId,
    })
  })
  data = await res.json()
  if (res.status === 200 && data.success) {
    log.pass('(Sematan pesan berhasil dilepas)')
  } else {
    log.fail(JSON.stringify(data))
  }

  // 3.12 Delete Message (Endpoint yang di-refactor di Milestone 1)
  log.step('DELETE /api/messages (Delete for Everyone)')
  res = await fetch(`${FRONTEND_ORIGIN}/api/messages`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      message_id: msgId,
      delete_for_everyone: true,
    })
  })
  data = await res.json()
  if (res.status === 200 && data.success && data.delete_for_everyone) {
    log.pass('(Pesan berhasil dihapus untuk semua orang)')
  } else {
    log.fail(JSON.stringify(data))
  }

  // 3.13 Clear Conversation (Endpoint yang di-refactor di Milestone 1)
  log.step('DELETE /api/conversations?id=...')
  res = await fetch(`${FRONTEND_ORIGIN}/api/conversations?id=${encodeURIComponent(roomId)}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` }
  })
  data = await res.json()
  if (res.status === 200 && data.success) {
    log.pass('(Percakapan berhasil dibersihkan)')
  } else {
    log.fail(JSON.stringify(data))
  }

  // 3.14 Tutup koneksi WebSocket
  ws.close()

  // 3.15 Logout
  log.step('POST /api/auth/logout')
  res = await fetch(`${FRONTEND_ORIGIN}/api/auth/logout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ device_id: deviceId })
  })
  data = await res.json()
  if (res.status === 200) {
    log.pass('(Logout berhasil)')
  } else {
    log.fail(JSON.stringify(data))
  }

  log.section('✅ HASIL PENGUJIAN INTEGRASI FRONTEND ASLI: 100% SUKSES!')
}

run().catch((err) => {
  console.error('\n❌ Pengujian Terhenti dengan Error:', err)
  process.exit(1)
})
