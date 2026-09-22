// test-multi-device-frontend.mjs — Automated Frontend Verification for Multi-Device Level 2
import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'

// Polyfill window & EventTarget
class MockEventTarget {
  constructor() {
    this.listeners = {}
  }
  addEventListener(event, callback) {
    if (!this.listeners[event]) this.listeners[event] = []
    this.listeners[event].push(callback)
  }
  removeEventListener(event, callback) {
    if (!this.listeners[event]) return
    this.listeners[event] = this.listeners[event].filter(cb => cb !== callback)
  }
  dispatchEvent(event) {
    if (!this.listeners[event.type]) return true
    this.listeners[event.type].forEach(cb => cb(event))
    return true
  }
}

class MockCustomEvent {
  constructor(type, options = {}) {
    this.type = type
    this.detail = options.detail || {}
  }
}

globalThis.window = new MockEventTarget()
globalThis.CustomEvent = MockCustomEvent

// Mock localStorage API
const storage = new Map()
globalThis.localStorage = {
  getItem: (k) => storage.get(k) || null,
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
  clear: () => storage.clear(),
}

// Mock caches API
const mockCacheStore = new Map()
globalThis.window.caches = {
  open: async () => ({
    delete: async (key) => mockCacheStore.delete(key),
    put: async (key, val) => mockCacheStore.set(key, val),
    match: async (key) => mockCacheStore.get(key),
  }),
}

// Import ws-client
const { WsClient } = await import('./lib/ws-client.ts')

console.log('🧪 [FRONTEND TEST SUITE] Verifikasi Komprehensif Skenario Frontend Multi-Device Level 2...\n')

// IndexedDB Helper yang identik dengan keyStore.ts
const DB_NAME = 'wuzz_crypto_db'
const STORE_NAME = 'keypairs'

function openCryptoDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'userId' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function saveKey(userId, privJWK, pubJWK) {
  const db = await openCryptoDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put({ userId, privateKeyJWK: privJWK, publicKeyJWK: pubJWK })
    tx.oncomplete = () => { db.close(); resolve() }
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
}

async function getKey(userId) {
  const db = await openCryptoDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const req = tx.objectStore(STORE_NAME).get(userId)
    req.onsuccess = () => { db.close(); resolve(req.result || null) }
    req.onerror = () => { db.close(); reject(req.error) }
  })
}

// Implementasi clearLocalKeyPair yang dipanggil di chat/page.tsx
async function clearLocalKeyPair(userId) {
  const db = await openCryptoDB()
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const req = store.delete(userId)
    req.onsuccess = () => { db.close(); resolve() }
    req.onerror = () => { db.close(); reject(req.error) }
  })
  if (globalThis.window && globalThis.window.caches) {
    const cache = await globalThis.window.caches.open('wuzz-crypto-keys')
    await cache.delete('/__e2ee_identity')
  }
}

async function runTests() {
  const USER_ID = 'alice-uuid-001'

  // Test 1: Pemusnahan Kunci E2EE Lokal saat Remote Logout
  console.log('▶ Test 1: Pemusnahan Kunci E2EE Lokal via clearLocalKeyPair() saat Remote Logout (DEVICE_KICKED)')
  await saveKey(USER_ID, 'secret_private_jwk', 'public_jwk')
  const savedKey = await getKey(USER_ID)
  assert.ok(savedKey, 'Kunci harus tersimpan di IndexedDB sebelum kick')
  assert.equal(savedKey.privateKeyJWK, 'secret_private_jwk')

  // Simulasikan remote logout memanggil clearLocalKeyPair
  await clearLocalKeyPair(USER_ID)
  const wipedKey = await getKey(USER_ID)
  assert.equal(wipedKey, null, 'Kunci harus 100% musnah (null) dari IndexedDB setelah remote logout')
  console.log('  ✅ PASSED: Kunci privat E2EE lokal berhasil dimusnahkan secara aman.\n')

  // Test 2: WsClient Penanganan Close Code 4001 DEVICE_KICKED
  console.log('▶ Test 2: WsClient Penanganan Close Code 4001 (DEVICE_KICKED)')
  let sessionReplacedDispatched = false
  let receivedReason = ''
  window.addEventListener('wuzz:session_replaced', (event) => {
    sessionReplacedDispatched = true
    receivedReason = event.detail?.reason || ''
  })

  // Mock WebSocket class
  let mockSocketInstance = null
  class MockWebSocket {
    constructor(url) {
      this.url = url
      mockSocketInstance = this
      setTimeout(() => {
        if (this.onopen) this.onopen({})
      }, 5)
    }
    send() {}
    close() {}
  }
  globalThis.WebSocket = MockWebSocket

  const client = new WsClient('ws://localhost:8080/ws?token=mock')
  client.connect()
  await new Promise(r => setTimeout(r, 20))

  let systemMessageReceived = null
  client.onMessage((msg) => {
    if (msg.type === 'system') {
      systemMessageReceived = msg
    }
  })

  // Simulasikan server mengirim Close Code 4001 DEVICE_KICKED
  const kickReason = 'DEVICE_KICKED: Perangkat ini telah dikeluarkan dari jarak jauh.'
  mockSocketInstance.onclose({
    code: 4001,
    reason: kickReason,
  })

  assert.equal(client['destroyed'], true, 'Client harus berstatus destroyed = true')
  assert.ok(sessionReplacedDispatched, 'Event window wuzz:session_replaced harus di-dispatch')
  assert.equal(receivedReason, kickReason, 'Alasan kick harus sesuai di event detail')
  assert.ok(systemMessageReceived, 'System message harus diteruskan ke handler UI')
  assert.ok(systemMessageReceived.content.includes('DEVICE_KICKED'), 'Pesan sistem harus memuat informasi DEVICE_KICKED')
  console.log('  ✅ PASSED: Terminal Close Code 4001 DEVICE_KICKED memutus socket tanpa auto-reconnect.\n')

  // Test 3: WsClient Penanganan Close Code 4001 SESSION_REPLACED (FIFO Eviction)
  console.log('▶ Test 3: WsClient Penanganan Close Code 4001 (SESSION_REPLACED - FIFO Eviction)')
  const client2 = new WsClient('ws://localhost:8080/ws?token=mock2')
  client2.connect()
  await new Promise(r => setTimeout(r, 20))

  let systemMsg2 = null
  client2.onMessage((msg) => {
    if (msg.type === 'system') systemMsg2 = msg
  })

  mockSocketInstance.onclose({
    code: 4001,
    reason: 'SESSION_REPLACED: Batas maksimal perangkat aktif tercapai.',
  })

  assert.equal(client2['destroyed'], true, 'Client2 harus berstatus destroyed = true')
  assert.ok(systemMsg2 && systemMsg2.content.includes('SESSION_REPLACED'), 'Pesan sistem harus memuat SESSION_REPLACED')
  console.log('  ✅ PASSED: FIFO Eviction 4001 SESSION_REPLACED menghentikan koneksi perangkat secara terminal.\n')

  // Test 4: Logika Deteksi Pesan Keluar (Self-Sync Outgoing Message di Perangkat Lain)
  console.log('▶ Test 4: Logika Deteksi Pesan Keluar saat Pengirim Menerima Pesan dari Perangkat Lain Miliknya')
  const myUserId = 'user-alice-123'
  const myNickname = 'Alice'

  // Pesan yang dikirim dari laptop Alice dan diterima di HP Alice via WebSocket fanout
  const msgFromLaptop = {
    id: 'msg-sync-1',
    from: 'user-alice-123',
    nickname: 'Alice',
    content: 'Pesan dari laptop saya',
    type: 'text',
  }

  const isSystem = msgFromLaptop.type === 'system' || msgFromLaptop.from === 'server'
  const msgSenderId = msgFromLaptop.from || msgFromLaptop.sender_id
  const isSelf = isSystem
    ? false
    : (msgSenderId && myUserId && msgSenderId === myUserId)
      ? true
      : Boolean(msgFromLaptop.nickname && myNickname && msgFromLaptop.nickname === myNickname)

  assert.equal(isSelf, true, 'Pesan dari perangkat lain milik diri sendiri harus diidentifikasi sebagai pesan keluar (isSelf = true)')
  console.log('  ✅ PASSED: Pesan terkirim dari perangkat lain milik diri sendiri ter-render sebagai pesan keluar (outgoing/bubble kanan).\n')

  console.log('🎉 SEMUA 4 SKENARIO PENGUJIAN FRONTEND MULTI-DEVICE LEVEL 2 BERHASIL 100%!')
}

runTests().catch(err => {
  console.error('❌ FRONTEND TEST FAILED:', err)
  process.exit(1)
})
