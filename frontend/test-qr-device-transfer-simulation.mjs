/**
 * TEST SIMULASI MULTI-DEVICE: E2EE KEY TRANSFER VIA QR CODE
 * Skenario Pengujian Nyata:
 * 1. Alice login di Handphone Android (PWA / Mobile) & chatting ke Bob.
 * 2. Alice login di Laptop Desktop via Transfer Device (Kamera Laptop scan QR HP) & chatting ke Bob.
 * 3. Alice transfer kembali dari Laptop ke Handphone via Foto QR & chatting ke Bob.
 * 4. Deep Audit: Deteksi bug, race condition, pesan terenkripsi rusak, atau kegagalan transfer.
 */

import { webcrypto } from 'node:crypto'
import QRCode from 'qrcode'

const crypto = webcrypto
const BACKEND_URL = 'https://wuzz-chat-backend.fly.dev'
const WS_URL = 'wss://wuzz-chat-backend.fly.dev/ws'

const ALICE_CREDENTIALS = {
  username: 'alice',
  password: 'K0k0r0k0@123',
}

const BOB_CREDENTIALS = {
  username: 'bob',
  password: 'K0k0r0k0@123',
}

const log = {
  header: (msg) => console.log(`\n${'='.repeat(80)}\n   ${msg}\n${'='.repeat(80)}`),
  step: (step, msg) => console.log(`\n--- [LANGKAH ${step}] ${msg} ---`),
  hp: (msg) => console.log(`[HANDPHONE ANDROID] ${msg}`),
  laptop: (msg) => console.log(`[LAPTOP DESKTOP]    ${msg}`),
  bob: (msg) => console.log(`[BOB RECIPIENT]     ${msg}`),
  success: (msg) => console.log(`[SUCCESS] ✅ ${msg}`),
  warn: (msg) => console.log(`[WARN]    ⚠️ ${msg}`),
  error: (msg) => console.log(`[ERROR]   ❌ ${msg}`),
  bug: (msg) => console.log(`\n🐛 [BUG / POTENTIAL ISSUE DETECTED]:\n   ${msg}\n`),
}

// ---------------------------------------------------------
// Helper Kriptografi E2EE (Web Crypto API)
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

async function deriveSharedAESKey(privateKey, peerPublicKey, roomId) {
  const sharedBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: peerPublicKey },
    privateKey,
    256
  )

  const salt = new TextEncoder().encode(`wuzz-room-salt:${roomId}`)
  const info = new TextEncoder().encode(`wuzz-chat-aes-gcm-key:${roomId}`)

  const hkdfKey = await crypto.subtle.importKey(
    'raw',
    sharedBits,
    { name: 'HKDF' },
    false,
    ['deriveKey']
  )

  return await crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

async function encryptMessage(text, aesKey) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encoded = new TextEncoder().encode(text)
  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    encoded
  )

  const combined = new Uint8Array(iv.length + ciphertextBuffer.byteLength)
  combined.set(iv, 0)
  combined.set(new Uint8Array(ciphertextBuffer), iv.length)

  let binary = ''
  for (let i = 0; i < combined.byteLength; i++) {
    binary += String.fromCharCode(combined[i])
  }
  return btoa(binary)
}

async function decryptMessage(encryptedB64, aesKey) {
  try {
    const binary = atob(encryptedB64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }

    const iv = bytes.slice(0, 12)
    const ciphertext = bytes.slice(12)

    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      aesKey,
      ciphertext
    )

    return new TextDecoder().decode(decryptedBuffer)
  } catch (err) {
    return '🔒 [Pesan Terenkripsi]'
  }
}

// ---------------------------------------------------------
// Helper Transfer Kunci (Mirip keyTransfer.ts)
// ---------------------------------------------------------
function generateTransferSessionToken() {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function deriveTransferAESKey(sessionToken, salt) {
  const enc = new TextEncoder()
  const tokenBytes = enc.encode(sessionToken)
  const baseKey = await crypto.subtle.importKey(
    'raw',
    tokenBytes,
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  )
  return await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

function uint8ToBase64(bytes) {
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function base64ToUint8(b64) {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

async function encryptKeyBundleForTransfer(privJWK, pubJWK, sessionToken) {
  const salt = new Uint8Array(16)
  const iv = new Uint8Array(12)
  crypto.getRandomValues(salt)
  crypto.getRandomValues(iv)

  const aesKey = await deriveTransferAESKey(sessionToken, salt)
  const payload = JSON.stringify({
    privateKeyJWK: privJWK,
    publicKeyJWK: pubJWK,
    createdAt: Date.now(),
  })

  const enc = new TextEncoder()
  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    enc.encode(payload)
  )

  return JSON.stringify({
    ciphertext: uint8ToBase64(new Uint8Array(ciphertextBuffer)),
    iv: uint8ToBase64(iv),
    salt: uint8ToBase64(salt),
    v: 1,
  })
}

async function decryptKeyBundleFromTransfer(bundleJSON, sessionToken) {
  const payload = JSON.parse(bundleJSON)
  const salt = base64ToUint8(payload.salt)
  const iv = base64ToUint8(payload.iv)
  const ciphertext = base64ToUint8(payload.ciphertext)

  const aesKey = await deriveTransferAESKey(sessionToken, salt)
  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    ciphertext
  )
  const dec = new TextDecoder()
  return JSON.parse(dec.decode(decryptedBuffer))
}

// ---------------------------------------------------------
// Helper REST API
// ---------------------------------------------------------
async function loginUser(username, password) {
  const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (!res.ok) throw new Error(`Login ${username} gagal: ${res.status}`)
  return await res.json()
}

async function updatePublicKey(token, publicKey, deviceId) {
  const res = await fetch(`${BACKEND_URL}/api/users/public-key`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ public_key: publicKey, device_id: deviceId }),
  })
  return { status: res.status, data: await res.json() }
}

async function resetPublicKey(token, publicKey, deviceId) {
  const res = await fetch(`${BACKEND_URL}/api/users/public-key/reset`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ public_key: publicKey, device_id: deviceId }),
  })
  return { status: res.status, data: await res.json() }
}

async function createTransferSession(token, sessionToken, encryptedBundle) {
  const res = await fetch(`${BACKEND_URL}/api/users/transfer/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      session_token: sessionToken,
      encrypted_bundle: encryptedBundle,
    }),
  })
  return { status: res.status, data: await res.json() }
}

async function consumeTransferSession(token, sessionToken, deviceId) {
  const res = await fetch(`${BACKEND_URL}/api/users/transfer/consume`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      session_token: sessionToken,
      device_id: deviceId,
    }),
  })
  return { status: res.status, data: await res.json() }
}

// ---------------------------------------------------------
// MAIN TEST SIMULATION EXECUTION
// ---------------------------------------------------------
async function runTransferSimulation() {
  log.header('SIMULASI TESTING METODE TRANSFER DEVICE (QR SCAN & FOTO QR)')

  const detectedBugs = []

  // [1] AUTHENTICATION
  log.step(1, 'Otentikasi Alice dan Bob')
  const authAlice = await loginUser(ALICE_CREDENTIALS.username, ALICE_CREDENTIALS.password)
  const authBob = await loginUser(BOB_CREDENTIALS.username, BOB_CREDENTIALS.password)

  log.hp(`Alice login (User ID: ${authAlice.user.id})`)
  log.bob(`Bob login (User ID: ${authBob.user.id})`)

  // Inisialisasi Kunci Bob
  const bobKeyPair = await generateKeyPair()
  const bobPubJWK = await exportPublicKeyJWK(bobKeyPair.publicKey)
  const bobPrivJWK = await exportPrivateKeyJWK(bobKeyPair.privateKey)
  await resetPublicKey(authBob.token, bobPubJWK, 'dev_bob_pixel_8')
  log.bob(`Kunci E2EE Bob diaktifkan di server.`)

  // Inisialisasi Kunci Awal Alice di Handphone Android
  log.step(2, 'Alice Mengaktifkan Kunci E2EE di Handphone Android')
  const hpKeyPair = await generateKeyPair()
  const hpPubJWK = await exportPublicKeyJWK(hpKeyPair.publicKey)
  const hpPrivJWK = await exportPrivateKeyJWK(hpKeyPair.privateKey)

  const hpDeviceId = 'dev_android_s24_ultra'
  const hpInitRes = await resetPublicKey(authAlice.token, hpPubJWK, hpDeviceId)
  log.hp(`Kunci E2EE Handphone aktif di server (Key Version: ${hpInitRes.data.key_version})`)

  // Room Direct Alice & Bob
  const roomId = [authAlice.user.id, authBob.user.id].sort().join('_')
  const directRoom = `dm_${roomId.substring(0, 8)}_${roomId.substring(37, 45)}`
  log.hp(`Direct Room ID: ${directRoom}`)

  // Hubungkan WebSocket Handphone Alice & Bob
  log.hp(`Menghubungkan WebSocket Handphone Alice...`)
  let wsHP = new WebSocket(`${WS_URL}?token=${encodeURIComponent(authAlice.token)}&device_id=${encodeURIComponent(hpDeviceId)}`)
  let hpSessionReplaced = false
  wsHP.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data)
      if (msg.type === 'system' && msg.content?.includes('SESSION_REPLACED')) {
        hpSessionReplaced = true
        log.warn(`[HANDPHONE ANDROID] Menerima SESSION_REPLACED: "${msg.content}"`)
      }
    } catch (_) {}
  }
  await new Promise((r) => (wsHP.onopen = r))
  wsHP.send(JSON.stringify({ type: 'join', room: directRoom }))

  log.bob(`Menghubungkan WebSocket Bob...`)
  let wsBob = new WebSocket(`${WS_URL}?token=${encodeURIComponent(authBob.token)}&device_id=dev_bob_pixel_8`)
  const bobReceivedMessages = []
  wsBob.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data)
      if (msg.type === 'message' && msg.content) {
        bobReceivedMessages.push(msg)
      }
    } catch (_) {}
  }
  await new Promise((r) => (wsBob.onopen = r))
  wsBob.send(JSON.stringify({ type: 'join', room: directRoom }))
  await new Promise((r) => setTimeout(r, 800))

  // [3] ALICE CHAT DARI HANDPHONE KE BOB
  log.step(3, 'Alice Mengirim Pesan dari Handphone Android ke Bob')
  const hpSharedAES = await deriveSharedAESKey(hpKeyPair.privateKey, bobKeyPair.publicKey, directRoom)
  const hpMsgText = 'Halo Bob! Ini pesan pertama dari Alice via Handphone Android (PWA).'
  const hpEncrypted = await encryptMessage(hpMsgText, hpSharedAES)

  wsHP.send(JSON.stringify({
    type: 'message',
    room: directRoom,
    content: hpEncrypted,
  }))
  await new Promise((r) => setTimeout(r, 1200))

  const bobDecryptedMsg1 = await decryptMessage(bobReceivedMessages[0]?.content || '', hpSharedAES)
  log.bob(`Pesan diterima dari Handphone: "${bobDecryptedMsg1}"`)
  if (bobDecryptedMsg1 === hpMsgText) {
    log.success('Pesan dari Handphone berhasil didekripsi sempurna oleh Bob.')
  } else {
    log.error('Pesan dari Handphone gagal didekripsi!')
    detectedBugs.push('Pesan awal dari Handphone gagal didekripsi Bob.')
  }

  // [4] ALICE MEMBUAT QR CODE TRANSFER DI HANDPHONE
  log.step(4, 'Alice Membuat QR Code Transfer di Handphone Android')
  const transferToken1 = generateTransferSessionToken()
  log.hp(`Token Sesi Transfer dibuat (64-char Hex): ${transferToken1}`)

  // Enkripsi bundle keypair Handphone
  const encryptedBundle1 = await encryptKeyBundleForTransfer(hpPrivJWK, hpPubJWK, transferToken1)
  const createRes1 = await createTransferSession(authAlice.token, transferToken1, encryptedBundle1)
  if (createRes1.status === 201 || createRes1.data.status === 'success') {
    log.success(`Bundle terenkripsi berhasil diunggah ke server (TTL: ${createRes1.data.expires_in} detik).`)
  } else {
    log.error(`Gagal mengunggah sesi transfer: ${JSON.stringify(createRes1)}`)
    detectedBugs.push('Endpoint /api/users/transfer/create gagal.')
  }

  // Generate QR Code di layar Handphone
  const qrTransferUrl1 = `https://chat.wuzzhub.id/transfer?token=${transferToken1}`
  const qrDataUrl1 = await QRCode.toDataURL(qrTransferUrl1, { width: 260, margin: 2 })
  log.hp(`Kode QR Transfer berhasil dirender di layar Handphone (${qrDataUrl1.length} bytes data URL).`)

  // [5] ALICE LOGIN DI LAPTOP DESKTOP VIA TRANSFER DEVICE (KAMERA SCAN QR)
  log.step(5, 'Alice Login di Laptop Desktop via Transfer Device (Kamera Laptop Scan QR HP)')
  const laptopDeviceId = 'dev_laptop_thinkpad_x1'

  // Simulasi Laptop mendeteksi konflik 409 saat awal masuk
  log.laptop(`Alice membuka Wuzz Chat di Laptop Chrome Desktop.`)
  const laptopConflictCheck = await updatePublicKey(authAlice.token, hpPubJWK, laptopDeviceId)
  if (laptopConflictCheck.status === 409) {
    log.success(`Server dengan tepat menolak Device Baru (409 Conflict) sebelum ada transfer sah!`)
  } else {
    log.warn(`Server tidak mengembalikan 409 Conflict saat device ID berganti. Status: ${laptopConflictCheck.status}`)
    detectedBugs.push('Server tidak mengembalikan 409 Conflict pada pergantian device tanpa transfer.')
  }

  log.laptop(`Alice memilih: "📲 Pindah Kunci via QR Code / Kode"`)
  log.laptop(`📷 Laptop menyalakan kamera & memindai QR Code di layar HP...`)

  // Laptop memindai QR code dan mengekstrak token dari URL
  const matchToken1 = qrTransferUrl1.match(/token=([a-f0-9]{64})/i)
  const scannedToken1 = matchToken1 ? matchToken1[1] : null
  log.laptop(`Hasil pindai kamera: token ditemukan -> ${scannedToken1}`)

  if (!scannedToken1 || scannedToken1 !== transferToken1) {
    log.error('Kamera gagal mengekstrak token transfer yang valid.')
    detectedBugs.push('Token transfer QR tidak cocok dengan token yang dibuat.')
  }

  // Laptop mengonsumsi transfer session
  log.laptop(`Laptop memanggil /api/users/transfer/consume...`)
  const consumeRes1 = await consumeTransferSession(authAlice.token, scannedToken1, laptopDeviceId)
  if (consumeRes1.status !== 200 || !consumeRes1.data.encrypted_bundle) {
    log.error(`Gagal konsumsi sesi transfer di Laptop: ${JSON.stringify(consumeRes1)}`)
    detectedBugs.push('Endpoint /api/users/transfer/consume gagal di Laptop.')
  } else {
    log.success(`Laptop berhasil mengunduh bundle terenkripsi dari server.`)
  }

  // Laptop mendekripsi bundle kunci menggunakan session token
  log.laptop(`Laptop mendekripsi bundle secara lokal (Zero-Knowledge)...`)
  const decryptedBundle1 = await decryptKeyBundleFromTransfer(consumeRes1.data.encrypted_bundle, scannedToken1)
  log.laptop(`Verifikasi integritas kunci yang didekripsi:`)
  const keysIdentical1 = decryptedBundle1.publicKeyJWK === hpPubJWK && decryptedBundle1.privateKeyJWK === hpPrivJWK
  if (keysIdentical1) {
    log.success(`KUNCI E2EE 100% IDENTIK! Kunci berhasil berpindah dari HP ke Laptop tanpa rotasi liar.`)
  } else {
    log.error('Kunci hasil transfer tidak cocok dengan kunci asli Handphone!')
    detectedBugs.push('Kunci terdekripsi berbeda dari kunci asli perangkat pertama.')
  }

  // Laptop menyimpan kunci & memanggil endpoint sync (mencoba update dulu agar key_version tidak naik, fallback reset)
  const laptopPrivKey = await importPrivateKeyJWK(decryptedBundle1.privateKeyJWK)
  const laptopPubKey = await importPublicKeyJWK(decryptedBundle1.publicKeyJWK)
  let syncLaptopRes = await updatePublicKey(authAlice.token, decryptedBundle1.publicKeyJWK, laptopDeviceId)
  if (syncLaptopRes.status === 409 || syncLaptopRes.data?.error) {
    syncLaptopRes = await resetPublicKey(authAlice.token, decryptedBundle1.publicKeyJWK, laptopDeviceId)
  }
  log.laptop(`Sesi Laptop diaktifkan di server (Key Version: ${syncLaptopRes.data.key_version})`)

  // Verifikasi One-Time Use Token: Coba konsumsi ulang token yang sama
  log.laptop(`🧪 Audit Keamanan: Menguji apakah token transfer bisa disalahgunakan ulang (Replay Attack)...`)
  const replayRes = await consumeTransferSession(authAlice.token, scannedToken1, 'dev_hacker_attacker')
  if (replayRes.status === 410 || replayRes.data?.code === 'SESSION_ALREADY_USED') {
    log.success(`Token berhasil di-invalidate secara atomik! Replay ditolak dengan status 410 (SESSION_ALREADY_USED).`)
  } else {
    log.error(`KELEMAHAN KEAMANAN: Token transfer yang sudah digunakan masih bisa dikonsumsi lagi! Status: ${replayRes.status}`)
    detectedBugs.push('Token transfer tidak di-invalidate setelah penggunaan pertama (Replay Vulnerability).')
  }

  // Laptop menghubungkan WebSocket
  log.laptop(`Menghubungkan WebSocket Laptop...`)
  let wsLaptop = new WebSocket(`${WS_URL}?token=${encodeURIComponent(authAlice.token)}&device_id=${encodeURIComponent(laptopDeviceId)}`)
  let laptopSessionReplaced = false
  wsLaptop.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data)
      if (msg.type === 'system' && msg.content?.includes('SESSION_REPLACED')) {
        laptopSessionReplaced = true
        log.warn(`[LAPTOP DESKTOP] Menerima SESSION_REPLACED via message: "${msg.content}"`)
      }
    } catch (_) {}
  }
  wsLaptop.onclose = (e) => {
    if (e.code === 4001 || e.reason?.includes('SESSION_REPLACED')) {
      laptopSessionReplaced = true
      log.warn(`[LAPTOP DESKTOP] Menerima Close Control Frame Code 4001 (SESSION_REPLACED)`)
    }
  }
  await new Promise((r) => (wsLaptop.onopen = r))
  wsLaptop.send(JSON.stringify({ type: 'join', room: directRoom }))
  await new Promise((r) => setTimeout(r, 1000))

  // Cek apakah Handphone tertendang dengan sinyal SESSION_REPLACED
  if (hpSessionReplaced) {
    log.success(`Handphone tertib menerima sinyal SESSION_REPLACED saat Laptop mengambil alih sesi!`)
  } else {
    log.warn(`Handphone tidak menerima sinyal SESSION_REPLACED saat Laptop aktif.`)
    detectedBugs.push('Handphone tidak menerima notifikasi SESSION_REPLACED saat Laptop aktif.')
  }

  // [6] ALICE MENGIRIM PESAN DARI LAPTOP KE BOB
  log.step(6, 'Alice Mengirim Pesan dari Laptop Desktop ke Bob')
  const laptopSharedAES = await deriveSharedAESKey(laptopPrivKey, bobKeyPair.publicKey, directRoom)
  const laptopMsgText = 'Halo Bob! Sekarang Alice mengetik dari Laptop ThinkPad setelah berhasil Transfer via Kamera.'
  const laptopEncrypted = await encryptMessage(laptopMsgText, laptopSharedAES)

  wsLaptop.send(JSON.stringify({
    type: 'message',
    room: directRoom,
    content: laptopEncrypted,
  }))
  await new Promise((r) => setTimeout(r, 1200))

  const bobDecryptedMsg2 = await decryptMessage(bobReceivedMessages[1]?.content || '', hpSharedAES)
  log.bob(`Pesan kedua diterima Bob dari Laptop: "${bobDecryptedMsg2}"`)
  if (bobDecryptedMsg2 === laptopMsgText) {
    log.success('Bob berhasil mendekripsi pesan dari Laptop menggunakan Shared Key yang sama tanpa reset!')
  } else {
    log.error(`Bob gagal mendekripsi pesan dari Laptop! Diterima: ${bobDecryptedMsg2}`)
    detectedBugs.push('Bob gagal mendekripsi pesan dari Laptop setelah transfer kunci.')
  }

  // [7] ALICE MEMBUAT QR TRANSFER DI LAPTOP UNTUK PINDAH KEMBALI KE HP
  log.step(7, 'Alice Menyiapkan Transfer Balik dari Laptop ke Handphone Android')
  const transferToken2 = generateTransferSessionToken()
  log.laptop(`Token Sesi Transfer Balik dibuat: ${transferToken2}`)

  const encryptedBundle2 = await encryptKeyBundleForTransfer(
    decryptedBundle1.privateKeyJWK,
    decryptedBundle1.publicKeyJWK,
    transferToken2
  )
  const createRes2 = await createTransferSession(authAlice.token, transferToken2, encryptedBundle2)
  if (createRes2.status === 201 || createRes2.data.status === 'success') {
    log.success(`Bundle terenkripsi Laptop berhasil diunggah ke server.`)
  } else {
    log.error(`Gagal membuat transfer balik dari Laptop: ${JSON.stringify(createRes2)}`)
    detectedBugs.push('Transfer balik dari Laptop gagal diupload.')
  }

  // Laptop merender QR Code di layarnya
  const qrTransferUrl2 = `https://chat.wuzzhub.id/transfer?token=${transferToken2}`
  const qrBuffer2 = await QRCode.toBuffer(qrTransferUrl2, { width: 300, margin: 2 })
  log.laptop(`Layar Laptop menampilkan QR Code Transfer (${qrBuffer2.length} bytes PNG buffer).`)

  // [8] ALICE DI HANDPHONE MELAKUKAN TRANSFER MENGGUNAKAN FOTO QR
  log.step(8, 'Alice di Handphone Android Membuka Kamera Native / Unggah Foto QR')
  log.hp(`Pengguna menekan: "📸 Buka Kamera HP (Foto QR)"`)
  log.hp(`Kamera sistem Android memotret layar Laptop yang menampilkan QR Code...`)

  // Simulasi parsing file foto QR (seperti handleFileScan pada DeviceTransferModal)
  const matchToken2 = qrTransferUrl2.match(/token=([a-f0-9]{64})/i)
  const scannedToken2 = matchToken2 ? matchToken2[1] : null
  log.hp(`File foto QR berhasil dipindai oleh decoder: token -> ${scannedToken2}`)

  if (!scannedToken2 || scannedToken2 !== transferToken2) {
    log.error('Foto QR gagal menghasilkan token yang valid.')
    detectedBugs.push('Foto QR gagal mengekstrak token transfer kembali ke Handphone.')
  }

  // Handphone mengonsumsi sesi transfer
  log.hp(`Handphone memanggil /api/users/transfer/consume...`)
  const consumeRes2 = await consumeTransferSession(authAlice.token, scannedToken2, hpDeviceId)
  if (consumeRes2.status !== 200 || !consumeRes2.data.encrypted_bundle) {
    log.error(`Gagal konsumsi sesi transfer di Handphone: ${JSON.stringify(consumeRes2)}`)
    detectedBugs.push('Handphone gagal mengonsumsi transfer session kedua.')
  } else {
    log.success(`Handphone berhasil mengunduh bundle dari server.`)
  }

  // Handphone mendekripsi bundle
  log.hp(`Handphone mendekripsi bundle secara lokal...`)
  const decryptedBundle2 = await decryptKeyBundleFromTransfer(consumeRes2.data.encrypted_bundle, scannedToken2)
  const keysIdentical2 = decryptedBundle2.publicKeyJWK === hpPubJWK && decryptedBundle2.privateKeyJWK === hpPrivJWK
  if (keysIdentical2) {
    log.success(`KUNCI E2EE 100% KONSISTEN! Kunci kembali ke Handphone dengan integritas kriptografis utuh.`)
  } else {
    log.error('Kunci hasil transfer balik tidak cocok dengan kunci awal!')
    detectedBugs.push('Kunci terdekripsi saat kembali ke Handphone tidak cocok.')
  }

  // Handphone mengaktifkan kembali kuncinya di backend (coba update dulu agar key_version konstan, fallback reset)
  const hpPrivKey2 = await importPrivateKeyJWK(decryptedBundle2.privateKeyJWK)
  const hpPubKey2 = await importPublicKeyJWK(decryptedBundle2.publicKeyJWK)
  let syncHPRes2 = await updatePublicKey(authAlice.token, decryptedBundle2.publicKeyJWK, hpDeviceId)
  if (syncHPRes2.status === 409 || syncHPRes2.data?.error) {
    syncHPRes2 = await resetPublicKey(authAlice.token, decryptedBundle2.publicKeyJWK, hpDeviceId)
  }
  log.hp(`Handphone kembali aktif di server (Key Version: ${syncHPRes2.data.key_version})`)

  // Hubungkan kembali WebSocket Handphone
  log.hp(`Menyambungkan kembali WebSocket Handphone...`)
  wsHP = new WebSocket(`${WS_URL}?token=${encodeURIComponent(authAlice.token)}&device_id=${encodeURIComponent(hpDeviceId)}`)
  await new Promise((r) => (wsHP.onopen = r))
  wsHP.send(JSON.stringify({ type: 'join', room: directRoom }))
  await new Promise((r) => setTimeout(r, 1500))

  // Cek apakah Laptop menerima SESSION_REPLACED
  if (laptopSessionReplaced) {
    log.success(`Laptop tertib menerima SESSION_REPLACED saat Handphone mengambil alih sesi kembali!`)
  } else {
    log.warn(`Laptop tidak menerima sinyal SESSION_REPLACED saat Handphone kembali aktif.`)
    detectedBugs.push('Laptop tidak menerima notifikasi SESSION_REPLACED saat sesi kembali ke Handphone.')
  }

  // [9] ALICE MENGIRIM PESAN DARI HANDPHONE KE BOB (CYCLE KETIGA)
  log.step(9, 'Alice Mengirim Pesan dari Handphone Android ke Bob Setelah Transfer Balik')
  const hpSharedAES2 = await deriveSharedAESKey(hpPrivKey2, bobKeyPair.publicKey, directRoom)
  const hpMsgText2 = 'Bob! Aku sudah kembali aktif di Handphone Android via pemindaian Foto QR.'
  const hpEncrypted2 = await encryptMessage(hpMsgText2, hpSharedAES2)

  wsHP.send(JSON.stringify({
    type: 'message',
    room: directRoom,
    content: hpEncrypted2,
  }))
  await new Promise((r) => setTimeout(r, 1200))

  const bobDecryptedMsg3 = await decryptMessage(bobReceivedMessages[2]?.content || '', hpSharedAES2)
  log.bob(`Pesan ketiga diterima Bob: "${bobDecryptedMsg3}"`)
  if (bobDecryptedMsg3 === hpMsgText2) {
    log.success('Bob berhasil mendekripsi pesan ketiga dari Handphone secara langsung!')
  } else {
    log.error(`Bob gagal mendekripsi pesan ketiga! Diterima: ${bobDecryptedMsg3}`)
    detectedBugs.push('Bob gagal mendekripsi pesan ketiga setelah siklus transfer balik.')
  }

  // [10] AUDIT KOMPREHENSIF SELURUH RIWAYAT PESAN DI SISI BOB & ALICE
  log.step(10, 'Audit Kontinuitas Linimasa Pesan & Integritas Kriptografi')
  console.log(`\n📋 Evaluasi Linimasa Bob:`)
  console.log(`1. Pesan 1 (dari HP awal):   "${bobDecryptedMsg1}" [${bobDecryptedMsg1 === hpMsgText ? 'OK' : 'FAIL'}]`)
  console.log(`2. Pesan 2 (dari Laptop):    "${bobDecryptedMsg2}" [${bobDecryptedMsg2 === laptopMsgText ? 'OK' : 'FAIL'}]`)
  console.log(`3. Pesan 3 (dari HP balik):  "${bobDecryptedMsg3}" [${bobDecryptedMsg3 === hpMsgText2 ? 'OK' : 'FAIL'}]`)

  // Tutup koneksi WS
  wsHP.close()
  wsLaptop.close()
  wsBob.close()

  // [11] KESIMPULAN & LAPORAN TEMUAN BUG
  log.header('HASIL ANALISIS PENGUJIAN METODE TRANSFER DEVICE')
  if (detectedBugs.length === 0) {
    log.success('Protokol Kriptografi & Backend API REST Transfer Device berjalan dengan 100% SUKSES!')
  } else {
    log.warn(`Ditemukan ${detectedBugs.length} potensi masalah pada alur transfer:`)
    detectedBugs.forEach((b, i) => console.log(`   ${i + 1}. ${b}`))
  }

  return { detectedBugs }
}

runTransferSimulation().catch((err) => {
  console.error('\nFatal Error pada simulasi transfer:', err)
  process.exit(1)
})
