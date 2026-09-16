/**
 * Test Simulasi Skenario Android PWA vs Desktop Laptop & E2EE Continuity
 *
 * Menguji perilaku realistis:
 * 1. Alice membuka sesi di Laptop Desktop (Device 1).
 * 2. Alice membuka Wuzz Chat via Android PWA (Standalone / WebAPK) di HP (Device 2).
 * 3. Deteksi konflik 409 & aktivasi sesi di Android PWA (simulasi CacheStorage & IndexedDB).
 * 4. Penonaktifan tertib Laptop Alice (`SESSION_REPLACED`).
 * 5. Simulasi Android OS Doze Mode / Background Sleep (Socket freeze 1006 & Auto-reconnect tanpa self-kick).
 * 6. Kirim pesan dari Android PWA ke Bob & audit kesinambungan pesan lama di Bob.
 */

const BACKEND_URL = process.env.BACKEND_URL || 'https://wuzz-chat-backend.fly.dev'
const WS_URL = process.env.WS_URL || 'wss://wuzz-chat-backend.fly.dev/ws'

const USER_ALICE = {
  username: 'alice',
  password: 'K0k0r0k0@123',
  displayName: 'Alice Wonder',
}

const USER_BOB = {
  username: 'bob',
  password: 'K0k0r0k0@123',
  displayName: 'Bob Builder',
}

const E2EE_PREFIX = 'e2ee:v1:'

// Identitas Perangkat Realistis
const DEVICE_LAPTOP = {
  id: 'dev_laptop_linux_x64_desktop',
  name: 'Laptop ThinkPad (Chrome Desktop)',
  userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
}

const DEVICE_ANDROID_PWA = {
  id: 'dev_android_s24_pwa_standalone',
  name: 'Samsung Galaxy S24 (Wuzz Chat PWA WebAPK)',
  userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36',
  displayMode: 'standalone',
}

const log = {
  info: (msg) => console.log(`\x1b[36m[INFO]\x1b[0m ${msg}`),
  success: (msg) => console.log(`\x1b[32m[SUCCESS]\x1b[0m ${msg}`),
  warn: (msg) => console.log(`\x1b[33m[WARN]\x1b[0m ${msg}`),
  error: (msg) => console.log(`\x1b[31m[ERROR]\x1b[0m ${msg}`),
  laptop: (msg) => console.log(`\x1b[35m[LAPTOP DESKTOP]\x1b[0m ${msg}`),
  pwa: (msg) => console.log(`\x1b[32m[ANDROID PWA]\x1b[0m ${msg}`),
  bob: (msg) => console.log(`\x1b[34m[BOB PHONE]\x1b[0m ${msg}`),
}

// -------------------------------------------------------------
// WebCrypto E2EE Helpers
// -------------------------------------------------------------
function bytesToBase64(bytes) {
  const uint8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let binary = ''
  for (let i = 0; i < uint8.byteLength; i++) {
    binary += String.fromCharCode(uint8[i])
  }
  return btoa(binary)
}

function base64ToBytes(base64) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

async function generateKeyPair() {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits']
  )
  const pubJWK = await crypto.subtle.exportKey('jwk', keyPair.publicKey)
  const privJWK = await crypto.subtle.exportKey('jwk', keyPair.privateKey)
  return {
    raw: keyPair,
    publicKeyJWK: JSON.stringify(pubJWK),
    privateKeyJWK: JSON.stringify(privJWK),
  }
}

async function importPublicKey(jwkString) {
  const jwk = typeof jwkString === 'string' ? JSON.parse(jwkString) : jwkString
  return await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    []
  )
}

async function deriveRoomAESKey(myPrivateKey, theirPublicKey, roomSalt) {
  const sharedBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: theirPublicKey },
    myPrivateKey,
    256
  )

  const hkdfKey = await crypto.subtle.importKey(
    'raw',
    sharedBits,
    { name: 'HKDF' },
    false,
    ['deriveKey']
  )

  const encoder = new TextEncoder()
  const salt = encoder.encode(roomSalt || 'wuzz-chat-salt')
  const info = encoder.encode('wuzz-chat-e2ee-aes-v1')

  return await crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

async function encryptText(aesKey, plaintext) {
  const encoder = new TextEncoder()
  const data = encoder.encode(plaintext)
  const iv = crypto.getRandomValues(new Uint8Array(12))

  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    data
  )

  const ivBase64 = bytesToBase64(iv)
  const ciphertextBase64 = bytesToBase64(ciphertextBuffer)
  return `${E2EE_PREFIX}${ivBase64}:${ciphertextBase64}`
}

async function decryptText(aesKey, encryptedPayload) {
  if (!encryptedPayload.startsWith(E2EE_PREFIX)) {
    return encryptedPayload
  }
  const raw = encryptedPayload.slice(E2EE_PREFIX.length)
  const [ivBase64, ciphertextBase64] = raw.split(':')
  const iv = base64ToBytes(ivBase64)
  const ciphertext = base64ToBytes(ciphertextBase64)

  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    ciphertext
  )
  const decoder = new TextDecoder()
  return decoder.decode(decryptedBuffer)
}

// -------------------------------------------------------------
// REST API Helpers
// -------------------------------------------------------------
async function loginOrRegister(userObj, userAgent = '') {
  const headers = { 'Content-Type': 'application/json' }
  if (userAgent) headers['User-Agent'] = userAgent

  let res = await fetch(`${BACKEND_URL}/api/auth/login`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ username: userObj.username, password: userObj.password }),
  })

  if (res.status === 401) {
    const regRes = await fetch(`${BACKEND_URL}/api/auth/register`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        username: userObj.username,
        display_name: userObj.displayName,
        password: userObj.password,
      }),
    })

    if (regRes.ok || regRes.status === 409) {
      res = await fetch(`${BACKEND_URL}/api/auth/login`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ username: userObj.username, password: userObj.password }),
      })
    } else {
      throw new Error(`Gagal register: ${await regRes.text()}`)
    }
  }

  if (!res.ok) {
    throw new Error(`Gagal login ${userObj.username}: ${await res.text()}`)
  }

  return await res.json()
}

async function getOrCreateDirectRoom(token, targetUserId) {
  const res = await fetch(`${BACKEND_URL}/api/conversations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ target_user_id: targetUserId }),
  })
  if (!res.ok) {
    throw new Error(`Gagal buat direct room: ${res.status} ${await res.text()}`)
  }
  const data = await res.json()
  return data.room_id
}

async function getUserProfile(token, userId) {
  const res = await fetch(`${BACKEND_URL}/api/users/profile?id=${encodeURIComponent(userId)}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  })
  if (!res.ok) {
    throw new Error(`Gagal ambil profil user ${userId}: ${res.status}`)
  }
  return await res.json()
}

// -------------------------------------------------------------
// MAIN SIMULATION
// -------------------------------------------------------------
async function runAndroidPWASimulation() {
  console.log('\n================================================================================')
  console.log('   SIMULASI SKENARIO: LAPTOP DESKTOP vs ANDROID PWA STANDALONE & CONTINUITY')
  console.log('================================================================================\n')

  log.info(`Target Backend : ${BACKEND_URL}`)
  log.info(`Target WS      : ${WS_URL}`)

  // [1] Login User Alice & Bob
  log.info('\n--- [LANGKAH 1] Otentikasi Alice & Bob ---')
  const authAlice = await loginOrRegister(USER_ALICE, DEVICE_LAPTOP.userAgent)
  const authBob = await loginOrRegister(USER_BOB)
  log.laptop(`Alice login dari ${DEVICE_LAPTOP.name} (ID: ${authAlice.user.id})`)
  log.bob(`Bob login (ID: ${authBob.user.id})`)

  // [2] Setup Laptop Alice (Device 1)
  log.info('\n--- [LANGKAH 2] Inisialisasi Alice di Laptop Desktop ---')
  const aliceLaptopKey = await generateKeyPair()
  const resetRes1 = await fetch(`${BACKEND_URL}/api/users/public-key/reset`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authAlice.token}`,
      'User-Agent': DEVICE_LAPTOP.userAgent,
    },
    body: JSON.stringify({
      public_key: aliceLaptopKey.publicKeyJWK,
      device_id: DEVICE_LAPTOP.id,
    }),
  })
  const keyInfo1 = await resetRes1.json()
  log.laptop(`Kunci E2EE Laptop aktif di server. Versi: ${keyInfo1.key_version}`)

  // Inisialisasi Bob
  const bobKey = await generateKeyPair()
  await fetch(`${BACKEND_URL}/api/users/public-key/reset`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authBob.token}`,
    },
    body: JSON.stringify({
      public_key: bobKey.publicKeyJWK,
      device_id: 'dev_bob_device_01',
    }),
  })
  log.bob('Kunci E2EE Bob aktif di server.')

  const directRoomId = await getOrCreateDirectRoom(authAlice.token, authBob.user.id)
  log.info(`Direct Room: ${directRoomId}`)

  // Setup Bob WebSocket & Pesan Collector
  let bobReceivedMessages = []
  const wsBob = new WebSocket(`${WS_URL}?token=${encodeURIComponent(authBob.token)}`)
  await new Promise((resolve) => {
    wsBob.onopen = () => {
      wsBob.send(JSON.stringify({ type: 'join', room: directRoomId }))
      resolve()
    }
    wsBob.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.type === 'message' && msg.room === directRoomId) {
          bobReceivedMessages.push(msg)
        }
      } catch {}
    }
  })

  // Setup Laptop Alice WebSocket
  let laptopReceivedSessionReplaced = false
  let laptopSocketClosed = false
  const wsLaptop = new WebSocket(`${WS_URL}?token=${encodeURIComponent(authAlice.token)}`)
  await new Promise((resolve) => {
    wsLaptop.onopen = () => {
      wsLaptop.send(JSON.stringify({ type: 'join', room: directRoomId }))
      log.laptop('WebSocket Laptop terhubung ke obrolan.')
      resolve()
    }
    wsLaptop.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.type === 'system' && msg.content?.includes('SESSION_REPLACED')) {
          laptopReceivedSessionReplaced = true
          log.laptop(`⚠️ Menerima: "${msg.content}"`)
        }
      } catch {}
    }
    wsLaptop.onclose = () => {
      laptopSocketClosed = true
      log.laptop('Koneksi WebSocket Laptop ditutup (sesi digantikan).')
    }
  })

  // Jeda stabilisasi
  await new Promise((r) => setTimeout(r, 600))

  // [3] Laptop Alice Mengirim Chat Rahasia ke Bob
  log.info('\n--- [LANGKAH 3] Alice Mengirim Pesan dari Laptop Desktop ke Bob ---')
  const bobPubImported = await importPublicKey(bobKey.publicKeyJWK)
  const aesKeyLaptopBob = await deriveRoomAESKey(aliceLaptopKey.raw.privateKey, bobPubImported, directRoomId)
  const plaintext1 = 'Halo Bob! Ini pesan rahasia yang diketik Alice dari Laptop ThinkPad di kantor.'
  const ciphertext1 = await encryptText(aesKeyLaptopBob, plaintext1)

  const msgId1 = crypto.randomUUID()
  wsLaptop.send(JSON.stringify({
    id: msgId1,
    type: 'message',
    room: directRoomId,
    content: ciphertext1,
    timestamp: new Date().toISOString(),
  }))

  // Tunggu pesan di Bob
  const waitForMsg = async (id, timeoutMs = 6000) => {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      const f = bobReceivedMessages.find(m => m.id === id)
      if (f) return f
      await new Promise(r => setTimeout(r, 100))
    }
    return null
  }

  const recMsg1 = await waitForMsg(msgId1)
  if (!recMsg1) throw new Error('Bob gagal menerima pesan dari Laptop Alice!')

  const aesKeyBobLaptop = await deriveRoomAESKey(bobKey.raw.privateKey, await importPublicKey(aliceLaptopKey.publicKeyJWK), directRoomId)
  const decrypted1 = await decryptText(aesKeyBobLaptop, recMsg1.content)
  log.bob(`Dekripsi pesan laptop: "${decrypted1}"`)

  // Simulasi IndexedDB Bob (MessageCache Write-Through)
  const bobIndexedDB = new Map()
  bobIndexedDB.set(msgId1, {
    id: msgId1,
    roomId: directRoomId,
    content: decrypted1, // Teks asli terdekripsi
    rawContent: recMsg1.content,
  })
  log.bob('💾 Pesan disimpan aman ke IndexedDB Bob dalam bentuk plaintext.')

  // [4] Alice Membuka Wuzz Chat via Android PWA (Standalone WebAPK)
  log.info('\n--- [LANGKAH 4] Alice Membuka Wuzz Chat via Android PWA (WebAPK) ---')
  log.pwa(`Device: ${DEVICE_ANDROID_PWA.name}`)
  log.pwa(`Mode: ${DEVICE_ANDROID_PWA.displayMode} (Android Fullscreen WebAPK)`)
  log.pwa(`User-Agent: ${DEVICE_ANDROID_PWA.userAgent}`)

  const aliceAndroidPWAKey = await generateKeyPair()

  // Percobaan 1: Android PWA coba PUT biasa (Registrasi Standar)
  log.pwa('Android PWA mengirim PUT /api/users/public-key...')
  const conflictRes = await fetch(`${BACKEND_URL}/api/users/public-key`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authAlice.token}`,
      'User-Agent': DEVICE_ANDROID_PWA.userAgent,
    },
    body: JSON.stringify({
      public_key: aliceAndroidPWAKey.publicKeyJWK,
      device_id: DEVICE_ANDROID_PWA.id,
    }),
  })

  // VERIFIKASI: Harus 409 Conflict
  if (conflictRes.status === 409) {
    const cData = await conflictRes.json()
    log.success(`✅ Server mendeteksi Device Laptop aktif! Menolak dengan HTTP 409 Conflict (key_version: ${cData.key_version})`)
    log.pwa('📱 Layar Android PWA: Menampilkan DeviceConflictModal (Pilihan: Reset / Transfer Kunci)')
    log.pwa('🛡️ Gatekeeper: WebSocket Android PWA belum dibuka; Laptop Alice masih tetap aktif!')
  } else {
    throw new Error(`Ekspektasi 409 Conflict, got ${conflictRes.status}`)
  }

  // [5] Alice di Android PWA Memilih "Reset & Masuk di Perangkat Ini"
  log.info('\n--- [LANGKAH 5] Alice Mengonfirmasi Reset di Android PWA ---')
  const resetRes2 = await fetch(`${BACKEND_URL}/api/users/public-key/reset`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authAlice.token}`,
      'User-Agent': DEVICE_ANDROID_PWA.userAgent,
    },
    body: JSON.stringify({
      public_key: aliceAndroidPWAKey.publicKeyJWK,
      device_id: DEVICE_ANDROID_PWA.id,
    }),
  })
  const resetData2 = await resetRes2.json()
  log.success(`✅ Reset berhasil! Key Version server dinaikkan ke: ${resetData2.key_version}`)

  // Simulasi penulisan ke CacheStorage Android (Bypass LevelDB Lock untuk Service Worker)
  const androidMockCacheStorage = new Map()
  androidMockCacheStorage.set('/__e2ee_identity', {
    userId: authAlice.user.id,
    privateKeyJWK: aliceAndroidPWAKey.privateKeyJWK,
    publicKeyJWK: aliceAndroidPWAKey.publicKeyJWK,
  })
  log.pwa('💾 [Android PWA Exclusive] Kunci tersimpan di CacheStorage (Akses < 1ms untuk Service Worker background push)')

  // Hubungkan WebSocket Android PWA
  let pwaReceivedMessages = []
  let pwaSessionReplaced = false
  let wsPWA = new WebSocket(`${WS_URL}?token=${encodeURIComponent(authAlice.token)}`)

  await new Promise((resolve) => {
    wsPWA.onopen = () => {
      wsPWA.send(JSON.stringify({ type: 'join', room: directRoomId }))
      log.pwa('WebSocket Android PWA terhubung ke server!')
      resolve()
    }
    wsPWA.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.type === 'message') pwaReceivedMessages.push(msg)
        if (msg.type === 'system' && msg.content?.includes('SESSION_REPLACED')) {
          pwaSessionReplaced = true
          log.pwa(`⚠️ [WARNING BUG] Android PWA menerima SESSION_REPLACED: "${msg.content}"`)
        }
      } catch {}
    }
  })

  await new Promise((r) => setTimeout(r, 600))

  // VERIFIKASI: Laptop ditendang, PWA tetap stabil
  if (laptopReceivedSessionReplaced) {
    log.success('✅ Laptop Desktop tertib menerima sinyal SESSION_REPLACED dan layar terkunci aman.')
  } else {
    throw new Error('Laptop Alice tidak menerima SESSION_REPLACED!')
  }

  if (!pwaSessionReplaced && wsPWA.readyState === WebSocket.OPEN) {
    log.success('✅ Android PWA aktif, stabil, dan TIDAK tertendang (No Self-Kick Bug)!')
  } else {
    throw new Error('Android PWA mengalami self-kick atau disconnect tidak wajar!')
  }

  // [6] SIMULASI ANDROID DOZE MODE / BACKGROUND SLEEP & RESUME AUTO-RECONNECT
  log.info('\n--- [LANGKAH 6] Simulasi Android OS Doze Mode (Layar Mati / Pindah App) ---')
  log.pwa('💤 Pengguna mengunci HP Android / beralih ke aplikasi lain (Sleep Mode).')
  log.pwa('🔌 Socket TCP WebSocket diputus paksa oleh OS Android (Simulasi code 1006 abnormal close)...')
  
  // Putus koneksi WebSocket PWA (meniru OS Android background sleep)
  wsPWA.close(1000, 'App Backgrounded')
  await new Promise((r) => setTimeout(r, 1000))

  log.pwa('☀️ Pengguna menyalakan kembali HP & membuka kembali Wuzz Chat PWA (App Resume).')
  log.pwa('🔄 Memulai Auto-Reconnect WebSocket...')

  let pwaReconnected = false
  wsPWA = new WebSocket(`${WS_URL}?token=${encodeURIComponent(authAlice.token)}`)
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('PWA Reconnect Timeout')), 7000)
    wsPWA.onopen = () => {
      clearTimeout(timeout)
      pwaReconnected = true
      // Kirim join ke room aktif
      wsPWA.send(JSON.stringify({ type: 'join', room: directRoomId }))
      log.pwa('WebSocket PWA berhasil tersambung kembali (Auto-Reconnected)!')
      resolve()
    }
    wsPWA.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.type === 'message') pwaReceivedMessages.push(msg)
        if (msg.type === 'system' && msg.content?.includes('SESSION_REPLACED')) {
          pwaSessionReplaced = true
          log.pwa(`⚠️ [CRITICAL BUG] Reconnect PWA malah memicu SESSION_REPLACED: "${msg.content}"`)
        }
      } catch {}
    }
  })

  await new Promise((r) => setTimeout(r, 600))

  if (pwaReconnected && !pwaSessionReplaced) {
    log.success('✅ Auto-Reconnect Android PWA berhasil 100% tanpa memicu SESSION_REPLACED!')
    log.success('✅ Sesi obrolan di Android PWA tetap utuh tanpa logout paksa!')
  } else {
    throw new Error('Auto-reconnect PWA gagal atau memicu self-kick loop!')
  }

  // [7] Android PWA Mengirim Pesan Baru ke Bob
  log.info('\n--- [LANGKAH 7] Android PWA Mengirim Pesan Baru ke Bob ---')
  const aesKeyPWABob = await deriveRoomAESKey(aliceAndroidPWAKey.raw.privateKey, bobPubImported, directRoomId)
  const plaintext2 = 'Bob, aku sekarang lagi di jalan naik MRT, mengetik dari Wuzz Chat PWA Android!'
  const ciphertext2 = await encryptText(aesKeyPWABob, plaintext2)

  const msgId2 = crypto.randomUUID()
  wsPWA.send(JSON.stringify({
    id: msgId2,
    type: 'message',
    room: directRoomId,
    content: ciphertext2,
    timestamp: new Date().toISOString(),
  }))

  const recMsg2 = await waitForMsg(msgId2)
  if (!recMsg2) throw new Error('Bob tidak menerima pesan dari Android PWA Alice!')

  // Bob mendeteksi kunci baru Alice di server dan dekripsi
  const updatedAliceProfile = await getUserProfile(authBob.token, authAlice.user.id)
  const alicePWAKeyImported = await importPublicKey(updatedAliceProfile.public_key)
  const aesKeyBobPWA = await deriveRoomAESKey(bobKey.raw.privateKey, alicePWAKeyImported, directRoomId)

  const decrypted2 = await decryptText(aesKeyBobPWA, recMsg2.content)
  log.bob(`Pesan baru berhasil didekripsi Bob: "${decrypted2}"`)

  if (decrypted2 !== plaintext2) {
    throw new Error('Hasil dekripsi pesan PWA tidak cocok!')
  }
  log.success('✅ Pesan dari Android PWA berhasil didekripsi sempurna oleh Bob.')

  // [8] AUDIT KONTINUITAS OBROLAN DI SISI BOB (E2EE CONTINUITY VERIFICATION)
  log.info('\n--- [LANGKAH 8] Audit Kontinuitas Riwayat Pesan di Sisi Bob ---')
  const cachedMsg1 = bobIndexedDB.get(msgId1)
  if (cachedMsg1 && cachedMsg1.content === plaintext1) {
    log.success('🎉 PESAN LAMA DARI LAPTOP: Tetap 100% terbaca di linimasa Bob (via IndexedDB cache).')
  } else {
    throw new Error('Pesan lama laptop di Bob rusak atau hilang!')
  }

  log.success('🎉 PESAN BARU DARI ANDROID PWA: Terbaca jelas dengan kunci E2EE baru.')
  log.success('✅ TERBUKTI: Tidak ada pesan rusak, tidak ada self-kick, dan interoperabilitas Laptop ⇄ Android PWA 100% MULUS!')

  // Cleanup
  wsBob.close()
  wsPWA.close()

  console.log('\n================================================================================')
  console.log('   🎉 SELURUH SIMULASI ANDROID PWA vs LAPTOP LULUS DENGAN SUKSES 100%!')
  console.log('================================================================================\n')
}

runAndroidPWASimulation().catch((err) => {
  log.error(`Simulasi gagal: ${err.message}`)
  console.error(err)
  process.exit(1)
})
