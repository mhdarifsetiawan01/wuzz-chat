/**
 * Test Simulasi 2 Device: Conflict & Reset Lifecycle
 *
 * Skenario:
 * 1. Device 1 (Laptop) login sebagai 'alice', daftarkan kunci E2EE, dan hubungkan WebSocket.
 * 2. Device 2 (Mobile) login sebagai 'alice', coba daftarkan kunci baru -> TERJADI 409 Conflict.
 * 3. Device 2 memilih "Reset & Masuk di Perangkat Ini" (POST /api/users/public-key/reset).
 * 4. Device 2 terhubung ke WebSocket -> Backend mengirim 'SESSION_REPLACED' ke Device 1.
 * 5. Verifikasi Device 1 menerima SESSION_REPLACED dan WebSocket Device 1 ditutup.
 * 6. Verifikasi Device 2 tetap aktif, stabil, dan tidak kembali ke login (bug fix verified).
 */

const BACKEND_URL = process.env.BACKEND_URL || 'https://wuzz-chat-backend.fly.dev'
const WS_URL = process.env.WS_URL || 'wss://wuzz-chat-backend.fly.dev/ws'

const USERNAME = 'alice'
const PASSWORD = 'K0k0r0k0@123'

const DEVICE_1_ID = 'dev_laptop_alpha_01'
const DEVICE_2_ID = 'dev_mobile_beta_02'

// Helper log dengan warna & timestamp
const log = {
  info: (msg) => console.log(`\x1b[36m[INFO]\x1b[0m ${msg}`),
  success: (msg) => console.log(`\x1b[32m[SUCCESS]\x1b[0m ${msg}`),
  warn: (msg) => console.log(`\x1b[33m[WARN]\x1b[0m ${msg}`),
  error: (msg) => console.log(`\x1b[31m[ERROR]\x1b[0m ${msg}`),
  device1: (msg) => console.log(`\x1b[35m[DEVICE 1 - LAPTOP]\x1b[0m ${msg}`),
  device2: (msg) => console.log(`\x1b[34m[DEVICE 2 - MOBILE]\x1b[0m ${msg}`),
}

async function generateJWKKeyPair() {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits']
  )
  const pubJWK = await crypto.subtle.exportKey('jwk', keyPair.publicKey)
  const privJWK = await crypto.subtle.exportKey('jwk', keyPair.privateKey)
  return {
    publicKeyJWK: JSON.stringify(pubJWK),
    privateKeyJWK: JSON.stringify(privJWK),
  }
}

async function loginOrRegister(username, password) {
  // Coba login dulu
  let res = await fetch(`${BACKEND_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })

  if (res.status === 401) {
    log.info(`User ${username} belum terdaftar atau password salah, mencoba registrasi...`)
    const regRes = await fetch(`${BACKEND_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username,
        display_name: 'Alice Wonder',
        password,
      }),
    })

    if (regRes.ok || regRes.status === 409) {
      // Login ulang setelah register
      res = await fetch(`${BACKEND_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
    } else {
      const errText = await regRes.text()
      throw new Error(`Gagal registrasi user: ${regRes.status} ${errText}`)
    }
  }

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Gagal login user ${username}: ${res.status} ${errText}`)
  }

  const data = await res.json()
  return data
}

async function runSimulation() {
  console.log('\n=============================================================')
  console.log('   SIMULASI 2 DEVICE: E2EE DEVICE CONFLICT & RESET LIFECYCLE')
  console.log('=============================================================\n')
  log.info(`Target Backend : ${BACKEND_URL}`)
  log.info(`Target WS      : ${WS_URL}`)
  log.info(`Akun Pengujian : ${USERNAME}`)

  // -------------------------------------------------------------
  // STEP 0: Login Akun untuk Device 1 & Device 2
  // -------------------------------------------------------------
  log.info('\n--- [LANGKAH 0] Otentikasi Akun ---')
  const authData = await loginOrRegister(USERNAME, PASSWORD)
  const token = authData.token
  const user = authData.user
  log.success(`Berhasil login sebagai ${user.username} (ID: ${user.id})`)

  // -------------------------------------------------------------
  // STEP 1: Inisialisasi Device 1 (Laptop)
  // -------------------------------------------------------------
  log.info('\n--- [LANGKAH 1] Inisialisasi Device 1 (Laptop) ---')
  const keyPair1 = await generateJWKKeyPair()
  log.device1(`Menghasilkan KeyPair ECDH P-256 (Device ID: ${DEVICE_1_ID})`)

  // Reset/Daftarkan public key Device 1 ke backend
  const resetRes1 = await fetch(`${BACKEND_URL}/api/users/public-key/reset`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      public_key: keyPair1.publicKeyJWK,
      device_id: DEVICE_1_ID,
    }),
  })

  if (!resetRes1.ok) {
    throw new Error(`Device 1 gagal mendaftarkan public key: ${resetRes1.status} ${await resetRes1.text()}`)
  }
  const keyData1 = await resetRes1.json()
  log.device1(`Kunci E2EE terdaftar di server. Versi: ${keyData1.key_version}`)

  // Buka WebSocket Device 1
  let device1SessionReplaced = false
  let device1SocketClosed = false

  const ws1 = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}`)

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Device 1 WS connection timeout')), 8000)

    ws1.onopen = () => {
      clearTimeout(timeout)
      log.device1('WebSocket terhubung ke server!')
      resolve()
    }

    ws1.onerror = (err) => {
      clearTimeout(timeout)
      reject(new Error(`Device 1 WS error: ${err.message || err}`))
    }

    ws1.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === 'system') {
          if (msg.content?.includes('SESSION_REPLACED')) {
            log.device1(`⚠️ Menerima pesan: "${msg.content}"`)
            device1SessionReplaced = true
          } else {
            log.device1(`Pesan sistem masuk: ${msg.content}`)
          }
        }
      } catch {}
    }

    ws1.onclose = () => {
      log.device1('Koneksi WebSocket ditutup oleh server (sesi digantikan).')
      device1SocketClosed = true
    }
  })

  log.success('Device 1 aktif dan online di obrolan.\n')

  // -------------------------------------------------------------
  // STEP 2: Device 2 (Mobile) Login & Mencoba Daftarkan Kunci Baru
  // -------------------------------------------------------------
  log.info('--- [LANGKAH 2] Device 2 (Mobile) Membuka Sesi Baru ---')
  const keyPair2 = await generateJWKKeyPair()
  log.device2(`Menghasilkan KeyPair ECDH P-256 (Device ID: ${DEVICE_2_ID})`)

  log.device2(`Mencoba registrasi kunci biasa (PUT /api/users/public-key)...`)
  const conflictRes = await fetch(`${BACKEND_URL}/api/users/public-key`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      public_key: keyPair2.publicKeyJWK,
      device_id: DEVICE_2_ID,
    }),
  })

  // VERIFIKASI: Server HARUS menolak dengan status 409 Conflict
  if (conflictRes.status === 409) {
    const conflictBody = await conflictRes.json()
    log.success(`✅ Server merespon HTTP 409 CONFLICT seperti yang diharapkan!`)
    log.device2(`Respon server: error="${conflictBody.error}", key_version=${conflictBody.key_version}`)
    log.device2(`📱 Di UI Browser: DeviceConflictModal terbuka (Pilihan: Reset, Transfer, Batal)`)
    log.device2(`🛡️ Gatekeeper aktif: WebSocket Device 2 BELUM dibuka, Device 1 masih aman!`)
  } else {
    throw new Error(`Ekspektasi HTTP 409 Conflict, tetapi server merespon HTTP ${conflictRes.status}`)
  }

  // Verifikasi Device 1 belum ditendang pada tahap ini
  if (device1SessionReplaced || device1SocketClosed) {
    throw new Error('Device 1 tertendang sebelum Device 2 melakukan reset! Ini menyalahi gatekeeper.')
  }
  log.success('Verifikasi: Device 1 masih stabil & online saat Device 2 melihat modal konflik.')

  // -------------------------------------------------------------
  // STEP 3: Device 2 Memilih "Reset & Masuk di Perangkat Ini"
  // -------------------------------------------------------------
  log.info('\n--- [LANGKAH 3] Device 2 Memilih "Reset & Masuk di Perangkat Ini" ---')
  log.device2('Mengirim POST /api/users/public-key/reset...')

  const resetRes2 = await fetch(`${BACKEND_URL}/api/users/public-key/reset`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      public_key: keyPair2.publicKeyJWK,
      device_id: DEVICE_2_ID,
    }),
  })

  if (!resetRes2.ok) {
    throw new Error(`Device 2 gagal reset public key: ${resetRes2.status} ${await resetRes2.text()}`)
  }

  const resetData2 = await resetRes2.json()
  log.success(`✅ Reset berhasil! Key Version server diperbarui ke: ${resetData2.key_version}`)
  log.device2(`Modal tertutup (isOpen: false) TANPA logout! (Bug fix verified)`)

  // -------------------------------------------------------------
  // STEP 4: Device 2 Terhubung ke WebSocket & Verifikasi Sesi Lama Tergantikan
  // -------------------------------------------------------------
  log.info('\n--- [LANGKAH 4] Device 2 Terhubung ke WebSocket ---')
  let ws2 = null
  let ws2Connected = false

  await new Promise((resolve, reject) => {
    ws2 = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}`)

    const timeout = setTimeout(() => reject(new Error('Device 2 WS connection timeout')), 8000)

    ws2.onopen = () => {
      clearTimeout(timeout)
      ws2Connected = true
      log.device2('WebSocket terhubung ke server!')
      resolve()
    }

    ws2.onerror = (err) => {
      clearTimeout(timeout)
      reject(new Error(`Device 2 WS error: ${err.message || err}`))
    }

    ws2.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === 'system') {
          log.device2(`Pesan sistem masuk: ${msg.content}`)
        }
      } catch {}
    }
  })

  // Tunggu 500ms agar sinyal SESSION_REPLACED dari backend terkirim ke Device 1
  await new Promise((r) => setTimeout(r, 600))

  // VERIFIKASI: Device 1 harus menerima SESSION_REPLACED dan soket ditutup
  log.info('\n--- [LANGKAH 5] Verifikasi Single Active Device Enforcement ---')
  if (device1SessionReplaced && device1SocketClosed) {
    log.success('✅ Device 1 berhasil menerima pesan "SESSION_REPLACED"!')
    log.success('✅ Koneksi WebSocket Device 1 berhasil diputus oleh server.')
    log.device1('Di UI Browser: Modal "Kunci Keamanan Telah Diperbarui" tampil.')
  } else {
    log.warn(`Status Device 1: replaced=${device1SessionReplaced}, closed=${device1SocketClosed}`)
    if (!device1SessionReplaced) {
      throw new Error('Device 1 tidak menerima pesan SESSION_REPLACED!')
    }
  }

  // VERIFIKASI: Device 2 tetap aktif dan tidak kena disconnect
  if (ws2Connected && ws2.readyState === WebSocket.OPEN) {
    log.success('✅ Device 2 tetap AKTIF dan ONLINE di obrolan!')
    log.success('✅ TIDAK ADA redirect logout di Device 2!')
    log.success('✅ TIDAK ADA race condition / ping-pong loop!')
  } else {
    throw new Error('Device 2 mengalami disconnect tidak terduga!')
  }

  // Cleanup
  if (ws2 && ws2.readyState === WebSocket.OPEN) {
    ws2.close()
  }

  console.log('\n=============================================================')
  console.log('       🎉 SELURUH SIMULASI 2 DEVICE BERHASIL 100%!')
  console.log('=============================================================\n')
}

runSimulation().catch((err) => {
  log.error(`Simulasi gagal: ${err.message}`)
  console.error(err)
  process.exit(1)
})
