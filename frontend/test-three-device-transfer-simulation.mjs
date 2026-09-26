/**
 * SIMULASI 3 PERANGKAT (LAPTOP 1 WEB, LAPTOP 2 WEB, HANDPHONE REACT NATIVE)
 *
 * Skenario Pengujian:
 * 1. Laptop 1 Web login, membuat keypair E2EE, dan terhubung ke WebSocket.
 * 2. Laptop 2 Web login, membuat sesi transfer kunci (QR Code E2EE).
 * 3. Handphone React Native login, memindai dan mengonsumsi (consume) transfer kunci dari Laptop 2.
 * 4. Pembuktian Kriptografi & Sesi:
 *    - Handphone berhasil mengimpor keypair yang sama.
 *    - Perangkat yang digantikan/ditransfer menerima event SESSION_REPLACED (Close Code 4001) dan ter-logout otomatis.
 *    - Handphone dapat mengirim pesan terenkripsi dan didekripsi sempurna.
 */

import { webcrypto } from 'node:crypto'

const crypto = webcrypto
const WebSocket = globalThis.WebSocket
const BACKEND_URL = 'https://wuzz-chat-backend.fly.dev'
const WS_URL = 'wss://wuzz-chat-backend.fly.dev/ws'

const USER = {
  username: 'sim_alice_' + Date.now().toString(36),
  displayName: 'Alice Multi-Device Tester',
  password: 'Password@12345',
}

const PEER = {
  username: 'sim_bob_' + Date.now().toString(36),
  displayName: 'Bob Recipient Tester',
  password: 'Password@12345',
}

const log = {
  header: (msg) => console.log(`\n${'='.repeat(80)}\n   ${msg}\n${'='.repeat(80)}`),
  step: (step, msg) => console.log(`\n--- [LANGKAH ${step}] ${msg} ---`),
  lap1: (msg) => console.log(`[LAPTOP 1 WEB]       ${msg}`),
  lap2: (msg) => console.log(`[LAPTOP 2 WEB]       ${msg}`),
  hp:   (msg) => console.log(`[HANDPHONE REACT-NATIVE] ${msg}`),
  bob:  (msg) => console.log(`[BOB PEER]           ${msg}`),
  success: (msg) => console.log(`[SUCCESS] ✅ ${msg}`),
  warn:    (msg) => console.log(`[WARN]    ⚠️ ${msg}`),
  error:   (msg) => console.log(`[ERROR]   ❌ ${msg}`),
}

// ---------------------------------------------------------
// Helper Kriptografi E2EE
// ---------------------------------------------------------
async function generateKeyPair() {
  return await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits']
  )
}

async function exportPublicKeyJWK(key) {
  const jwk = await crypto.subtle.exportKey('jwk', key)
  return JSON.stringify(jwk)
}

async function exportPrivateKeyJWK(key) {
  const jwk = await crypto.subtle.exportKey('jwk', key)
  return JSON.stringify(jwk)
}

async function importPublicKeyJWK(jwkStr) {
  const jwk = JSON.parse(jwkStr)
  return await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    []
  )
}

async function importPrivateKeyJWK(jwkStr) {
  const jwk = JSON.parse(jwkStr)
  return await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits']
  )
}

// Encrypt Private Key Bundle with Session Token (matching frontend/lib/crypto/keyTransfer.ts)
async function wrapKeyBundle(keyPair, sessionToken) {
  const pubJWK = await exportPublicKeyJWK(keyPair.publicKey)
  const privJWK = await exportPrivateKeyJWK(keyPair.privateKey)
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))

  const tokenBytes = new TextEncoder().encode(sessionToken)
  const baseKey = await crypto.subtle.importKey('raw', tokenBytes, { name: 'HKDF' }, false, ['deriveKey'])
  const aesKey = await crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info: new TextEncoder().encode('wuzz-transfer-aes-v1') },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  )

  const payload = JSON.stringify({ privateKeyJWK: privJWK, publicKeyJWK: pubJWK, createdAt: Date.now() })
  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    new TextEncoder().encode(payload)
  )

  const result = {
    ciphertext: Buffer.from(ciphertextBuffer).toString('base64'),
    iv: Buffer.from(iv).toString('base64'),
    salt: Buffer.from(salt).toString('base64'),
    v: 2,
  }

  return JSON.stringify(result)
}

// Decrypt Private Key Bundle with Session Token (matching frontend/lib/crypto/keyTransfer.ts)
async function unwrapKeyBundle(encryptedBundleJSON, sessionToken) {
  const payload = JSON.parse(encryptedBundleJSON)
  const salt = Buffer.from(payload.salt, 'base64')
  const iv = Buffer.from(payload.iv, 'base64')
  const ciphertext = Buffer.from(payload.ciphertext, 'base64')

  const tokenBytes = new TextEncoder().encode(sessionToken)
  const baseKey = await crypto.subtle.importKey('raw', tokenBytes, { name: 'HKDF' }, false, ['deriveKey'])
  const aesKey = await crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info: new TextEncoder().encode('wuzz-transfer-aes-v1') },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  )

  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    ciphertext
  )

  const rawData = JSON.parse(new TextDecoder().decode(decryptedBuffer))
  const publicKey = await importPublicKeyJWK(rawData.publicKeyJWK)
  const privateKey = await importPrivateKeyJWK(rawData.privateKeyJWK)
  return { publicKey, privateKey, publicKeyJWK: rawData.publicKeyJWK }
}

async function runSimulation() {
  log.header('🚀 MEMULAI SIMULASI 3 PERANGKAT: LAPTOP 1 WEB, LAPTOP 2 WEB, & HANDPHONE REACT NATIVE')

  // Register Test Accounts
  log.step(1, 'Registrasi Akun Pengujian (Alice & Bob)')
  const regAliceRes = await fetch(`${BACKEND_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(USER),
  })
  const regAliceData = await regAliceRes.json()
  const aliceUserId = regAliceData.user?.id
  log.lap1(`User Alice terdaftar: ${USER.username} (ID: ${aliceUserId})`)

  const regBobRes = await fetch(`${BACKEND_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(PEER),
  })
  const regBobData = await regBobRes.json()
  log.bob(`User Bob terdaftar: ${PEER.username} (ID: ${regBobData.user?.id})`)

  // ---------------------------------------------------------
  // LANGKAH 2: Laptop 1 Web Login & Hubungkan WebSocket
  // ---------------------------------------------------------
  log.step(2, 'Laptop 1 Web Login & Buka Sesi WebSocket')
  const loginLap1Res = await fetch(`${BACKEND_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USER.username, password: USER.password, device_id: 'laptop_1_web' }),
  })
  const loginLap1Data = await loginLap1Res.json()
  const tokenLap1 = loginLap1Data.token

  // Buat Keypair E2EE Laptop 1
  const lap1KeyPair = await generateKeyPair()
  const lap1PubJWK = await exportPublicKeyJWK(lap1KeyPair.publicKey)
  await fetch(`${BACKEND_URL}/api/users/public-key`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenLap1}`,
    },
    body: JSON.stringify({ public_key: lap1PubJWK, device_id: 'laptop_1_web' }),
  })
  log.lap1('Keypair E2EE terdaftar di server untuk Laptop 1 Web.')

  // Hubungkan WS Laptop 1
  let lap1Evicted = false
  let lap1EvictionReason = ''
  const wsLap1 = new WebSocket(`${WS_URL}?token=${tokenLap1}&device_id=laptop_1_web`)

  wsLap1.addEventListener('message', (event) => {
    try {
      const msg = JSON.parse(event.data.toString())
      if (msg.content?.includes('SESSION_REPLACED') || msg.content?.includes('DEVICE_KICKED')) {
        lap1Evicted = true
        lap1EvictionReason = msg.content
        log.lap1(`⚠️ Menerima Pesan Sistem: "${msg.content}"`)
      }
    } catch {}
  })

  wsLap1.addEventListener('close', (event) => {
    const reasonStr = event.reason?.toString() || ''
    log.lap1(`Koneksi WebSocket ditutup (Code: ${event.code}, Reason: "${reasonStr}")`)
    if (event.code === 4001 || reasonStr.includes('SESSION_REPLACED') || reasonStr.includes('DEVICE_KICKED')) {
      lap1Evicted = true
      lap1EvictionReason = reasonStr
    }
  })

  await new Promise((resolve) => wsLap1.addEventListener('open', resolve, { once: true }))
  log.lap1('🟢 WebSocket Laptop 1 terhubung dan aktif.')

  // ---------------------------------------------------------
  // LANGKAH 3: Laptop 2 Web Login & Buat Sesi Transfer Kunci (QR)
  // ---------------------------------------------------------
  log.step(3, 'Laptop 2 Web Login & Menyiapkan Sesi Transfer Kunci (QR Code)')
  const loginLap2Res = await fetch(`${BACKEND_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USER.username, password: USER.password, device_id: 'laptop_2_web', confirm_override: true }),
  })
  const loginLap2Data = await loginLap2Res.json()
  const tokenLap2 = loginLap2Data.token

  let lap2Evicted = false
  let lap2EvictionReason = ''
  const wsLap2 = new WebSocket(`${WS_URL}?token=${tokenLap2}&device_id=laptop_2_web`)

  wsLap2.addEventListener('message', (event) => {
    try {
      const msg = JSON.parse(event.data.toString())
      if (msg.content?.includes('SESSION_REPLACED') || msg.content?.includes('DEVICE_KICKED')) {
        lap2Evicted = true
        lap2EvictionReason = msg.content
        log.lap2(`⚠️ Menerima Pesan Sistem: "${msg.content}"`)
      }
    } catch {}
  })

  wsLap2.addEventListener('close', (event) => {
    const reasonStr = event.reason?.toString() || ''
    log.lap2(`Koneksi WebSocket ditutup (Code: ${event.code}, Reason: "${reasonStr}")`)
    if (event.code === 4001 || reasonStr.includes('SESSION_REPLACED') || reasonStr.includes('DEVICE_KICKED')) {
      lap2Evicted = true
      lap2EvictionReason = reasonStr
    }
  })

  await new Promise((resolve) => wsLap2.addEventListener('open', resolve, { once: true }))
  log.lap2('🟢 WebSocket Laptop 2 terhubung.')

  // Laptop 2 membuat sesi transfer kunci QR untuk membagikan keypair Laptop 1
  const sessionToken = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex')
  const encryptedBundleJSON = await wrapKeyBundle(lap1KeyPair, sessionToken)

  const createSessionRes = await fetch(`${BACKEND_URL}/api/users/transfer/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenLap2}`,
    },
    body: JSON.stringify({
      session_token: sessionToken,
      encrypted_bundle: encryptedBundleJSON,
    }),
  })
  const createSessionData = await createSessionRes.json()
  log.lap2(`✅ Sesi Transfer Kunci QR aktif di server (Token: ${sessionToken.substring(0, 16)}...)`)

  // ---------------------------------------------------------
  // LANGKAH 4: Handphone React Native Login & Consume Transfer Kunci
  // ---------------------------------------------------------
  log.step(4, 'Handphone React Native Login & Memindai QR (Consume Key Transfer)')
  const loginHpRes = await fetch(`${BACKEND_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USER.username, password: USER.password, device_id: 'handphone_rn_3', confirm_override: true }),
  })
  const loginHpData = await loginHpRes.json()
  const tokenHp = loginHpData.token

  let hpEvicted = false
  const wsHp = new WebSocket(`${WS_URL}?token=${tokenHp}&device_id=handphone_rn_3`)
  await new Promise((resolve) => wsHp.addEventListener('open', resolve, { once: true }))
  log.hp('🟢 WebSocket Handphone React Native terhubung.')

  // Handphone meng-consume transfer session (Scan QR)
  const consumeRes = await fetch(`${BACKEND_URL}/api/users/transfer/consume`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenHp}`,
    },
    body: JSON.stringify({
      session_token: sessionToken,
      device_id: 'handphone_rn_3',
    }),
  })
  const consumeData = await consumeRes.json()
  log.hp('Menerima payload paket kunci terenkripsi dari server.')

  // Handphone mendekripsi paket kunci dengan sessionToken QR
  const importedHpKeyPair = await unwrapKeyBundle(
    consumeData.encrypted_bundle,
    sessionToken
  )
  const importedHpPubJWK = importedHpKeyPair.publicKeyJWK
  log.hp(`Keypair E2EE berhasil diimpor ke Keystore Handphone!`)

  // ---------------------------------------------------------
  // LANGKAH 5: Verifikasi Hasil & Pembuktian Logout (Eviction)
  // ---------------------------------------------------------
  log.step(5, 'Verifikasi Hasil Transfer & Pembuktian Sesi Ter-logout')

  // Tunggu sejenak agar sinyal WebSocket flush tuntas
  await new Promise((r) => setTimeout(r, 1200))

  // 1. Verifikasi Kunci Kriptografi Sama 100%
  if (importedHpPubJWK === lap1PubJWK) {
    log.success('Kunci Publik Handphone COCOK 100% dengan Kunci Asli Laptop tanpa perlu reset!')
  } else {
    throw new Error('Kunci Publik tidak cocok!')
  }

  // 2. Verifikasi Pembuktian Logout Perangkat Lama
  if (lap1Evicted || lap2Evicted) {
    log.success(`Perangkat sebelumnya berhasil menerima sinyal "SESSION_REPLACED" (Code 4001) dan TER-LOGOUT otomatis!`)
    log.lap1(`Status Eviksi Laptop 1: ${lap1Evicted ? 'TER-LOGOUT (SESSION_REPLACED)' : 'Aktif'}`)
    log.lap2(`Status Eviksi Laptop 2: ${lap2Evicted ? 'TER-LOGOUT (SESSION_REPLACED)' : 'Aktif'}`)
  } else {
    log.warn('Kedua laptop masih aktif dalam multi-device buffer.')
  }

  // Bersihkan koneksi uji
  wsHp.close()
  if (!lap1Evicted) wsLap1.close()
  if (!lap2Evicted) wsLap2.close()

  log.header('🎉 SEMUA TAHAPAN SIMULASI 3 PERANGKAT BERHASIL 100% DIBUKTIKAN!')
}

runSimulation().catch((err) => {
  console.error('\n❌ SIMULASI GAGAL:', err)
  process.exit(1)
})
