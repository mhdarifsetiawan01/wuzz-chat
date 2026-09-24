/**
 * test-multiplatform-real-frontend.mjs
 * 
 * Pengujian komprehensif Multi-Platform (PWA Android, Laptop Desktop, iOS Safari)
 * terhadap Frontend Next.js asli (port 3047) dan Backend Go (port 8080).
 */

const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:3047'
const WS_ORIGIN = process.env.WS_ORIGIN || 'ws://localhost:3047/ws'

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
  const timestamp = Date.now()
  const username = `multi_user_${timestamp}`
  const password = 'Password123!'

  // =========================================================================
  // SKENARIO 1: Login & Registrasi dari Laptop Desktop (Browser Chrome)
  // =========================================================================
  log.section('1. Skenario Laptop Desktop Browser (Platform: web)')

  const laptopUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
  const laptopDeviceId = `dev_laptop_${timestamp}`

  log.step('Register via Laptop Desktop Browser (X-Device-Platform: web)')
  let res = await fetch(`${FRONTEND_ORIGIN}/api/auth/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': laptopUA,
      'X-Device-ID': laptopDeviceId,
      'X-Device-Platform': 'web'
    },
    body: JSON.stringify({
      username,
      display_name: 'Multiplatform Tester',
      password,
      device_id: laptopDeviceId,
      platform: 'web'
    })
  })

  if (res.status !== 201) {
    log.fail(`Status register laptop: ${res.status} ${await res.text()}`)
  }
  const laptopData = await res.json()
  const laptopToken = laptopData.token
  const userId = laptopData.user.id
  log.pass(`(User ID: ${userId}, Token: valid)`)

  // Cek daftar device dari Laptop
  log.step('Audit /api/auth/devices (Laptop Desktop)')
  res = await fetch(`${FRONTEND_ORIGIN}/api/auth/devices`, {
    headers: {
      'Authorization': `Bearer ${laptopToken}`,
      'User-Agent': laptopUA
    }
  })
  if (res.status !== 200) log.fail(`Status /devices: ${res.status}`)
  let devicesData = await res.json()
  let devices = devicesData.devices || devicesData
  const laptopDevice = devices.find(d => d.id === laptopDeviceId)
  if (!laptopDevice) log.fail('Device laptop tidak ditemukan di daftar devices!')
  if (laptopDevice.platform !== 'web') {
    log.fail(`Expected platform 'web', got '${laptopDevice.platform}'`)
  }
  log.pass(`(Platform: "${laptopDevice.platform}", Name: "${laptopDevice.name}")`)

  // =========================================================================
  // SKENARIO 2: Login dari PWA Android (Handphone Samsung Galaxy S24)
  // =========================================================================
  log.section('2. Skenario Mobile PWA Android (Platform: android)')

  const androidUA = 'Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36'
  const androidDeviceId = `dev_android_pwa_${timestamp}`

  log.step('Login via PWA Android (X-Device-Platform: android)')
  res = await fetch(`${FRONTEND_ORIGIN}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': androidUA,
      'X-Device-ID': androidDeviceId,
      'X-Device-Platform': 'android'
    },
    body: JSON.stringify({
      username,
      password,
      device_id: androidDeviceId,
      platform: 'android'
    })
  })

  if (res.status !== 200) {
    log.fail(`Status login PWA Android: ${res.status} ${await res.text()}`)
  }
  const androidData = await res.json()
  const androidToken = androidData.token
  log.pass(`(PWA Android berhasil login, Device: ${androidDeviceId})`)

  // Cek daftar device pasca PWA login
  log.step('Audit /api/auth/devices (Kedua Perangkat Aktif Bersamaan)')
  res = await fetch(`${FRONTEND_ORIGIN}/api/auth/devices`, {
    headers: {
      'Authorization': `Bearer ${androidToken}`,
      'User-Agent': androidUA
    }
  })
  if (res.status !== 200) log.fail(`Status /devices: ${res.status}`)
  devicesData = await res.json()
  devices = devicesData.devices || devicesData

  const pwaDevice = devices.find(d => d.id === androidDeviceId)
  if (!pwaDevice) log.fail('Device Android PWA tidak ditemukan di daftar devices!')
  if (pwaDevice.platform !== 'android') {
    log.fail(`Expected platform 'android', got '${pwaDevice.platform}'`)
  }
  log.pass(`(PWA Device: "${pwaDevice.name}", Platform: "${pwaDevice.platform}", Total aktif: ${devices.length})`)

  // =========================================================================
  // SKENARIO 3: Deteksi Auto Platform via User-Agent iOS iPhone
  // =========================================================================
  log.section('3. Skenario iOS Safari / iPhone PWA (Auto-Detection Fallback)')

  const iosUA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
  const iosUsername = `ios_user_${timestamp}`
  const iosDeviceId = `dev_iphone_${timestamp}`

  log.step('Register iPhone tanpa parameter platform eksplisit (Murni User-Agent)')
  res = await fetch(`${FRONTEND_ORIGIN}/api/auth/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': iosUA,
      'X-Device-ID': iosDeviceId
    },
    body: JSON.stringify({
      username: iosUsername,
      display_name: 'iPhone User',
      password,
      device_id: iosDeviceId
    })
  })

  if (res.status !== 201) log.fail(`Status register iOS: ${res.status}`)
  const iosData = await res.json()
  const iosToken = iosData.token

  log.step('Audit Auto-Detection Platform iOS di /api/auth/devices')
  res = await fetch(`${FRONTEND_ORIGIN}/api/auth/devices`, {
    headers: {
      'Authorization': `Bearer ${iosToken}`,
      'User-Agent': iosUA
    }
  })
  devicesData = await res.json()
  devices = devicesData.devices || devicesData
  const iosDevice = devices.find(d => d.id === iosDeviceId)
  if (!iosDevice) log.fail('Device iPhone tidak ditemukan!')
  if (iosDevice.platform !== 'ios') {
    log.fail(`Expected auto-detected platform 'ios', got '${iosDevice.platform}'`)
  }
  log.pass(`(Platform: "${iosDevice.platform}", Name: "${iosDevice.name}")`)

  // =========================================================================
  // SKENARIO 4: Push Notification Subscriptions Multi-Platform
  // =========================================================================
  log.section('4. Pengujian Push Notification Multi-Platform (/api/notifications/subscribe)')

  // 4.1 Subscription Android (Native FCM Token)
  log.step('Register Push Subscription Android (FCM Token)')
  res = await fetch(`${FRONTEND_ORIGIN}/api/notifications/subscribe`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${androidToken}`
    },
    body: JSON.stringify({
      platform: 'android',
      endpoint: `fcm_device_registration_token_${timestamp}`,
      keys: { p256dh: '', auth: '' }
    })
  })
  if (res.status !== 200) log.fail(`Status sub android: ${res.status}`)
  log.pass('(200 OK — FCM Android Subscription diterima)')

  // 4.2 Subscription Laptop (Web Push VAPID)
  log.step('Register Push Subscription Web Laptop (Standard VAPID)')
  res = await fetch(`${FRONTEND_ORIGIN}/api/notifications/subscribe`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${laptopToken}`
    },
    body: JSON.stringify({
      platform: 'web',
      endpoint: `https://fcm.googleapis.com/fcm/send/sub_web_${timestamp}`,
      keys: {
        p256dh: 'BN1F_fake_p256dh_key_base64_sample_xyz==',
        auth: 'fake_auth_key_1234=='
      }
    })
  })
  if (res.status !== 200) log.fail(`Status sub web: ${res.status}`)
  log.pass('(200 OK — WebPush VAPID Subscription diterima)')

  // =========================================================================
  // SKENARIO 5: Koneksi WebSocket Multi-Perangkat Serentak
  // =========================================================================
  log.section('5. WebSocket Live Multi-Device Connect & Chat')

  log.step('Buat Direct Conversation via POST /api/conversations')
  res = await fetch(`${FRONTEND_ORIGIN}/api/conversations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${laptopToken}`
    },
    body: JSON.stringify({ target_user_id: iosData.user.id })
  })
  if (res.status !== 200) log.fail(`Gagal buat conversation: ${res.status}`)
  const convData = await res.json()
  const testRoomId = convData.room_id
  log.pass(`(Room ID: ${testRoomId})`)

  log.step('Hubungkan WebSocket Android PWA')
  const wsAndroid = new WebSocket(`${WS_ORIGIN}?token=${encodeURIComponent(androidToken)}`)
  await new Promise((resolve, reject) => {
    wsAndroid.onopen = resolve
    wsAndroid.onerror = () => reject(new Error('WebSocket android connection failed'))
    setTimeout(() => reject(new Error('WebSocket android connection timeout')), 4000)
  })
  log.pass('(Android PWA connected via 101 Switching Protocols)')

  log.step('Hubungkan WebSocket iPhone / iOS Safari')
  const wsIOS = new WebSocket(`${WS_ORIGIN}?token=${encodeURIComponent(iosToken)}`)
  await new Promise((resolve, reject) => {
    wsIOS.onopen = resolve
    wsIOS.onerror = () => reject(new Error('WebSocket iOS connection failed'))
    setTimeout(() => reject(new Error('WebSocket iOS connection timeout')), 4000)
  })
  log.pass('(iPhone Safari connected via 101 Switching Protocols)')

  // Bergabung ke room yang sah
  wsAndroid.send(JSON.stringify({ type: 'join', room: testRoomId }))
  wsIOS.send(JSON.stringify({ type: 'join', room: testRoomId }))
  await new Promise(r => setTimeout(r, 400))

  log.step('Kirim Pesan Realtime dari Android PWA -> Terima di iPhone iOS')
  const msgPromise = new Promise((resolve) => {
    wsIOS.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data.toString())
        if (msg.type === 'message' && msg.content?.includes('PWA Android')) {
          resolve(msg)
        }
      } catch {}
    }
  })

  wsAndroid.send(JSON.stringify({
    id: `msg_pwa_${timestamp}`,
    type: 'message',
    room: testRoomId,
    content: 'Halo iPhone! Ini pesan live dari PWA Android Samsung Galaxy S24.',
    timestamp: new Date().toISOString()
  }))

  const receivedMsg = await Promise.race([
    msgPromise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout terima pesan PWA di iPhone')), 4000))
  ])

  log.pass(`(Pesan diterima di iPhone: "${receivedMsg.content}")`)

  // Tutup koneksi
  wsAndroid.close()
  wsIOS.close()

  console.log('\n\x1b[32m\x1b[1m=== ✅ PENGUJIAN FRONTEND MULTI-PLATFORM ASLI LULUS 100%! ===\x1b[0m\n')
}

run().catch((err) => {
  console.error('\n\x1b[31m❌ Pengujian Multi-Platform Gagal:\x1b[0m', err)
  process.exit(1)
})
