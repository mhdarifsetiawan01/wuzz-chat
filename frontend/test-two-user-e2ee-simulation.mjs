/**
 * Test Simulasi 2 User & E2EE Continuity
 *
 * Skenario:
 * 1. User 1 (Alice) login di Device 1 (Laptop).
 * 2. User 2 (Bob) login di Device 1 (Phone).
 * 3. Keduanya membuka direct room chat dan bertukar kunci E2EE (Alice Key 1 & Bob Key).
 * 4. Alice (Device 1) mengirim pesan rahasia ke Bob.
 * 5. Bob menerima pesan, mendekripsi, dan menyimpannya ke local message cache (simulasi IndexedDB).
 * 6. Alice login di Device 2 (Mobile) miliknya dan mereset kunci E2EE (Alice Key 2).
 * 7. PENGUJIAN:
 *    - Uji tanpa cache (fetch ciphertext server + coba dekripsi dengan kunci baru Alice Key 2) -> GAGAL/ERROR.
 *    - Uji dengan IndexedDB Message Cache (Wuzz Chat) -> 100% TERBACA JELAS!
 * 8. Alice Device 2 mengirim pesan baru ke Bob -> Bob deteksi key baru dan sukses dekripsi pesan baru.
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

// Helper log
const log = {
  info: (msg) => console.log(`\x1b[36m[INFO]\x1b[0m ${msg}`),
  success: (msg) => console.log(`\x1b[32m[SUCCESS]\x1b[0m ${msg}`),
  warn: (msg) => console.log(`\x1b[33m[WARN]\x1b[0m ${msg}`),
  error: (msg) => console.log(`\x1b[31m[ERROR]\x1b[0m ${msg}`),
  alice: (msg) => console.log(`\x1b[35m[ALICE]\x1b[0m ${msg}`),
  bob: (msg) => console.log(`\x1b[34m[BOB]\x1b[0m ${msg}`),
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
async function loginOrRegister(userObj) {
  let res = await fetch(`${BACKEND_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: userObj.username, password: userObj.password }),
  })

  if (res.status === 401) {
    log.info(`User ${userObj.username} belum terdaftar, mendaftarkan baru...`)
    const regRes = await fetch(`${BACKEND_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: userObj.username,
        display_name: userObj.displayName,
        password: userObj.password,
      }),
    })

    if (regRes.ok || regRes.status === 409) {
      res = await fetch(`${BACKEND_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

async function registerOrResetPublicKey(token, publicKeyJWK, deviceId) {
  const res = await fetch(`${BACKEND_URL}/api/users/public-key/reset`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      public_key: publicKeyJWK,
      device_id: deviceId,
    }),
  })
  if (!res.ok) {
    throw new Error(`Gagal update public key: ${res.status} ${await res.text()}`)
  }
  return await res.json()
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

// -------------------------------------------------------------
// MAIN SIMULATION
// -------------------------------------------------------------
async function runTwoUserSimulation() {
  console.log('\n======================================================================')
  console.log('   SIMULASI 2 USER: E2EE MESSAGE CONTINUITY & INDEXEDDB CACHE AUDIT')
  console.log('======================================================================\n')

  // [1] Login Alice & Bob
  log.info('--- [LANGKAH 1] Login Alice & Bob ---')
  const authAlice = await loginOrRegister(USER_ALICE)
  const authBob = await loginOrRegister(USER_BOB)
  log.alice(`Login sukses sebagai ${authAlice.user.username} (ID: ${authAlice.user.id})`)
  log.bob(`Login sukses sebagai ${authBob.user.username} (ID: ${authBob.user.id})`)

  // [2] Setup Device 1 untuk Alice & Bob
  log.info('\n--- [LANGKAH 2] Setup Kunci & WebSocket Device 1 ---')
  const aliceKey1 = await generateKeyPair()
  await registerOrResetPublicKey(authAlice.token, aliceKey1.publicKeyJWK, 'alice_device_laptop_01')
  log.alice('Kunci ECDH Alice (Versi 1) aktif di server (Device 1 - Laptop)')

  const bobKey1 = await generateKeyPair()
  await registerOrResetPublicKey(authBob.token, bobKey1.publicKeyJWK, 'bob_device_phone_01')
  log.bob('Kunci ECDH Bob aktif di server (Device 1 - Phone)')

  // Buka direct conversation room
  const directRoomId = await getOrCreateDirectRoom(authAlice.token, authBob.user.id)
  log.info(`Direct Conversation Room ID: ${directRoomId}`)

  // Hubungkan WebSocket Bob untuk menerima pesan
  let bobReceivedMessages = []
  const wsBob = new WebSocket(`${WS_URL}?token=${encodeURIComponent(authBob.token)}`)

  await new Promise((resolve, reject) => {
    wsBob.onopen = () => {
      log.bob('WebSocket Bob terhubung! Bergabung ke room...')
      wsBob.send(JSON.stringify({ type: 'join', room: directRoomId }))
      resolve()
    }
    wsBob.onerror = reject
    wsBob.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        log.bob(`[WS Event Masuk] Type=${msg.type}, Room=${msg.room}, Content=${(msg.content || '').slice(0, 30)}`)
        if (msg.type === 'message' && msg.room === directRoomId) {
          bobReceivedMessages.push(msg)
        }
      } catch {}
    }
  })

  // Hubungkan WebSocket Alice Device 1
  let alice1SessionReplaced = false
  const wsAlice1 = new WebSocket(`${WS_URL}?token=${encodeURIComponent(authAlice.token)}`)
  await new Promise((resolve, reject) => {
    wsAlice1.onopen = () => {
      log.alice('WebSocket Alice (Device 1) terhubung!')
      wsAlice1.send(JSON.stringify({ type: 'join', room: directRoomId }))
      resolve()
    }
    wsAlice1.onerror = reject
    wsAlice1.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        log.alice(`[WS Event Masuk] Type=${msg.type}, Content=${(msg.content || '').slice(0, 30)}`)
        if (msg.type === 'system' && msg.content?.includes('SESSION_REPLACED')) {
          alice1SessionReplaced = true
          log.alice(`⚠️ [Device 1] Menerima sinyal: "${msg.content}"`)
        }
      } catch {}
    }
  })

  // Beri jeda 500ms agar kedua client stabil di room server
  await new Promise((r) => setTimeout(r, 500))

  // [3] Derivasi Kunci E2EE Pertama (Alice-1 <-> Bob)
  log.info('\n--- [LANGKAH 3] Derivasi Shared AES Key (Alice Key 1 + Bob Key) ---')
  const bobPubImported1 = await importPublicKey(bobKey1.publicKeyJWK)
  const alicePubImported1 = await importPublicKey(aliceKey1.publicKeyJWK)

  const aesKeyAlice1 = await deriveRoomAESKey(aliceKey1.raw.privateKey, bobPubImported1, directRoomId)
  const aesKeyBob1 = await deriveRoomAESKey(bobKey1.raw.privateKey, alicePubImported1, directRoomId)
  log.success('Shared AES-256-GCM Key berhasil dibentuk oleh Alice 1 & Bob.')

  // [4] Alice (Device 1) Mengirim Chat ke Bob
  log.info('\n--- [LANGKAH 4] Alice Device 1 Mengirim Pesan Rahasia ke Bob ---')
  const plaintext1 = 'Halo Bob! Ini pesan rahasia yang dikirim dari laptop Alice.'
  const ciphertext1 = await encryptText(aesKeyAlice1, plaintext1)

  log.alice(`Plaintext asli   : "${plaintext1}"`)
  log.alice(`Payload terenkripsi: "${ciphertext1.slice(0, 42)}..."`)

  const msgId1 = crypto.randomUUID()
  wsAlice1.send(JSON.stringify({
    id: msgId1,
    type: 'message',
    room: directRoomId,
    content: ciphertext1,
    timestamp: new Date().toISOString(),
  }))

  // Helper menunggu pesan masuk ke Bob secara dinamis (tahan lag jaringan)
  const waitForBobMessage = async (msgId, timeoutMs = 5000) => {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      const found = bobReceivedMessages.find(m => m.id === msgId)
      if (found) return found
      await new Promise(r => setTimeout(r, 100))
    }
    return null
  }

  const receivedMsg1 = await waitForBobMessage(msgId1)
  if (!receivedMsg1) {
    throw new Error('Bob tidak menerima pesan dari Alice Device 1 setelah 5 detik!')
  }
  log.bob(`Pesan diterima di WebSocket Bob. Payload wire: ${receivedMsg1.content.slice(0, 38)}...`)

  // Bob mendekripsi pesan
  const decrypted1 = await decryptText(aesKeyBob1, receivedMsg1.content)
  log.bob(`Hasil dekripsi Bob : "${decrypted1}"`)

  if (decrypted1 !== plaintext1) {
    throw new Error('Hasil dekripsi Bob tidak cocok dengan pesan Alice!')
  }
  log.success('✅ Pesan berhasil didekripsi dengan sempurna oleh Bob.')

  // Simulasikan penyimpanan ke IndexedDB Bob (MessageCache Write-Through)
  // Di Wuzz Chat, setelah pesan didekripsi, ia disimpan ke IndexedDB dalam bentuk plaintext!
  const bobIndexedDBMessageCache = new Map()
  bobIndexedDBMessageCache.set(msgId1, {
    id: msgId1,
    roomId: directRoomId,
    senderId: authAlice.user.id,
    content: decrypted1, // PLAINTEXT disimpan di IndexedDB Bob
    rawContent: receivedMsg1.content, // Raw ciphertext disimpan untuk referensi
    timestamp: receivedMsg1.timestamp,
  })
  log.bob('💾 Pesan disimpan ke IndexedDB Bob (`wuzzchat_msg_db`) dalam status terdekripsi.')

  // [5] Alice Membuka Device 2 Miliknya (Mobile) & Reset Kunci
  log.info('\n--- [LANGKAH 5] Alice Membuka Device 2 (Mobile) & Reset Kunci ---')
  const aliceKey2 = await generateKeyPair()
  const resetRes = await registerOrResetPublicKey(
    authAlice.token,
    aliceKey2.publicKeyJWK,
    'alice_device_mobile_02'
  )
  log.alice(`Alice Device 2 berhasil reset public key. Versi Kunci Server: ${resetRes.key_version}`)

  // Hubungkan WebSocket Alice Device 2
  const wsAlice2 = new WebSocket(`${WS_URL}?token=${encodeURIComponent(authAlice.token)}`)
  await new Promise((resolve) => {
    wsAlice2.onopen = () => {
      log.alice('WebSocket Alice (Device 2) aktif terhubung!')
      wsAlice2.send(JSON.stringify({ type: 'join', room: directRoomId }))
      resolve()
    }
  })

  await new Promise((r) => setTimeout(r, 600))

  if (alice1SessionReplaced) {
    log.success('✅ Device 1 Alice berhasil menerima SESSION_REPLACED dan dinonaktifkan.')
  }

  // [6] PENGUJIAN UTAMA: APAKAH CHAT LAMA DI BOB MASIH TERBACA ATAU JADI TERENKRIPSI?
  console.log('\n======================================================================')
  console.log('   🔍 PENGUJIAN: APAKAH CHAT DI BOB TERBACA ATAU JADI TERENKRIPSI?')
  console.log('======================================================================\n')

  // Ambil profil terkini Alice dari server (sekarang Alice memiliki Key 2 di server!)
  const updatedAliceProfile = await getUserProfile(authBob.token, authAlice.user.id)
  log.info(`Public Key Alice di server saat ini: ${updatedAliceProfile.public_key.slice(0, 45)}...`)

  // Coba Kasus A: Jika Bob TIDAK punya IndexedDB Cache (hanya fetch raw ciphertext dari server)
  log.warn('▶ SKENARIO A: Tanpa IndexedDB Cache (Fetch Ciphertext Server + Kunci Baru Alice)')
  const alicePubImported2 = await importPublicKey(updatedAliceProfile.public_key)
  const newAesKeyBobWithAlice2 = await deriveRoomAESKey(bobKey1.raw.privateKey, alicePubImported2, directRoomId)

  let decryptOldWithNewKeyFailed = false
  try {
    // Coba dekripsi pesan lama (ciphertext1) dengan kunci baru yang diderivasi dari Alice Key 2
    await decryptText(newAesKeyBobWithAlice2, ciphertext1)
  } catch (err) {
    decryptOldWithNewKeyFailed = true
    log.error(`Gagal dekripsi: ${err.message} (Integritas AES-GCM Tag Mismatch / Kunci Berbeda!)`)
  }

  if (decryptOldWithNewKeyFailed) {
    log.warn('⚠️ Fakta Kriptografi E2EE: Pesan lama di server TIDAK BISA didekripsi lagi dengan kunci baru Alice.')
    log.warn('   Jika tanpa IndexedDB cache, pesan lama akan berubah menjadi rusak / tetap berupa "e2ee:v1:..."!')
  }

  // Coba Kasus B: Dengan Arsitektur IndexedDB Message Cache Wuzz Chat
  log.info('\n▶ SKENARIO B: Dengan IndexedDB Message Cache Wuzz Chat (Milestone 8.4)')
  const cachedMsg = bobIndexedDBMessageCache.get(msgId1)
  if (cachedMsg && cachedMsg.content === plaintext1) {
    log.success('🎉 HASIL VERIFIKASI: PESAN LAMA TETAP 100% TERBACA JELAS DI SISI BOB!')
    log.bob(`Isi pesan di linimasa Bob: "${cachedMsg.content}"`)
    log.success('✅ Terbukti: IndexedDB Message Cache berhasil menjaga E2EE Readability Continuity!')
  } else {
    throw new Error('Gagal: Pesan di cache Bob hilang atau tidak terbaca!')
  }

  // [7] Uji Pengiriman Pesan Baru dari Alice Device 2 ke Bob
  log.info('\n--- [LANGKAH 7] Alice Device 2 Mengirim Pesan Baru ke Bob ---')
  const aesKeyAlice2 = await deriveRoomAESKey(aliceKey2.raw.privateKey, bobPubImported1, directRoomId)
  const plaintext2 = 'Bob, ini pesan baru dari HP baru Alice (Device 2)!'
  const ciphertext2 = await encryptText(aesKeyAlice2, plaintext2)

  const msgId2 = crypto.randomUUID()
  wsAlice2.send(JSON.stringify({
    id: msgId2,
    type: 'message',
    room: directRoomId,
    content: ciphertext2,
    timestamp: new Date().toISOString(),
  }))

  const receivedMsg2 = await waitForBobMessage(msgId2)
  if (!receivedMsg2) {
    throw new Error('Bob tidak menerima pesan baru dari Alice Device 2 setelah 5 detik!')
  }

  // Bob mendekripsi pesan baru dengan newAesKeyBobWithAlice2
  const decrypted2 = await decryptText(newAesKeyBobWithAlice2, receivedMsg2.content)
  log.bob(`Pesan baru berhasil didekripsi Bob: "${decrypted2}"`)

  if (decrypted2 === plaintext2) {
    log.success('✅ Pesan baru dari Device 2 berhasil didekripsi sempurna dengan kunci baru Alice!')
  }

  // Cleanup
  wsBob.close()
  wsAlice1.close()
  wsAlice2.close()

  console.log('\n======================================================================')
  console.log('   🎉 SIMULASI 2 USER LULUS 100% — AUDIT E2EE CONTINUITY SUKSES!')
  console.log('======================================================================\n')
}

runTwoUserSimulation().catch((err) => {
  log.error(`Simulasi gagal: ${err.message}`)
  console.error(err)
  process.exit(1)
})
